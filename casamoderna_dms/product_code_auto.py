"""Primary product code automation.

Format:
    <4-digit item-group-ref>-<3-char supplier-ref>-<5-digit sequence>
Example:
    0301-MIL-00001

Policy:
- Applies only to Primary products (cm_product_type == "Primary").
- Secondary products are never modified by this module.
- On create, blank/TMP item codes are replaced automatically.
"""
from __future__ import annotations

import re

import frappe
from frappe.model.naming import getseries


PRODUCT_CODE_RE = re.compile(r"^\d{4}-[A-Z0-9]{3}-\d{5}$")
LEGACY_PRODUCT_CODE_RE = re.compile(r"^(\d{4})-([A-Z0-9]{3})-(\d{4})$")
LEGACY_CONSIGNMENT_ITEM_RE = re.compile(r"^\d{6}$")
SUPPLIER_REF_RE = re.compile(r"^[A-Z0-9]{3}$")

# Fallback mapping for existing Item Group names that are not prefixed with 4-digit refs.
GROUP_REF_BY_NAME = {
    "living area": "0100",
    "bedroom": "0200",
    "bedrooms": "0200",
    "dining room": "0300",
    "kitchen & utility": "0400",
    "kitchen and utility": "0400",
    "home office": "0500",
    "kids bedrooms & child care": "0600",
    "kids bedrooms and child care": "0600",
    "bathroom furniture": "0700",
    "outdoor furniture": "0800",
    "walkin storage & organisation": "0900",
    "walk-in storage & organisation": "0900",
    "walkin storage and organisation": "0900",
    "walk-in storage and organisation": "0900",
    "custom & projects": "1000",
    "custom and projects": "1000",
    "accessories & decor": "1100",
    "accessories and decor": "1100",
    "tiles": "1200",
    "dining tables": "0301",
    "dining chairs": "0302",
    "sofas and armchairs": "0101",
}


def _is_primary(doc) -> bool:
    return (getattr(doc, "cm_product_type", None) or "").strip() == "Primary"


def _extract_group_ref(group_name: str) -> str | None:
    m = re.match(r"^(\d{4})\b", (group_name or "").strip())
    return m.group(1) if m else None


def _resolve_group_ref(item_group: str) -> str:
    current = (item_group or "").strip()
    if not current:
        frappe.throw("Item Group is required to generate Product Code.")

    # Walk up Item Group parents until we find a 4-digit prefix.
    for _ in range(20):
        found = _extract_group_ref(current)
        if found:
            return found

        mapped = GROUP_REF_BY_NAME.get(current.strip().lower())
        if mapped:
            return mapped

        parent = frappe.db.get_value("Item Group", current, "parent_item_group")
        if not parent or parent == current:
            break
        current = parent

    frappe.throw(
        f"Item Group '{item_group}' must be under a coded group (e.g. 0300/0301) to auto-generate Product Code."
    )


def _normalise_supplier_ref(value: str | None) -> str | None:
    raw = (value or "").strip().upper()
    if not raw:
        return None
    token = re.sub(r"[^A-Z0-9]", "", raw)
    if len(token) != 3:
        return None
    return token


def _get_supplier_ref_from_supplier(supplier_name: str | None) -> str | None:
    supplier = (supplier_name or "").strip()
    if not supplier:
        return None
    # Try direct lookup by docname first.
    ref = frappe.db.get_value("Supplier", supplier, "cm_supplier_ref_3")
    if ref:
        return _normalise_supplier_ref(ref)
    # Fall back: cm_supplier_name may store the display name (supplier_name field)
    # rather than the Frappe docname, so search by the supplier_name column.
    result = frappe.db.get_value(
        "Supplier",
        {"supplier_name": supplier},
        "cm_supplier_ref_3",
    )
    return _normalise_supplier_ref(result)


def _resolve_supplier_ref(doc) -> str:
    """Return canonical 3-char supplier ref.

    Source of truth is Supplier.cm_supplier_ref_3.
    Transitional fallback: Item.cm_supplier_code only if it is already a strict 3-char token.
    """
    supplier_name = (getattr(doc, "cm_supplier_name", None) or "").strip()
    supplier_ref = _get_supplier_ref_from_supplier(supplier_name)
    if supplier_ref:
        return supplier_ref

    fallback = _normalise_supplier_ref(getattr(doc, "cm_supplier_code", None) or "")
    if fallback:
        return fallback

    if supplier_name:
        frappe.throw(
            f"Supplier '{supplier_name}' is missing a valid 3-character Supplier Ref. Set Supplier.cm_supplier_ref_3 (e.g. MIL)."
        )
    frappe.throw("Supplier is required to generate Product Code for Primary products.")


def _peek_supplier_ref(doc) -> str | None:
    supplier_name = (getattr(doc, "cm_supplier_name", None) or "").strip()
    supplier_ref = _get_supplier_ref_from_supplier(supplier_name)
    if supplier_ref:
        return supplier_ref
    return _normalise_supplier_ref(getattr(doc, "cm_supplier_code", None) or "")


def validate_supplier_ref_3(doc, method=None):
    """Supplier.validate hook: normalize and validate cm_supplier_ref_3."""
    if not hasattr(doc, "cm_supplier_ref_3"):
        return

    raw = (getattr(doc, "cm_supplier_ref_3", None) or "").strip().upper()
    if not raw:
        return

    token = re.sub(r"[^A-Z0-9]", "", raw)
    if not SUPPLIER_REF_RE.match(token):
        frappe.throw("Supplier Ref must be exactly 3 alphanumeric uppercase characters (e.g. MIL).")
    doc.cm_supplier_ref_3 = token


def sync_item_supplier_code_from_supplier(doc, method=None):
    """Item.validate hook: mirror supplier ref to item.cm_supplier_code when available."""
    if not _is_primary(doc):
        return
    supplier_name = (getattr(doc, "cm_supplier_name", None) or "").strip()
    supplier_ref = _get_supplier_ref_from_supplier(supplier_name)
    if supplier_ref:
        doc.cm_supplier_code = supplier_ref


def _next_product_seq(group_ref: str, supplier_ref: str) -> str:
    series_key = f"CMP-{group_ref}-{supplier_ref}-"
    return getseries(series_key, 5)


def _build_next_code(doc) -> str:
    group_ref = _resolve_group_ref(getattr(doc, "item_group", None) or "")
    supplier_ref = _resolve_supplier_ref(doc)
    seq = _next_product_seq(group_ref, supplier_ref)
    return f"{group_ref}-{supplier_ref}-{seq}"


def assign_primary_product_code(doc, method=None):
    """before_insert hook: auto-assign code for new Primary products."""
    if not _is_primary(doc):
        return

    current = (getattr(doc, "item_code", None) or "").strip().upper()
    is_tmp = current.startswith("TMP-")

    # Keep legacy 6-digit consignment-style item codes untouched.
    if current and LEGACY_CONSIGNMENT_ITEM_RE.match(current):
        return

    if current and not is_tmp:
        # If the code already exists in the DB this is a copy_doc scenario —
        # fall through to generate a fresh unique code instead of returning early.
        if not frappe.db.exists("Item", current):
            if PRODUCT_CODE_RE.match(current) and not (getattr(doc, "cm_product_code", None) or "").strip():
                doc.cm_product_code = current
            return

    for _ in range(100):
        code = _build_next_code(doc)
        if not frappe.db.exists("Item", code):
            doc.item_code = code
            doc.cm_product_code = code
            return
    frappe.throw("Unable to allocate a unique Product Code. Please retry.")


def sync_primary_product_code(doc, method=None):
    """validate hook: keep cm_product_code aligned when item_code follows CM format."""
    if not _is_primary(doc):
        return

    code = (getattr(doc, "item_code", None) or "").strip().upper()
    if PRODUCT_CODE_RE.match(code):
        doc.cm_product_code = code


@frappe.whitelist()
def recode_primary_products(dry_run: int = 1, limit: int | None = None) -> dict:
    """Re-code all Primary products and leave Secondary untouched.

    Args:
        dry_run: 1 => preview only, 0 => apply changes.
        limit: optional max number of primary items to process.
    """
    is_dry = int(dry_run or 0) == 1
    max_rows = int(limit) if limit else None

    rows = frappe.get_all(
        "Item",
        filters={"cm_product_type": "Primary"},
        fields=[
            "name",
            "item_code",
            "cm_product_code",
            "item_group",
            "cm_supplier_code",
            "cm_supplier_name",
            "creation",
        ],
        order_by="creation asc, name asc",
        limit=max_rows,
    )

    result = {
        "dry_run": is_dry,
        "total_primary": len(rows),
        "skipped_legacy_consignment": 0,
        "skipped_missing_supplier": 0,
        "renamed": 0,
        "updated_cm_product_code": 0,
        "skipped": 0,
        "errors": [],
        "changes": [],
    }

    for row in rows:
        try:
            # Explicitly avoid recoding legacy 6-digit consignment-style item codes.
            if LEGACY_CONSIGNMENT_ITEM_RE.match((row.name or "").strip()):
                result["skipped_legacy_consignment"] += 1
                result["skipped"] += 1
                continue

            # Skip items that do not carry supplier identity (e.g. service placeholders).
            if not _peek_supplier_ref(row):
                result["skipped_missing_supplier"] += 1
                result["skipped"] += 1
                continue

            # Keep already-valid CM product codes stable; only sync cm_product_code if needed.
            if PRODUCT_CODE_RE.match((row.name or "").strip().upper()):
                current_name = (row.name or "").strip().upper()
                gref, sref, seq5 = current_name.split("-")
                desired_ref = _peek_supplier_ref(row)
                target_code = current_name
                if desired_ref and desired_ref != sref:
                    target_code = f"{gref}-{desired_ref}-{seq5}"

                if is_dry:
                    result["changes"].append(
                        {
                            "from": row.name,
                            "to": target_code,
                            "item_group": row.item_group,
                            "supplier_ref": (row.cm_supplier_code or row.cm_supplier_name or ""),
                        }
                    )
                    continue

                new_name = row.name
                if row.name != target_code:
                    frappe.rename_doc("Item", row.name, target_code, force=True, merge=False)
                    result["renamed"] += 1
                    new_name = target_code

                doc = frappe.get_doc("Item", new_name)
                if (doc.cm_product_code or "") != target_code:
                    doc.cm_product_code = target_code
                    doc.save(ignore_permissions=True)
                    result["updated_cm_product_code"] += 1
                else:
                    result["skipped"] += 1

                result["changes"].append(
                    {
                        "from": row.name,
                        "to": target_code,
                        "item_group": row.item_group,
                        "supplier_ref": (row.cm_supplier_code or row.cm_supplier_name or ""),
                    }
                )
                continue

            # Legacy CM codes with 4-digit suffix are upgraded in-place to 5 digits,
            # preserving item-group and supplier references from the existing code.
            legacy_m = LEGACY_PRODUCT_CODE_RE.match((row.name or "").strip().upper())
            if legacy_m:
                gref, sref, seq4 = legacy_m.groups()
                target_code = f"{gref}-{sref}-{int(seq4):05d}"

                if is_dry:
                    result["changes"].append(
                        {
                            "from": row.name,
                            "to": target_code,
                            "item_group": row.item_group,
                            "supplier_ref": (row.cm_supplier_code or row.cm_supplier_name or ""),
                        }
                    )
                    continue

                new_name = row.name
                if row.name != target_code:
                    frappe.rename_doc("Item", row.name, target_code, force=True, merge=False)
                    result["renamed"] += 1
                    new_name = target_code

                doc = frappe.get_doc("Item", new_name)
                if (doc.cm_product_code or "") != target_code:
                    doc.cm_product_code = target_code
                    doc.save(ignore_permissions=True)
                    result["updated_cm_product_code"] += 1
                else:
                    result["skipped"] += 1

                result["changes"].append(
                    {
                        "from": row.name,
                        "to": target_code,
                        "item_group": row.item_group,
                        "supplier_ref": (row.cm_supplier_code or row.cm_supplier_name or ""),
                    }
                )
                continue

            probe = frappe._dict(row)

            for _ in range(100):
                target_code = _build_next_code(probe)
                exists = frappe.db.exists("Item", target_code)
                if not exists or exists == row.name:
                    break
            else:
                raise frappe.ValidationError("Could not generate unique code after 100 attempts")

            if is_dry:
                result["changes"].append(
                    {
                        "from": row.name,
                        "to": target_code,
                        "item_group": row.item_group,
                        "supplier_ref": (row.cm_supplier_code or row.cm_supplier_name or ""),
                    }
                )
                continue

            new_name = row.name
            if row.name != target_code:
                frappe.rename_doc("Item", row.name, target_code, force=True, merge=False)
                result["renamed"] += 1
                new_name = target_code

            doc = frappe.get_doc("Item", new_name)
            if (doc.cm_product_code or "") != target_code:
                doc.cm_product_code = target_code
                doc.save(ignore_permissions=True)
                result["updated_cm_product_code"] += 1
            else:
                result["skipped"] += 1

            result["changes"].append(
                {
                    "from": row.name,
                    "to": target_code,
                    "item_group": row.item_group,
                    "supplier_ref": (row.cm_supplier_code or row.cm_supplier_name or ""),
                }
            )
        except Exception as exc:  # noqa: BLE001
            result["errors"].append({"item": row.name, "error": str(exc)})

    if not is_dry:
        frappe.db.commit()

    return result


@frappe.whitelist()
def backfill_supplier_ref_3(dry_run: int = 1) -> dict:
    """Backfill Supplier.cm_supplier_ref_3 for suppliers used by Primary products.

    Derivation order:
    1) strict 3-char Item.cm_supplier_code from linked Primary items
    2) first 3 alnum chars of supplier name (uppercase)
    """
    is_dry = int(dry_run or 0) == 1

    suppliers = frappe.db.sql(
        """
        SELECT DISTINCT TRIM(IFNULL(cm_supplier_name, '')) AS supplier_name
        FROM `tabItem`
        WHERE IFNULL(cm_product_type, '') = 'Primary'
          AND TRIM(IFNULL(cm_supplier_name, '')) != ''
        """,
        as_dict=True,
    )

    out = {"dry_run": is_dry, "updated": 0, "skipped": 0, "errors": [], "changes": []}

    for row in suppliers:
        supplier_name = row.supplier_name
        if not frappe.db.exists("Supplier", supplier_name):
            out["errors"].append({"supplier": supplier_name, "error": "Supplier not found"})
            continue

        try:
            current = _get_supplier_ref_from_supplier(supplier_name)
            if current:
                out["skipped"] += 1
                continue

            strict_item_ref = frappe.db.sql(
                """
                SELECT DISTINCT UPPER(TRIM(IFNULL(cm_supplier_code, ''))) AS ref
                FROM `tabItem`
                WHERE IFNULL(cm_product_type, '') = 'Primary'
                  AND TRIM(IFNULL(cm_supplier_name, '')) = %s
                  AND LENGTH(TRIM(IFNULL(cm_supplier_code, ''))) = 3
                """,
                (supplier_name,),
                as_dict=True,
            )
            candidate = strict_item_ref[0].ref if strict_item_ref else None
            candidate = _normalise_supplier_ref(candidate)
            if not candidate:
                candidate = _normalise_supplier_ref(re.sub(r"[^A-Za-z0-9]", "", supplier_name)[:3])

            if not candidate:
                out["errors"].append({"supplier": supplier_name, "error": "Could not derive 3-char supplier ref"})
                continue

            if is_dry:
                out["changes"].append({"supplier": supplier_name, "from": "", "to": candidate})
                continue

            supplier = frappe.get_doc("Supplier", supplier_name)
            supplier.cm_supplier_ref_3 = candidate
            supplier.save(ignore_permissions=True)
            out["updated"] += 1
            out["changes"].append({"supplier": supplier_name, "from": "", "to": candidate})
        except Exception as exc:  # noqa: BLE001
            out["errors"].append({"supplier": supplier_name, "error": str(exc)})

    if not is_dry:
        frappe.db.commit()

    return out
