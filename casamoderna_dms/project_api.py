"""
project_api.py — Interior Design Project / Fit-Out module for Casa Moderna.

A CM Project groups multiple Sales Orders for a single client under one umbrella
(e.g. a full apartment fit-out with kitchen, bedroom, living room phases).
"""
from __future__ import annotations

import frappe
from frappe import _


@frappe.whitelist()
def get_project_list(
    customer: str = "",
    status: str = "",
    project_type: str = "",
    limit: int = 50,
) -> list[dict]:
    """Return CM Project list with optional filters."""
    if not frappe.has_permission("CM Project", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    filters: list = []
    if customer:
        filters.append(["customer", "=", customer])
    if status:
        filters.append(["status", "=", status])
    if project_type:
        filters.append(["project_type", "=", project_type])

    return frappe.get_list(
        "CM Project",
        filters=filters,
        fields=[
            "name", "project_name", "customer", "customer_name",
            "status", "project_type", "salesperson",
            "start_date", "expected_completion", "total_value", "description",
        ],
        order_by="modified desc",
        limit_page_length=int(limit),
    )


@frappe.whitelist()
def get_project(name: str) -> dict:
    """Return full CM Project with linked SO details and profit summary."""
    if not frappe.has_permission("CM Project", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    doc = frappe.get_doc("CM Project", name)
    result = doc.as_dict()

    # Parse linked SO names and fetch their details
    so_names = [
        s.strip()
        for s in (doc.linked_sales_orders or "").split("\n")
        if s.strip()
    ]

    linked_orders = []
    total_value = 0.0
    total_cost = 0.0

    if so_names:
        placeholders = ", ".join(["%s"] * len(so_names))
        rows = frappe.db.sql(
            f"""
            SELECT name, transaction_date, status,
                   grand_total, base_net_total,
                   delivery_date, billing_status
            FROM `tabSales Order`
            WHERE name IN ({placeholders})
            """,
            tuple(so_names),
            as_dict=True,
        )
        for r in rows:
            total_value += float(r.get("grand_total") or 0)
            linked_orders.append(r)

    result["linked_orders_detail"] = linked_orders
    result["computed_total_value"] = round(total_value, 2)

    return result


@frappe.whitelist()
def save_project(doc: dict | str) -> dict:
    """Create or update a CM Project. Recalculates total_value from linked SOs."""
    import json
    if isinstance(doc, str):
        doc = json.loads(doc)

    if not frappe.has_permission("CM Project", "write"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    name = doc.get("name")
    if name and frappe.db.exists("CM Project", name):
        d = frappe.get_doc("CM Project", name)
        d.update(doc)
    else:
        d = frappe.new_doc("CM Project")
        d.update(doc)

    # Recalculate total_value from linked SOs
    so_names = [
        s.strip()
        for s in (d.linked_sales_orders or "").split("\n")
        if s.strip()
    ]
    if so_names:
        placeholders = ", ".join(["%s"] * len(so_names))
        total = frappe.db.sql(
            f"SELECT IFNULL(SUM(grand_total), 0) FROM `tabSales Order` WHERE name IN ({placeholders})",
            tuple(so_names),
            as_list=True,
        )[0][0]
        d.total_value = float(total or 0)

    d.save(ignore_permissions=True)
    frappe.db.commit()
    return {"name": d.name, "total_value": d.total_value}


@frappe.whitelist()
def get_project_profitability(name: str) -> dict:
    """
    Return a simplified profitability view for a project:
    - Revenue = sum of Sales Invoice grand_totals for linked SOs
    - COGS     = sum of Delivery Note item valuations (valuation_rate * qty)
    """
    if not frappe.has_permission("CM Project", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    doc = frappe.get_doc("CM Project", name)
    so_names = [
        s.strip()
        for s in (doc.linked_sales_orders or "").split("\n")
        if s.strip()
    ]

    if not so_names:
        return {"revenue": 0, "cogs": 0, "gross_profit": 0, "gp_pct": 0}

    placeholders = ", ".join(["%s"] * len(so_names))

    revenue = frappe.db.sql(
        f"""
        SELECT IFNULL(SUM(si.net_total), 0)
        FROM `tabSales Invoice` si
        INNER JOIN `tabSales Invoice Item` sii ON sii.parent = si.name
        WHERE si.docstatus = 1
          AND si.is_return = 0
          AND sii.sales_order IN ({placeholders})
        """,
        tuple(so_names),
        as_list=True,
    )[0][0]

    cogs = frappe.db.sql(
        f"""
        SELECT IFNULL(SUM(dni.valuation_rate * dni.qty), 0)
        FROM `tabDelivery Note Item` dni
        INNER JOIN `tabDelivery Note` dn ON dn.name = dni.parent
        WHERE dn.docstatus = 1
          AND dni.against_sales_order IN ({placeholders})
        """,
        tuple(so_names),
        as_list=True,
    )[0][0]

    rev = float(revenue or 0)
    cost = float(cogs or 0)
    gp = rev - cost
    gp_pct = round((gp / rev * 100) if rev > 0 else 0, 1)

    return {
        "revenue": round(rev, 2),
        "cogs": round(cost, 2),
        "gross_profit": round(gp, 2),
        "gp_pct": gp_pct,
    }
