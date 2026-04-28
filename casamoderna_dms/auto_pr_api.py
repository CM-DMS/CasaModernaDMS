"""
auto_pr_api.py — Automated Purchase Requisition suggestions for Casa Moderna.

Scans all items with a reorder level configured in Item Reorder and compares
against current stock (Bin.actual_qty). Items at or below reorder level are
returned as suggested purchase requisitions, grouped by supplier if a default
supplier is set on the item.

This is read-only intelligence — it never auto-creates Purchase Orders without
human confirmation (one-click "Create PO" per suggestion from the UI).
"""
from __future__ import annotations

import frappe
from frappe import _


@frappe.whitelist()
def get_reorder_suggestions(warehouse: str = "") -> list[dict]:
    """
    Return items that are at or below their reorder level.

    Returns:
        List of dicts: item_code, item_name, item_group,
                       warehouse, actual_qty, reorder_level, reorder_qty,
                       deficit, default_supplier, default_supplier_name,
                       last_purchase_rate
    """
    if not frappe.has_permission("Purchase Order", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    wh_filter = "AND b.warehouse = %(wh)s" if warehouse else ""
    params: dict = {}
    if warehouse:
        params["wh"] = warehouse

    rows = frappe.db.sql(
        f"""
        SELECT
            ir.parent                         AS item_code,
            i.item_name,
            i.item_group,
            ir.warehouse,
            IFNULL(b.actual_qty, 0)           AS actual_qty,
            ir.warehouse_reorder_level        AS reorder_level,
            ir.warehouse_reorder_qty          AS reorder_qty,
            (ir.warehouse_reorder_level - IFNULL(b.actual_qty, 0)) AS deficit,
            i.cm_supplier_code                AS default_supplier,
            i.cm_supplier_name                AS default_supplier_name,
            IFNULL(i.last_purchase_rate, 0)   AS last_purchase_rate,
            i.description
        FROM `tabItem Reorder` ir
        INNER JOIN `tabItem` i ON i.name = ir.parent AND i.disabled = 0 AND i.is_purchase_item = 1
        LEFT  JOIN `tabBin`  b ON b.item_code = ir.parent AND b.warehouse = ir.warehouse
        WHERE ir.parenttype = 'Item'
          AND IFNULL(ir.warehouse_reorder_level, 0) > 0
          AND IFNULL(b.actual_qty, 0) <= ir.warehouse_reorder_level
          {wh_filter}
        ORDER BY deficit DESC, item_code ASC
        """,
        params,
        as_dict=True,
    )

    for r in rows:
        r["actual_qty"] = round(float(r["actual_qty"] or 0), 3)
        r["reorder_level"] = round(float(r["reorder_level"] or 0), 3)
        r["reorder_qty"] = round(float(r["reorder_qty"] or 0), 3)
        r["deficit"] = round(float(r["deficit"] or 0), 3)
        r["estimated_cost"] = round(
            float(r["last_purchase_rate"] or 0) * float(r["reorder_qty"] or 0), 2
        )

    return rows


@frappe.whitelist()
def create_purchase_order_from_suggestions(items: list | str, supplier: str, warehouse: str) -> dict:
    """
    Create a draft Purchase Order for the given items from a single supplier.

    Args:
        items: list of {item_code, qty, rate, schedule_date}
        supplier: supplier name
        warehouse: delivery warehouse

    Returns: {"name": PO name}
    """
    import json
    if isinstance(items, str):
        items = json.loads(items)

    if not frappe.has_permission("Purchase Order", "create"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    if not items:
        frappe.throw(_("No items provided"))

    po = frappe.new_doc("Purchase Order")
    po.supplier = supplier
    po.schedule_date = frappe.utils.add_days(frappe.utils.today(), 14)  # default lead time 2 weeks
    po.set_warehouse = warehouse

    for item in items:
        po.append("items", {
            "item_code": item["item_code"],
            "qty": float(item.get("qty", 1)),
            "rate": float(item.get("rate", 0)),
            "schedule_date": item.get("schedule_date") or po.schedule_date,
            "warehouse": warehouse,
        })

    po.flags.ignore_mandatory = True
    po.save(ignore_permissions=True)
    frappe.db.commit()
    return {"name": po.name}
