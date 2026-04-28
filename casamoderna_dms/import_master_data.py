"""Import master data into V3 site from JSON files produced by export_master_data.py.

Run via bench:
    cd /home/frappe/frappe/casamoderna-bench-v3
    bench --site cms.local execute \
        casamoderna_dms.tools.import_master_data.run \
        --kwargs '{"data_dir": "/home/frappe/cm_export", "dry_run": false}'

Or with a specific subset:
    --kwargs '{"data_dir": "/home/frappe/cm_export", "only": "items,item_prices"}'

Safe to re-run (idempotent): existing records are updated (if draft) or skipped
(if submitted). A summary is printed at the end.

Import order matches export dependency chain:
  item_groups → territories → warehouses → cm_localities → suppliers →
  price_lists → items → item_prices → item_suppliers → configurator_pricing →
  users
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import frappe
import frappe.utils


# ---------------------------------------------------------------------------
# Stats tracking
# ---------------------------------------------------------------------------

@dataclass
class Stats:
    created: int = 0
    updated: int = 0
    skipped: int = 0
    errors: int = 0
    error_details: list[str] = field(default_factory=list)

    def report(self, label: str) -> None:
        print(
            f"  {label:.<40} "
            f"created={self.created:>4}  "
            f"updated={self.updated:>4}  "
            f"skipped={self.skipped:>4}  "
            f"errors={self.errors:>4}"
        )
        for d in self.error_details[:5]:
            print(f"    ⚠ {d}")
        if len(self.error_details) > 5:
            print(f"    … and {len(self.error_details) - 5} more errors")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load(data_dir: Path, filename: str) -> list[dict]:
    path = data_dir / filename
    if not path.exists():
        print(f"  (skipping {filename} — file not found)")
        return []
    return json.loads(path.read_text(encoding="utf-8"))


# System-managed timestamp/ownership fields — never import from V2
_SYSTEM_FIELDS = frozenset({"modified", "creation", "owner", "modified_by"})


def upsert_doc(doctype: str, data: dict, key_field: str = "name", dry_run: bool = False) -> str:
    """Insert or update a document. Returns 'created'|'updated'|'skipped'."""
    name = data.get(key_field) or data.get("name")
    if not name:
        raise ValueError(f"No {key_field!r} in record: {list(data.keys())[:5]}")

    # Remove None values and system fields to avoid timestamp conflicts
    clean = {k: v for k, v in data.items() if v is not None and k not in _SYSTEM_FIELDS}

    if frappe.db.exists(doctype, name):
        doc = frappe.get_doc(doctype, name)
        if doc.docstatus == 1:
            return "skipped"  # submitted — cannot update
        for k, v in clean.items():
            if k == "name":
                continue  # never setattr name — triggers spurious rename attempt
            if hasattr(doc, k):
                setattr(doc, k, v)
        if not dry_run:
            doc.flags.ignore_permissions = True
            doc.flags.ignore_validate = True
            doc.flags.ignore_mandatory = True
            doc.flags.ignore_version = True
            doc.save()
        return "updated"
    else:
        doc = frappe.new_doc(doctype)
        doc.update(clean)
        if not dry_run:
            doc.flags.ignore_permissions = True
            doc.flags.ignore_validate = True
            doc.flags.ignore_mandatory = True
            doc.flags.ignore_version = True
            doc.insert()
        return "created"


# ---------------------------------------------------------------------------
# Layer importers
# ---------------------------------------------------------------------------

def import_item_groups(data_dir: Path, dry_run: bool) -> Stats:
    records = load(data_dir, "item_groups.json")
    stats = Stats()
    # Sort by lft so parents are created before children
    records.sort(key=lambda r: r.get("lft", 0))
    for r in records:
        try:
            # V2 top-level groups have NULL parent — default to "All Item Groups"
            parent = r.get("parent_item_group") or "All Item Groups"
            # If this group already has children in V3 it must be is_group=1
            is_group = r.get("is_group", 0)
            if not is_group:
                has_children = frappe.db.exists("Item Group", {"parent_item_group": r["name"]})
                if has_children:
                    is_group = 1
            result = upsert_doc("Item Group", {
                "name": r["name"],
                "item_group_name": r.get("item_group_name", r["name"]),
                "parent_item_group": parent,
                "is_group": is_group,
            }, dry_run=dry_run)
            if result == "created":
                stats.created += 1
            elif result == "updated":
                stats.updated += 1
            else:
                stats.skipped += 1
        except Exception as e:
            stats.errors += 1
            stats.error_details.append(f"{r.get('name')}: {e}")
    return stats


def import_territories(data_dir: Path, dry_run: bool) -> Stats:
    records = load(data_dir, "territories.json")
    stats = Stats()
    for r in records:
        try:
            result = upsert_doc("Territory", {
                "name": r["name"],
                "territory_name": r.get("territory_name", r["name"]),
                "parent_territory": r.get("parent_territory") or "",
                "is_group": r.get("is_group", 0),
            }, dry_run=dry_run)
            if result == "created": stats.created += 1
            elif result == "updated": stats.updated += 1
            else: stats.skipped += 1
        except Exception as e:
            stats.errors += 1
            stats.error_details.append(f"{r.get('name')}: {e}")
    return stats


def import_warehouses(data_dir: Path, dry_run: bool) -> Stats:
    records = load(data_dir, "warehouses.json")
    stats = Stats()
    # Map V2 company name to V3 company name
    COMPANY_MAP = {"Casa Moderna Limited": "Casa Moderna"}
    for r in records:
        try:
            company = r.get("company", "Casa Moderna")
            company = COMPANY_MAP.get(company, company)
            result = upsert_doc("Warehouse", {
                "name": r["name"],
                "warehouse_name": r.get("warehouse_name", r["name"]),
                "warehouse_type": r.get("warehouse_type"),
                "parent_warehouse": r.get("parent_warehouse") or "",
                "is_group": r.get("is_group", 0),
                "company": company,
                "disabled": r.get("disabled", 0),
            }, dry_run=dry_run)
            if result == "created": stats.created += 1
            elif result == "updated": stats.updated += 1
            else: stats.skipped += 1
        except Exception as e:
            stats.errors += 1
            stats.error_details.append(f"{r.get('name')}: {e}")
    return stats


def import_localities(data_dir: Path, dry_run: bool) -> Stats:
    records = load(data_dir, "cm_localities.json")
    stats = Stats()
    for r in records:
        try:
            result = upsert_doc("CM Locality", {
                "name": r["name"],
                "locality_name": r.get("locality_name", r["name"]),
                "postcode": r.get("postcode"),
                "district": r.get("district"),
                "country": r.get("country", "Malta"),
            }, dry_run=dry_run)
            if result == "created": stats.created += 1
            elif result == "updated": stats.updated += 1
            else: stats.skipped += 1
        except Exception as e:
            stats.errors += 1
            stats.error_details.append(f"{r.get('name')}: {e}")
    return stats


def import_suppliers(data_dir: Path, dry_run: bool) -> Stats:
    records = load(data_dir, "suppliers.json")
    stats = Stats()
    # V2 supplier names that differ from V3 (name was set from supplier_name on creation)
    SUPPLIER_NAME_MAP = {
        "Topline Mobili": "Topline Mobili Srl",
    }
    for r in records:
        try:
            # Remap name if V2 name differs from V3 name
            v2_name = r["name"]
            r["name"] = SUPPLIER_NAME_MAP.get(v2_name, v2_name)
            # Import supplier
            supplier_data = {k: v for k, v in r.items() if k not in ("addresses", "contacts")}
            result = upsert_doc("Supplier", supplier_data, dry_run=dry_run)
            if result == "created": stats.created += 1
            elif result == "updated": stats.updated += 1
            else: stats.skipped += 1

            if dry_run:
                continue

            # Import addresses
            for addr in r.get("addresses", []):
                addr_data = {k: v for k, v in addr.items() if k != "supplier"}
                try:
                    if not frappe.db.exists("Address", addr_data["name"]):
                        doc = frappe.new_doc("Address")
                        doc.update(addr_data)
                        doc.append("links", {
                            "link_doctype": "Supplier",
                            "link_name": r["name"],
                        })
                        doc.flags.ignore_permissions = True
                        doc.flags.ignore_mandatory = True
                        doc.insert()
                except Exception as ae:
                    stats.error_details.append(f"Address {addr_data.get('name')}: {ae}")

            # Import contacts
            for contact in r.get("contacts", []):
                contact_data = {k: v for k, v in contact.items() if k != "supplier"}
                try:
                    if not frappe.db.exists("Contact", contact_data["name"]):
                        doc = frappe.new_doc("Contact")
                        doc.update(contact_data)
                        doc.append("links", {
                            "link_doctype": "Supplier",
                            "link_name": r["name"],
                        })
                        doc.flags.ignore_permissions = True
                        doc.flags.ignore_mandatory = True
                        doc.flags.ignore_links = True
                        doc.insert()
                except Exception as ce:
                    stats.error_details.append(f"Contact {contact_data.get('name')}: {ce}")

        except Exception as e:
            stats.errors += 1
            stats.error_details.append(f"{r.get('name')}: {e}")
    return stats


def import_price_lists(data_dir: Path, dry_run: bool) -> Stats:
    records = load(data_dir, "price_lists.json")
    stats = Stats()
    for r in records:
        try:
            result = upsert_doc("Price List", r, dry_run=dry_run)
            if result == "created": stats.created += 1
            elif result == "updated": stats.updated += 1
            else: stats.skipped += 1
        except Exception as e:
            stats.errors += 1
            stats.error_details.append(f"{r.get('name')}: {e}")
    return stats


def import_items(data_dir: Path, dry_run: bool) -> Stats:
    records = load(data_dir, "items.json")
    stats = Stats()
    for r in records:
        try:
            item_code = r.get("item_code") or r.get("name")
            # Strip fields that trigger problematic hooks or type errors
            for f in ("standard_rate", "last_purchase_rate", "uoms") + tuple(_SYSTEM_FIELDS):
                r.pop(f, None)
            stock_uom = r.get("stock_uom") or "Nos"
            clean = {k: v for k, v in r.items() if v is not None}

            if dry_run:
                if frappe.db.exists("Item", item_code):
                    stats.updated += 1
                else:
                    stats.created += 1
                continue

            if frappe.db.exists("Item", item_code):
                doc = frappe.get_doc("Item", item_code)
                for k, v in clean.items():
                    if k not in ("item_code", "name") and hasattr(doc, k):
                        setattr(doc, k, v)
                doc.flags.ignore_permissions = True
                doc.flags.ignore_validate = True
                doc.flags.ignore_mandatory = True
                doc.save()
                stats.updated += 1
            else:
                doc = frappe.new_doc("Item")
                doc.update(clean)
                # Add UOM conversion row via append so Frappe creates a proper child doc
                if not doc.get("uoms"):
                    doc.append("uoms", {"uom": stock_uom, "conversion_factor": 1})
                doc.flags.ignore_permissions = True
                doc.flags.ignore_validate = True
                doc.flags.ignore_mandatory = True
                doc.insert()
                stats.created += 1
        except Exception as e:
            stats.errors += 1
            stats.error_details.append(f"{r.get('item_code')}: {e}")
    return stats


def import_item_prices(data_dir: Path, dry_run: bool) -> Stats:
    records = load(data_dir, "item_prices.json")
    stats = Stats()
    for r in records:
        try:
            result = upsert_doc("Item Price", r, dry_run=dry_run)
            if result == "created": stats.created += 1
            elif result == "updated": stats.updated += 1
            else: stats.skipped += 1
        except Exception as e:
            stats.errors += 1
            stats.error_details.append(f"{r.get('name')}: {e}")
    return stats


def import_item_suppliers(data_dir: Path, dry_run: bool) -> Stats:
    """Import Item Supplier child table rows (supplier ladders)."""
    records = load(data_dir, "item_suppliers.json")
    stats = Stats()

    # V2 supplier names that differ from V3 supplier names
    SUPPLIER_MAP = {
        "Topline Mobili": "Topline Mobili Srl",
    }

    # Group by item
    by_item: dict[str, list] = {}
    for r in records:
        r["supplier"] = SUPPLIER_MAP.get(r["supplier"], r["supplier"])
        by_item.setdefault(r["item_code"], []).append(r)

    for item_code, rows in by_item.items():
        try:
            if not frappe.db.exists("Item", item_code):
                stats.skipped += len(rows)
                continue

            item_doc = frappe.get_doc("Item", item_code)
            existing_suppliers = {r.supplier for r in item_doc.get("supplier_items", [])}

            changed = False
            for r in rows:
                if r["supplier"] not in existing_suppliers:
                    item_doc.append("supplier_items", {
                        "supplier": r["supplier"],
                        "supplier_part_no": r.get("supplier_part_no"),
                        "lead_time_days": r.get("lead_time_days"),
                        "min_order_qty": r.get("min_order_qty"),
                        "cm_cost_price_a": r.get("cm_cost_price_a"),
                        "cm_cost_price_b": r.get("cm_cost_price_b"),
                        "cm_cost_price_c": r.get("cm_cost_price_c"),
                        "cm_tier_a_min_qty": r.get("cm_tier_a_min_qty"),
                        "cm_tier_b_min_qty": r.get("cm_tier_b_min_qty"),
                        "cm_tier_c_min_qty": r.get("cm_tier_c_min_qty"),
                        "cm_supplier_sku": r.get("cm_supplier_sku"),
                        "cm_notes": r.get("cm_notes"),
                    })
                    stats.created += 1
                    changed = True
                else:
                    stats.skipped += 1

            if changed and not dry_run:
                item_doc.flags.ignore_permissions = True
                item_doc.flags.ignore_validate = True
                item_doc.save()

        except Exception as e:
            stats.errors += 1
            stats.error_details.append(f"{item_code}: {e}")

    return stats


def import_configurator_pricing(data_dir: Path, dry_run: bool) -> Stats:
    records = load(data_dir, "configurator_pricing.json")
    stats = Stats()
    for r in records:
        try:
            matrix = r.pop("matrix", [])
            result = upsert_doc("CM Configurator Pricing", r, dry_run=dry_run)
            if result == "created": stats.created += 1
            elif result == "updated": stats.updated += 1
            else:
                stats.skipped += 1
                continue

            if dry_run or not matrix:
                continue

            # Use direct DB insert for matrix rows to bypass doc hooks entirely
            existing_keys = set(
                frappe.db.sql(
                    """SELECT CONCAT(IFNULL(tier_name,''), '|', IFNULL(option_code,''))
                       FROM `tabCM Configurator Pricing Matrix`
                       WHERE parent=%s""",
                    r["name"], as_list=True
                ) or []
            )
            existing_keys = {row[0] for row in existing_keys}
            for m in matrix:
                key = f"{m.get('tier_name') or ''}|{m.get('option_code') or ''}"
                if key not in existing_keys:
                    frappe.db.sql(
                        """INSERT INTO `tabCM Configurator Pricing Matrix`
                           (name, parent, parenttype, parentfield, idx,
                            tier_name, role_name, mode, option_code,
                            handle_variant, finish_code, seat_count,
                            extra_key_1, extra_key_2,
                            offer_price_inc_vat, rrp_inc_vat, cost_price, notes)
                           VALUES (%s, %s, 'CM Configurator Pricing', 'matrix_rows', %s,
                                   %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            frappe.generate_hash(length=10),
                            r["name"],
                            m.get("idx", 0),
                            m.get("tier_name"),
                            m.get("role_name"),
                            m.get("mode"),
                            m.get("option_code"),
                            m.get("handle_variant"),
                            m.get("finish_code"),
                            m.get("seat_count", 0),
                            m.get("extra_key_1"),
                            m.get("extra_key_2"),
                            m.get("offer_price_inc_vat"),
                            m.get("rrp_inc_vat"),
                            m.get("cost_price"),
                            m.get("notes"),
                        )
                    )
                    existing_keys.add(key)
            frappe.db.commit()

        except Exception as e:
            stats.errors += 1
            stats.error_details.append(f"{r.get('name')}: {e}")
    return stats


def import_users(data_dir: Path, dry_run: bool) -> Stats:
    users = load(data_dir, "users.json")
    salespeople = load(data_dir, "salespeople.json")
    stats = Stats()

    # Get valid roles in V3
    valid_roles = set(frappe.db.get_all("Role", pluck="name"))

    for u in users:
        roles = u.pop("roles", [])
        # Strip system-managed fields to avoid timestamp conflicts
        for f in _SYSTEM_FIELDS:
            u.pop(f, None)
        try:
            if frappe.db.exists("User", u["name"]):
                doc = frappe.get_doc("User", u["name"])
                for k, v in u.items():
                    if hasattr(doc, k) and v is not None:
                        setattr(doc, k, v)
                # Never copy role_profile from V2 — assign roles directly
                doc.role_profile_name = None
                if not dry_run:
                    doc.flags.ignore_permissions = True
                    doc.flags.ignore_links = True
                    doc.save()
                stats.updated += 1
            else:
                doc = frappe.new_doc("User")
                doc.update(u)
                # Set a temporary random password — user must reset on first login
                doc.new_password = frappe.generate_hash(length=12)
                doc.role_profile_name = None  # skip role profile — assign roles directly
                for role in roles:
                    if role in valid_roles:
                        doc.append("roles", {"role": role})
                    else:
                        stats.error_details.append(f"{u.get('name')}: skipped unknown role '{role}'")
                if not dry_run:
                    doc.flags.ignore_permissions = True
                    doc.flags.ignore_password_policy = True
                    doc.flags.ignore_links = True
                    doc.insert()
                stats.created += 1
        except Exception as e:
            stats.errors += 1
            stats.error_details.append(f"{u.get('name')}: {e}")

    # Import Sales Person records
    for sp in salespeople:
        try:
            if not frappe.db.exists("Sales Person", sp["name"]):
                doc = frappe.new_doc("Sales Person")
                doc.update(sp)
                if not dry_run:
                    doc.flags.ignore_permissions = True
                    doc.insert()
                stats.created += 1
            else:
                stats.skipped += 1
        except Exception as e:
            stats.error_details.append(f"SalesPerson {sp.get('name')}: {e}")

    return stats


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

IMPORTERS = [
    ("item_groups",          import_item_groups),
    ("territories",          import_territories),
    ("warehouses",           import_warehouses),
    ("cm_localities",        import_localities),
    ("suppliers",            import_suppliers),
    ("price_lists",          import_price_lists),
    ("items",                import_items),
    ("item_prices",          import_item_prices),
    ("item_suppliers",       import_item_suppliers),
    ("configurator_pricing", import_configurator_pricing),
    ("users",                import_users),
]


# ---------------------------------------------------------------------------
# Entry point (called via bench execute)
# ---------------------------------------------------------------------------

def run(data_dir: str = "/home/frappe/cm_export", dry_run: bool = False, only: str = "") -> None:
    """Main entry point for bench execute."""
    out = Path(data_dir)
    filter_set = {s.strip() for s in only.split(",") if s.strip()} if only else set()

    print(f"\n{'='*60}")
    print(f"Casa Moderna DMS — Master Data Import")
    print(f"  data_dir : {out}")
    print(f"  dry_run  : {dry_run}")
    print(f"  only     : {only or '(all)'}")
    print(f"{'='*60}\n")

    all_stats: list[tuple[str, Stats]] = []

    for name, importer in IMPORTERS:
        if filter_set and name not in filter_set:
            continue
        print(f"Importing {name} …")
        stats = importer(out, dry_run)
        stats.report(name)
        all_stats.append((name, stats))
        if not dry_run:
            frappe.db.commit()

    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    total_created = total_updated = total_skipped = total_errors = 0
    for name, s in all_stats:
        s.report(name)
        total_created += s.created
        total_updated += s.updated
        total_skipped += s.skipped
        total_errors += s.errors

    print(f"\nTOTAL: created={total_created}  updated={total_updated}  "
          f"skipped={total_skipped}  errors={total_errors}")
    if dry_run:
        print("\n[DRY RUN — no changes written]")
    print(f"{'='*60}\n")
