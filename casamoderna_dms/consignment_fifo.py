"""
consignment_fifo.py — FIFO guidance for same-product consignments.

In CasaModerna each consignment arrival of a product becomes a separate Item
with its own 6-digit product code.  Multiple Items share the same product
identity (item_name) but differ in cost, arrival date, and code.

This module provides FIFO-sorted queries so the Delivery Note editor can
recommend which consignment to ship first (oldest stock).
"""

import random
import frappe
from frappe import _


# ── Code generation ──────────────────────────────────────────────────


def generate_product_code() -> str:
    """Generate a unique random 6-digit product code (100000–999999)."""
    for _ in range(200):
        code = f"{random.randint(100000, 999999):06d}"
        if not frappe.db.exists("Item", code):
            return code
    frappe.throw(_("Could not generate a unique product code after 200 attempts."))


# ── FIFO queries ─────────────────────────────────────────────────────


@frappe.whitelist()
def get_fifo_consignments(item_name, warehouse=None):
    """Return all consignment items for a product name, FIFO-sorted.

    Groups by item_name — all items sharing the same product name are
    different consignments.  Sorted by creation date (oldest first).

    Returns: [ { item_code, item_name, warehouse, qty, creation_date } ]
    """
    if not item_name:
        frappe.throw(_("item_name is required"))

    warehouse_filter = ""
    params = {"item_name": item_name}
    if warehouse:
        warehouse_filter = "AND b.warehouse = %(warehouse)s"
        params["warehouse"] = warehouse

    return frappe.db.sql("""
        SELECT
            b.item_code,
            i.item_name,
            b.warehouse,
            b.actual_qty AS qty,
            i.creation AS creation_date
        FROM `tabBin` b
        JOIN `tabItem` i ON i.name = b.item_code
        WHERE i.item_name = %(item_name)s
          AND i.is_stock_item = 1
          AND i.disabled = 0
          AND b.actual_qty > 0
          {wh}
        ORDER BY i.creation ASC, b.item_code ASC
    """.format(wh=warehouse_filter), params, as_dict=True)


@frappe.whitelist()
def get_fifo_for_items(item_codes, warehouse=None):
    """For a list of item_codes, find all sibling consignments (FIFO sorted).

    Used by the DN editor: for each item in the DN, show all consignments
    of the same product so the user can pick the oldest.

    Returns: { item_name: [ { item_code, qty, warehouse, creation_date } ] }
    """
    import json
    if isinstance(item_codes, str):
        item_codes = json.loads(item_codes)
    if not item_codes:
        return {}

    # Get item_names for the given codes
    placeholders = ", ".join(["%s"] * len(item_codes))
    names = frappe.db.sql(
        f"SELECT name, item_name FROM tabItem WHERE name IN ({placeholders})",
        item_codes, as_dict=True,
    )
    if not names:
        return {}

    # Unique product names
    product_names = list({n.item_name for n in names if n.item_name})
    if not product_names:
        return {}

    name_ph = ", ".join(["%s"] * len(product_names))
    params = product_names[:]

    wh_filter = ""
    if warehouse:
        wh_filter = "AND b.warehouse = %s"
        params.append(warehouse)

    rows = frappe.db.sql("""
        SELECT
            i.item_name,
            b.item_code,
            b.warehouse,
            b.actual_qty AS qty,
            i.creation AS creation_date
        FROM `tabBin` b
        JOIN `tabItem` i ON i.name = b.item_code
        WHERE i.item_name IN ({names})
          AND i.is_stock_item = 1
          AND i.disabled = 0
          AND b.actual_qty > 0
          {wh}
        ORDER BY i.item_name, i.creation ASC, b.item_code ASC
    """.format(names=name_ph, wh=wh_filter), params, as_dict=True)

    result = {}
    for r in rows:
        result.setdefault(r.item_name, []).append(r)
    return result
