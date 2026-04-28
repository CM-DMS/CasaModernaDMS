"""
analytics_api.py — Enhanced Business Intelligence for Casa Moderna.

Provides:
  - Sales funnel (Quotation → SO → DN → Invoice conversion rates)
  - Salesperson league table with target vs actual
  - Top products by gross margin
  - Inventory turnover by item group
  - Outstanding receivables aging summary
"""
from __future__ import annotations

import frappe
from frappe import _


@frappe.whitelist()
def get_sales_funnel(date_from: str, date_to: str) -> dict:
    """
    Return sales funnel conversion rates for the period.
    Stages: Quotations → Sales Orders → Delivery Notes → Sales Invoices
    """
    if not frappe.has_permission("Sales Order", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    params = {"df": date_from, "dt": date_to}

    qt_count = frappe.db.sql(
        "SELECT COUNT(*) FROM `tabQuotation` WHERE docstatus IN (0,1) AND DATE(transaction_date) BETWEEN %(df)s AND %(dt)s",
        params, as_list=True,
    )[0][0]

    so_count = frappe.db.sql(
        "SELECT COUNT(*) FROM `tabSales Order` WHERE docstatus = 1 AND DATE(transaction_date) BETWEEN %(df)s AND %(dt)s",
        params, as_list=True,
    )[0][0]

    dn_count = frappe.db.sql(
        "SELECT COUNT(*) FROM `tabDelivery Note` WHERE docstatus = 1 AND DATE(posting_date) BETWEEN %(df)s AND %(dt)s",
        params, as_list=True,
    )[0][0]

    inv_count = frappe.db.sql(
        "SELECT COUNT(*) FROM `tabSales Invoice` WHERE docstatus = 1 AND is_return = 0 AND DATE(posting_date) BETWEEN %(df)s AND %(dt)s",
        params, as_list=True,
    )[0][0]

    def rate(a, b):
        return round(a / b * 100, 1) if b else 0

    return {
        "quotations": int(qt_count or 0),
        "sales_orders": int(so_count or 0),
        "delivery_notes": int(dn_count or 0),
        "invoices": int(inv_count or 0),
        "qt_to_so_rate": rate(so_count, qt_count),
        "so_to_dn_rate": rate(dn_count, so_count),
        "dn_to_inv_rate": rate(inv_count, dn_count),
        "overall_rate": rate(inv_count, qt_count),
    }


@frappe.whitelist()
def get_salesperson_league(date_from: str, date_to: str) -> list[dict]:
    """
    Return per-salesperson performance: orders, ex-VAT total, avg order value, rank.
    """
    if not frappe.has_permission("Sales Order", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    rows = frappe.db.sql(
        """
        SELECT
            COALESCE(cm_sales_person, '—') AS sales_person,
            COUNT(*)                        AS order_count,
            IFNULL(SUM(base_net_total), 0)  AS total_ex_vat,
            IFNULL(AVG(base_net_total), 0)  AS avg_order_value
        FROM `tabSales Order`
        WHERE docstatus = 1
          AND DATE(transaction_date) BETWEEN %(df)s AND %(dt)s
        GROUP BY cm_sales_person
        ORDER BY total_ex_vat DESC
        """,
        {"df": date_from, "dt": date_to},
        as_dict=True,
    )

    grand_total = sum(float(r["total_ex_vat"] or 0) for r in rows)
    for i, r in enumerate(rows):
        r["rank"] = i + 1
        r["total_ex_vat"] = round(float(r["total_ex_vat"] or 0), 2)
        r["avg_order_value"] = round(float(r["avg_order_value"] or 0), 2)
        r["share_pct"] = round(r["total_ex_vat"] / grand_total * 100, 1) if grand_total else 0

    return rows


@frappe.whitelist()
def get_top_products_by_margin(date_from: str, date_to: str, limit: int = 10) -> list[dict]:
    """
    Return top items by gross margin (selling price − valuation rate).
    Source: Sales Invoice Items joined with Item valuations.
    """
    if not frappe.has_permission("Sales Invoice", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    rows = frappe.db.sql(
        """
        SELECT
            sii.item_code,
            sii.item_name,
            i.item_group,
            SUM(sii.qty)                             AS qty_sold,
            SUM(sii.net_amount)                      AS revenue,
            SUM(sii.qty * IFNULL(i.valuation_rate, 0)) AS cogs,
            SUM(sii.net_amount) - SUM(sii.qty * IFNULL(i.valuation_rate, 0)) AS gross_profit
        FROM `tabSales Invoice Item` sii
        INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
        INNER JOIN `tabItem` i ON i.name = sii.item_code
        WHERE si.docstatus = 1
          AND si.is_return = 0
          AND DATE(si.posting_date) BETWEEN %(df)s AND %(dt)s
        GROUP BY sii.item_code, sii.item_name, i.item_group
        ORDER BY gross_profit DESC
        LIMIT %(lim)s
        """,
        {"df": date_from, "dt": date_to, "lim": int(limit)},
        as_dict=True,
    )

    for r in rows:
        r["revenue"] = round(float(r["revenue"] or 0), 2)
        r["cogs"] = round(float(r["cogs"] or 0), 2)
        r["gross_profit"] = round(float(r["gross_profit"] or 0), 2)
        r["margin_pct"] = round(
            r["gross_profit"] / r["revenue"] * 100 if r["revenue"] else 0, 1
        )

    return rows


@frappe.whitelist()
def get_inventory_turnover(months: int = 3) -> list[dict]:
    """
    Return inventory turnover by item group.
    Turnover = COGS for period / avg stock value for period.
    """
    if not frappe.has_permission("Stock Entry", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    date_from = frappe.utils.add_months(frappe.utils.today(), -int(months))

    rows = frappe.db.sql(
        """
        SELECT
            i.item_group,
            SUM(sle.actual_qty * ABS(sle.valuation_rate)) AS cogs_proxy,
            COUNT(DISTINCT i.name)                          AS sku_count
        FROM `tabStock Ledger Entry` sle
        INNER JOIN `tabItem` i ON i.name = sle.item_code
        WHERE sle.docstatus = 1
          AND sle.actual_qty < 0
          AND DATE(sle.posting_date) >= %(df)s
        GROUP BY i.item_group
        ORDER BY cogs_proxy DESC
        """,
        {"df": date_from},
        as_dict=True,
    )

    # Avg stock value per group
    stock_values = frappe.db.sql(
        """
        SELECT i.item_group, IFNULL(SUM(b.stock_value), 0) AS stock_value
        FROM `tabBin` b
        INNER JOIN `tabItem` i ON i.name = b.item_code
        GROUP BY i.item_group
        """,
        as_dict=True,
    )
    sv_map = {r["item_group"]: float(r["stock_value"] or 0) for r in stock_values}

    period_months = int(months)
    for r in rows:
        r["cogs_proxy"] = round(float(r["cogs_proxy"] or 0), 2)
        sv = sv_map.get(r["item_group"], 0)
        r["stock_value"] = round(sv, 2)
        # Annualised turnover = (cogs / months * 12) / avg_stock
        annualised_cogs = r["cogs_proxy"] / period_months * 12 if period_months else 0
        r["turnover_rate"] = round(annualised_cogs / sv if sv else 0, 2)

    return rows
