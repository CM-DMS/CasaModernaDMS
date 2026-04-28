"""procurement_dispatch.py

Procurement Dispatch API — powers the "Items to Source" screen in the DMS
React front-end.

get_dispatch_items()
--------------------
Returns a list of open Sales Order lines that still need to be sourced,
each enriched with:

    so_item_name   — SO item row name (used as table row-key by the UI)
    sales_order    — parent SO name
    delivery_date  — requested delivery date on the SO item
    item_code      — ERPNext item code
    item_name      — item display name
    qty            — ordered quantity (remaining undelivered)
    uom            — unit of measure
    supplier_name  — default supplier for the item (if set)
    lead_time_days — lead time from item master (lead_time_days field)
    days_to_order  — days remaining until the order-by deadline
                     (delivery_date − lead_time_days − today)
                     negative → already overdue
    urgency        — 'overdue' | 'urgent' (< 7 days) | 'ok'
    lane           — 'stock'  if actual_qty >= remaining_qty
                     'order'  otherwise

create_po_from_so_item(so_item_name, supplier)
----------------------------------------------
Creates a draft Purchase Order for a single SO item.
Returns {"po_name": "<PO-XXXX>", "po_url": "/app/purchase-order/<PO-XXXX>"}.

allocate_so_item(so_item_name)
------------------------------
Creates a submitted Stock Reservation Entry that reserves available stock
against the SO item.
Returns {"sre_name": "<SRE-XXXX>"}.
"""

from __future__ import annotations

from datetime import date

import frappe
from frappe import _
from frappe.utils import getdate, date_diff, flt


@frappe.whitelist()
def get_dispatch_items() -> list[dict]:
    """Return open SO lines that still need to be procured or allocated."""

    if frappe.session.user == "Guest":
        frappe.throw("Authentication required", frappe.PermissionError)

    today: date = getdate()

    # ── Fetch open SO items ────────────────────────────────────────────────
    # We want submitted SOs that are not Closed / Cancelled, and only lines
    # where qty_delivered < qty (i.e. outstanding_qty > 0 in ERPNext terms).
    so_items = frappe.db.sql(
        """
        SELECT
            soi.name            AS so_item_name,
            soi.parent          AS sales_order,
            soi.delivery_date,
            soi.item_code,
            soi.item_name,
            (soi.qty - IFNULL(soi.delivered_qty, 0)) AS qty,
            soi.uom,
            soi.stock_uom
        FROM `tabSales Order Item` soi
        JOIN `tabSales Order` so ON so.name = soi.parent
        WHERE so.docstatus = 1
          AND so.status NOT IN ('Closed', 'Cancelled', 'Completed')
          AND (soi.qty - IFNULL(soi.delivered_qty, 0)) > 0
        ORDER BY soi.delivery_date ASC, soi.parent ASC
        LIMIT 500
        """,
        as_dict=True,
    )

    if not so_items:
        return []

    item_codes = list({r.item_code for r in so_items})

    # ── Fetch item master fields in one query ──────────────────────────────
    item_data = {}
    if item_codes:
        rows = frappe.db.sql(
            """
            SELECT
                name,
                IFNULL(lead_time_days, 0) AS lead_time_days,
                cm_supplier_name          AS supplier_name
            FROM `tabItem`
            WHERE name IN %(codes)s
            """,
            {"codes": item_codes},
            as_dict=True,
        )
        item_data = {r.name: r for r in rows}

    # ── Fetch actual stock (bin) for each item ─────────────────────────────
    # We aggregate across all warehouses to get total available stock.
    stock_data: dict[str, float] = {}
    if item_codes:
        bin_rows = frappe.db.sql(
            """
            SELECT item_code, SUM(IFNULL(actual_qty, 0)) AS actual_qty
            FROM `tabBin`
            WHERE item_code IN %(codes)s
            GROUP BY item_code
            """,
            {"codes": item_codes},
            as_dict=True,
        )
        stock_data = {r.item_code: float(r.actual_qty) for r in bin_rows}

    # ── Build result rows ──────────────────────────────────────────────────
    result = []
    for row in so_items:
        idata = item_data.get(row.item_code, {})
        lead_time_days: int = int(idata.get("lead_time_days") or 0)
        supplier_name: str = idata.get("supplier_name") or ""

        delivery_date = getdate(row.delivery_date) if row.delivery_date else None
        if delivery_date:
            order_by_date_offset = date_diff(delivery_date, today) - lead_time_days
        else:
            order_by_date_offset = None

        if order_by_date_offset is None:
            urgency = "ok"
        elif order_by_date_offset < 0:
            urgency = "overdue"
        elif order_by_date_offset < 7:
            urgency = "urgent"
        else:
            urgency = "ok"

        actual_stock: float = stock_data.get(row.item_code, 0.0)
        remaining_qty: float = float(row.qty or 0)
        lane = "stock" if actual_stock >= remaining_qty > 0 else "order"

        result.append({
            "so_item_name":   row.so_item_name,
            "sales_order":    row.sales_order,
            "delivery_date":  str(row.delivery_date) if row.delivery_date else None,
            "item_code":      row.item_code,
            "item_name":      row.item_name,
            "qty":            remaining_qty,
            "uom":            row.uom or row.stock_uom or "",
            "supplier_name":  supplier_name,
            "lead_time_days": lead_time_days,
            "days_to_order":  order_by_date_offset,
            "urgency":        urgency,
            "lane":           lane,
        })

    return result


# ── Order action ───────────────────────────────────────────────────────────────

@frappe.whitelist()
def create_po_from_so_item(so_item_name: str, supplier: str = "") -> dict:
    """Create a draft Purchase Order for one Sales Order item.

    Args:
        so_item_name: name of the Sales Order Item row.
        supplier: supplier ID to use on the PO (may be empty; will fall back to
                  item master default supplier).

    Returns:
        {"po_name": "PO-XXXX", "po_url": "/app/purchase-order/PO-XXXX"}
    """
    if frappe.session.user == "Guest":
        frappe.throw(_("Authentication required"), frappe.PermissionError)

    so_item = frappe.get_doc("Sales Order Item", so_item_name)
    so = frappe.get_doc("Sales Order", so_item.parent)

    if so.docstatus != 1:
        frappe.throw(_("Sales Order {0} is not submitted.").format(so.name))

    remaining_qty = flt(so_item.qty) - flt(so_item.delivered_qty or 0)
    if remaining_qty <= 0:
        frappe.throw(_("This Sales Order line has already been fully delivered."))

    # Resolve supplier: explicit arg → item master → error
    resolved_supplier = (supplier or "").strip()
    if not resolved_supplier:
        resolved_supplier = (
            frappe.db.get_value("Item", so_item.item_code, "cm_supplier_name") or ""
        ).strip()
    if not resolved_supplier:
        frappe.throw(
            _("No supplier found for item {0}. Please specify a supplier.").format(
                so_item.item_code
            )
        )

    # Derive schedule_date from SO delivery_date (fallback to today + lead_time).
    schedule_date = so_item.delivery_date or frappe.utils.nowdate()

    # Build the PO item row.
    item_master = frappe.db.get_value(
        "Item",
        so_item.item_code,
        ["stock_uom", "cm_supplier_item_name", "cm_supplier_item_code",
         "cm_supplier_variant_description"],
        as_dict=True,
    ) or {}

    supplier_item_name = (item_master.get("cm_supplier_item_name") or "").strip()
    display_name = supplier_item_name or so_item.item_name or so_item.item_code

    po = frappe.new_doc("Purchase Order")
    po.company = so.company
    po.supplier = resolved_supplier
    po.schedule_date = schedule_date
    po.append(
        "items",
        {
            "item_code":           so_item.item_code,
            "item_name":           display_name,
            "qty":                 remaining_qty,
            "uom":                 so_item.uom or item_master.get("stock_uom") or "Nos",
            "schedule_date":       schedule_date,
            "sales_order":         so.name,
            "sales_order_item":    so_item.name,
            "cm_supplier_item_code": (item_master.get("cm_supplier_item_code") or "").strip() or None,
            "description":         (item_master.get("cm_supplier_variant_description") or "").strip() or None,
        },
    )
    po.insert(ignore_permissions=False)

    po_url = f"/app/purchase-order/{frappe.utils.quote(po.name)}"
    return {"po_name": po.name, "po_url": po_url}


# ── Allocate action ────────────────────────────────────────────────────────────

@frappe.whitelist()
def allocate_so_item(so_item_name: str) -> dict:
    """Create and submit a Stock Reservation Entry for one Sales Order item.

    Picks the warehouse that currently holds the most stock for the item
    (must have at least the remaining qty available).

    Returns:
        {"sre_name": "SRE-XXXX", "warehouse": "<warehouse>"}
    """
    if frappe.session.user == "Guest":
        frappe.throw(_("Authentication required"), frappe.PermissionError)

    so_item = frappe.get_doc("Sales Order Item", so_item_name)
    so = frappe.get_doc("Sales Order", so_item.parent)

    if so.docstatus != 1:
        frappe.throw(_("Sales Order {0} is not submitted.").format(so.name))

    remaining_qty = flt(so_item.qty) - flt(so_item.delivered_qty or 0)
    if remaining_qty <= 0:
        frappe.throw(_("This Sales Order line has already been fully delivered."))

    stock_uom = (
        frappe.db.get_value("Item", so_item.item_code, "stock_uom") or so_item.uom or "Nos"
    )

    # Find warehouse(s) belonging to the SO's company with sufficient stock.
    bin_rows = frappe.db.sql(
        """
        SELECT b.warehouse, b.actual_qty
        FROM `tabBin` b
        JOIN `tabWarehouse` w ON w.name = b.warehouse
        WHERE b.item_code = %(item_code)s
          AND w.company = %(company)s
          AND w.is_group = 0
          AND b.actual_qty >= %(qty)s
        ORDER BY b.actual_qty DESC
        LIMIT 1
        """,
        {"item_code": so_item.item_code, "company": so.company, "qty": remaining_qty},
        as_dict=True,
    )

    if not bin_rows:
        frappe.throw(
            _(
                "Insufficient stock for item {0}. No single warehouse holds {1} {2}."
            ).format(so_item.item_code, remaining_qty, stock_uom)
        )

    warehouse = bin_rows[0].warehouse

    sre = frappe.new_doc("Stock Reservation Entry")
    sre.item_code = so_item.item_code
    sre.warehouse = warehouse
    sre.voucher_type = "Sales Order"
    sre.voucher_no = so.name
    sre.voucher_detail_no = so_item.name
    sre.stock_uom = stock_uom
    sre.company = so.company
    sre.reserved_qty = remaining_qty
    sre.reservation_based_on = "Qty"
    sre.insert(ignore_permissions=False)
    sre.submit()

    return {"sre_name": sre.name, "warehouse": warehouse}
