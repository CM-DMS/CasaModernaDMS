"""
batch_tracking.py — Consignment batch/lot tracking for CasaModerna.

Provides:
  - Auto-generation of unique 6-digit batch codes on Purchase Receipt save
  - FIFO-sorted batch stock queries for Delivery Note picking
  - Batch-level stock breakdown per item
  - Migration helper to enable has_batch_no on all stock items

Batch = consignment.  Each time a product arrives (via GRN / Purchase Receipt),
a new Batch with a random 6-digit code is created.  The barcode sticker
printed for that consignment carries this code.

FIFO: When creating a Delivery Note, the system shows all batches for an item
sorted by receipt date (oldest first) so warehouse staff pick the right one.
"""

import random
import frappe
from frappe import _


# ── helpers ──────────────────────────────────────────────────────────


def _generate_batch_code() -> str:
    """Generate a unique random 6-digit batch code (000000–999999)."""
    for _ in range(50):  # 50 attempts to avoid collision
        code = f"{random.randint(0, 999999):06d}"
        if not frappe.db.exists("Batch", code):
            return code
    frappe.throw(_("Could not generate a unique batch code after 50 attempts."))


# ── Purchase Receipt hooks ───────────────────────────────────────────


def auto_create_batches(doc, method=None):
    """before_validate hook on Purchase Receipt.

    For every item row where item has has_batch_no=1 and no batch_no is set,
    auto-generate a 6-digit Batch, save it, and assign it to the row.

    Multiple rows of the same item in the same GRN get the SAME batch
    (they're part of the same consignment).
    """
    if not getattr(doc, "items", None):
        return

    # Cache: item_code → has_batch_no
    batch_flags = {}
    # Track: item_code → generated batch_no for this GRN
    generated = {}

    for row in doc.items:
        item_code = getattr(row, "item_code", None)
        if not item_code:
            continue

        # Already has a batch assigned (e.g. user typed one in)
        if getattr(row, "batch_no", None):
            continue

        # Check if item uses batches
        if item_code not in batch_flags:
            batch_flags[item_code] = frappe.db.get_value("Item", item_code, "has_batch_no")
        if not batch_flags[item_code]:
            continue

        # Generate one batch per item_code per GRN
        if item_code not in generated:
            code = _generate_batch_code()
            batch_data = {
                "doctype": "Batch",
                "batch_id": code,
                "item": item_code,
                "manufacturing_date": doc.posting_date,
            }

            # Only set source reference when the source doc is persisted.
            # In before_validate for new Purchase Receipt, doc.name may be a temporary
            # value that does not exist yet and will fail Batch link validation.
            if getattr(doc, "name", None) and not getattr(doc, "__islocal", False) and frappe.db.exists("Purchase Receipt", doc.name):
                batch_data["reference_doctype"] = "Purchase Receipt"
                batch_data["reference_name"] = doc.name

            batch = frappe.get_doc(batch_data)
            batch.insert(ignore_permissions=True)
            generated[item_code] = code

        row.batch_no = generated[item_code]

    if generated:
        # ERPNext reads has_batch_no via frappe.get_cached_value() in
        # SerialBatchCreation.set_item_details(). If the cache is stale
        # (has_batch_no=0 from before batch tracking was enabled), the
        # submission will fail. Clear the doc cache after assigning batches.
        frappe.clear_cache()


# ── Stock Entry hooks ────────────────────────────────────────────────


def auto_create_batches_stock_entry(doc, method=None):
    """before_validate hook on Stock Entry.

    Auto-generates 6-digit batch codes for Material Receipt rows that have
    has_batch_no=1 but no batch_no assigned yet.  Mirrors the same logic as
    auto_create_batches (Purchase Receipt) so both stock-income paths produce
    consistent consignment codes.

    Only runs for stock_entry_type == 'Material Receipt' — transfers and issues
    do not create new batches.
    """
    if getattr(doc, "stock_entry_type", None) != "Material Receipt":
        return
    if not getattr(doc, "items", None):
        return

    batch_flags = {}
    generated = {}

    for row in doc.items:
        item_code = getattr(row, "item_code", None)
        if not item_code:
            continue
        if getattr(row, "batch_no", None):
            continue

        if item_code not in batch_flags:
            batch_flags[item_code] = frappe.db.get_value("Item", item_code, "has_batch_no")
        if not batch_flags[item_code]:
            continue

        if item_code not in generated:
            code = _generate_batch_code()
            batch = frappe.get_doc({
                "doctype": "Batch",
                "batch_id": code,
                "item": item_code,
                "manufacturing_date": doc.posting_date,
            })
            batch.insert(ignore_permissions=True)
            generated[item_code] = code

        row.batch_no = generated[item_code]


# ── Whitelisted APIs ────────────────────────────────────────────────


@frappe.whitelist()
def get_batch_stock(item_code, warehouse=None):
    """Return batch-level stock for an item, FIFO-sorted (oldest first).

    Each row: { batch_no, qty, manufacturing_date, warehouse }
    Uses Serial and Batch Bundle tables (ERPNext v15+).
    """
    if not item_code:
        frappe.throw(_("item_code is required"))

    # ERPNext v15 stores batch quantities in Serial and Batch Bundle + Entry
    data = frappe.db.sql("""
        SELECT
            sbe.batch_no,
            sbb.warehouse,
            SUM(CASE WHEN sbe.is_outward = 0 THEN sbe.qty ELSE -sbe.qty END) AS qty,
            b.manufacturing_date
        FROM `tabSerial and Batch Bundle` sbb
        JOIN `tabSerial and Batch Entry` sbe ON sbe.parent = sbb.name
        LEFT JOIN `tabBatch` b ON b.name = sbe.batch_no
        WHERE sbb.item_code = %(item_code)s
          AND sbb.is_cancelled = 0
          AND IFNULL(sbe.batch_no, '') != ''
          {warehouse_filter}
        GROUP BY sbe.batch_no, sbb.warehouse
        HAVING SUM(CASE WHEN sbe.is_outward = 0 THEN sbe.qty ELSE -sbe.qty END) > 0
        ORDER BY b.manufacturing_date ASC, sbe.batch_no ASC
    """.format(
        warehouse_filter="AND sbb.warehouse = %(warehouse)s" if warehouse else ""
    ), {
        "item_code": item_code,
        "warehouse": warehouse,
    }, as_dict=True)

    return data


@frappe.whitelist()
def get_batch_stock_for_items(item_codes, warehouse=None):
    """Batch stock for multiple items at once (used by DN editor).

    Returns { item_code: [ { batch_no, qty, manufacturing_date, warehouse } ] }
    """
    if isinstance(item_codes, str):
        import json
        item_codes = json.loads(item_codes)

    if not item_codes:
        return {}

    placeholders = ", ".join(["%s"] * len(item_codes))
    params = list(item_codes)

    warehouse_filter = ""
    if warehouse:
        warehouse_filter = "AND sbb.warehouse = %s"
        params.append(warehouse)

    # ERPNext v15 stores batch quantities in Serial and Batch Bundle + Entry
    rows = frappe.db.sql("""
        SELECT
            sbb.item_code,
            sbe.batch_no,
            sbb.warehouse,
            SUM(CASE WHEN sbe.is_outward = 0 THEN sbe.qty ELSE -sbe.qty END) AS qty,
            b.manufacturing_date
        FROM `tabSerial and Batch Bundle` sbb
        JOIN `tabSerial and Batch Entry` sbe ON sbe.parent = sbb.name
        LEFT JOIN `tabBatch` b ON b.name = sbe.batch_no
        WHERE sbb.item_code IN ({placeholders})
          AND sbb.is_cancelled = 0
          AND IFNULL(sbe.batch_no, '') != ''
          {warehouse_filter}
        GROUP BY sbb.item_code, sbe.batch_no, sbb.warehouse
        HAVING SUM(CASE WHEN sbe.is_outward = 0 THEN sbe.qty ELSE -sbe.qty END) > 0
        ORDER BY sbb.item_code, b.manufacturing_date ASC, sbe.batch_no ASC
    """.format(
        placeholders=placeholders,
        warehouse_filter=warehouse_filter,
    ), params, as_dict=True)

    result = {}
    for r in rows:
        result.setdefault(r.item_code, []).append(r)
    return result


@frappe.whitelist()
def get_fifo_suggestion(item_code, warehouse, needed_qty):
    """Suggest which batches to pick for a given qty, FIFO order.

    Returns list of { batch_no, pick_qty, available_qty, manufacturing_date }
    """
    needed_qty = float(needed_qty or 0)
    if needed_qty <= 0:
        return []

    batches = get_batch_stock(item_code, warehouse)
    suggestion = []
    remaining = needed_qty

    for b in batches:
        if remaining <= 0:
            break
        pick = min(b.qty, remaining)
        suggestion.append({
            "batch_no": b.batch_no,
            "pick_qty": pick,
            "available_qty": b.qty,
            "manufacturing_date": str(b.manufacturing_date) if b.manufacturing_date else None,
            "warehouse": b.warehouse,
        })
        remaining -= pick

    return suggestion


# ── Migration: enable has_batch_no ──────────────────────────────────


@frappe.whitelist()
def cancel_and_resubmit_stock_entry(name):
    """Cancel a submitted Stock Entry and re-submit it as a fresh copy so that
    batch numbers get assigned.

    Call via:
      bench --site cms.local execute casamoderna_dms.batch_tracking.cancel_and_resubmit_stock_entry --args '["MAT-STE-2026-00001"]'
    """
    doc = frappe.get_doc("Stock Entry", name)
    if doc.docstatus != 1:
        frappe.throw(f"{name} is not submitted (docstatus={doc.docstatus})")

    print(f"Cancelling {name} …")
    doc.cancel()
    frappe.db.commit()
    print("Cancelled.")

    doc2 = frappe.copy_doc(doc)
    doc2.amended_from = None
    for row in doc2.items:
        row.batch_no = None
        row.serial_no = None
    doc2.insert(ignore_permissions=True)
    frappe.db.commit()
    print(f"Draft created: {doc2.name}")

    # Explicitly assign batches now (don't rely on hook timing vs ERPNext's
    # on_submit bundle creation which also needs batch_no set on the rows).
    _assign_batches_to_draft(doc2)
    doc2.save(ignore_permissions=True)
    frappe.db.commit()

    # Clear Frappe's document cache before submitting.
    # ERPNext v15 reads has_batch_no via frappe.get_cached_value() inside
    # SerialBatchCreation.set_item_details().  If the cache still holds the
    # old has_batch_no=0 value (from before enable_batch_tracking_on_items
    # was run), the bundle creation overwrites batches={None: qty} and the
    # submission fails with "Batch No is mandatory".
    frappe.clear_cache()

    doc2 = frappe.get_doc("Stock Entry", name)
    doc2.submit()
    frappe.db.commit()
    print(f"Submitted: {doc2.name}")
    for row in doc2.items:
        print(f"  {row.item_code}  ->  batch_no = {row.batch_no}")

    return {"new_name": doc2.name}


def assign_batches_to_draft(name):
    """Assign batch numbers to a draft Stock Entry (Material Receipt) without submitting.
    Useful for MAT-STE-2026-00002 if it already exists as a draft.

    Call via:
      bench --site cms.local execute casamoderna_dms.batch_tracking.assign_batches_to_draft --args '["MAT-STE-2026-00002"]'
    """
    doc = frappe.get_doc("Stock Entry", name)
    if doc.docstatus != 0:
        frappe.throw(f"{name} is not a draft (docstatus={doc.docstatus})")
    if doc.stock_entry_type != "Material Receipt":
        frappe.throw(f"{name} is not a Material Receipt")

    _assign_batches_to_draft(doc)
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    doc2 = frappe.get_doc("Stock Entry", name)
    doc2.submit()
    frappe.db.commit()
    print(f"Submitted: {doc2.name}")
    for row in doc2.items:
        print(f"  {row.item_code}  ->  batch_no = {row.batch_no}")
    return {"submitted": doc2.name}


def _assign_batches_to_draft(doc):
    """Internal: generate and assign batch codes to all eligible rows in a draft Stock Entry."""
    batch_flags = {}
    generated = {}

    for row in doc.items:
        item_code = getattr(row, "item_code", None)
        if not item_code:
            continue
        if getattr(row, "batch_no", None):
            continue

        if item_code not in batch_flags:
            batch_flags[item_code] = frappe.db.get_value("Item", item_code, "has_batch_no")
        if not batch_flags[item_code]:
            continue

        if item_code not in generated:
            code = _generate_batch_code()
            batch = frappe.get_doc({
                "doctype": "Batch",
                "batch_id": code,
                "item": item_code,
                "manufacturing_date": doc.posting_date,
            })
            batch.insert(ignore_permissions=True)
            generated[item_code] = code
            print(f"  Created Batch {code} for {item_code}")

        row.batch_no = generated[item_code]


def enable_batch_tracking_on_items():
    """Enable has_batch_no=1 on all active stock items.

    Safe to run multiple times.
    Call via: bench --site <site> execute casamoderna_dms.batch_tracking.enable_batch_tracking_on_items
    Or from the DMS admin screen.
    """
    updated = frappe.db.sql("""
        UPDATE `tabItem`
        SET has_batch_no = 1
        WHERE is_stock_item = 1
          AND disabled = 0
          AND has_batch_no = 0
    """)
    frappe.db.commit()
    count = frappe.db.sql("""
        SELECT COUNT(*) FROM `tabItem`
        WHERE is_stock_item = 1 AND disabled = 0 AND has_batch_no = 1
    """)[0][0]
    return {"updated": count, "message": f"Batch tracking enabled on {count} stock items"}
