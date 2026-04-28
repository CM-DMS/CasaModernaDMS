"""
vat_return_api.py — Malta VAT Return summary for Casa Moderna.

Produces the Box 1–9 figures required for the Malta Tax Department
VAT return (VAT period can be monthly or quarterly).

Box layout (Malta standard VAT return):
  Box 1  — Total taxable supplies (ex-VAT) at standard rate (18%)
  Box 2  — Total VAT charged on standard-rate supplies
  Box 3  — Total VAT due on acquisitions (reverse charge, if any)
  Box 4  — Total VAT due (Box 2 + Box 3)
  Box 5  — Total input VAT reclaimable (purchases / bills)
  Box 6  — Net VAT payable (Box 4 − Box 5)
  Box 7  — Total value of sales (ex-VAT), including zero/exempt
  Box 8  — Total value of purchases/expenses (ex-VAT)
  Box 9  — Memo: total exempt / zero-rated supplies

Data sources:
  Sales   → Sales Invoice + Cash Sales POS Invoice (submitted, not returns)
  Credits → Sales Invoice returns (credit notes), reduces Box 1/2
  Input   → Purchase Invoice (submitted), Bills (tabPurchase Invoice)
"""
from __future__ import annotations

import frappe
from frappe import _


@frappe.whitelist()
def get_vat_return(date_from: str, date_to: str) -> dict:
    """
    Return Malta VAT return boxes for the given period.

    Args:
        date_from: YYYY-MM-DD
        date_to:   YYYY-MM-DD

    Returns dict with keys: boxes, detail_sales, detail_purchases, period
    """
    if not frappe.has_permission("Sales Invoice", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    params = {"df": date_from, "dt": date_to}

    # ── OUTPUT TAX (Sales) ────────────────────────────────────────────────

    # Standard-rate sales invoices (non-return)
    sales = frappe.db.sql(
        """
        SELECT
            IFNULL(SUM(net_total),       0) AS net_total,
            IFNULL(SUM(total_taxes_and_charges), 0) AS vat_charged,
            IFNULL(SUM(grand_total),     0) AS grand_total,
            COUNT(*)                          AS invoice_count
        FROM `tabSales Invoice`
        WHERE docstatus = 1
          AND is_return  = 0
          AND DATE(posting_date) BETWEEN %(df)s AND %(dt)s
        """,
        params,
        as_dict=True,
    )[0]

    # Credit notes (returns) — reduce output
    credits = frappe.db.sql(
        """
        SELECT
            IFNULL(SUM(ABS(net_total)),       0) AS net_total,
            IFNULL(SUM(ABS(total_taxes_and_charges)), 0) AS vat_charged,
            IFNULL(SUM(ABS(grand_total)),     0) AS grand_total,
            COUNT(*)                               AS invoice_count
        FROM `tabSales Invoice`
        WHERE docstatus = 1
          AND is_return  = 1
          AND DATE(posting_date) BETWEEN %(df)s AND %(dt)s
        """,
        params,
        as_dict=True,
    )[0]

    # Cash / POS sales
    cash_sales = frappe.db.sql(
        """
        SELECT
            IFNULL(SUM(net_total), 0)                AS net_total,
            IFNULL(SUM(total_taxes_and_charges), 0)  AS vat_charged,
            IFNULL(SUM(grand_total), 0)              AS grand_total,
            COUNT(*)                                  AS invoice_count
        FROM `tabPOS Invoice`
        WHERE docstatus = 1
          AND is_return  = 0
          AND DATE(posting_date) BETWEEN %(df)s AND %(dt)s
        """,
        params,
        as_dict=True,
    )[0]

    # ── INPUT TAX (Purchases / Bills) ────────────────────────────────────

    purchases = frappe.db.sql(
        """
        SELECT
            IFNULL(SUM(net_total),       0) AS net_total,
            IFNULL(SUM(total_taxes_and_charges), 0) AS vat_reclaimable,
            IFNULL(SUM(grand_total),     0) AS grand_total,
            COUNT(*)                          AS invoice_count
        FROM `tabPurchase Invoice`
        WHERE docstatus = 1
          AND is_return  = 0
          AND DATE(posting_date) BETWEEN %(df)s AND %(dt)s
        """,
        params,
        as_dict=True,
    )[0]

    # ── Box calculations ──────────────────────────────────────────────────

    # Net taxable supplies = sales + cash_sales - credits
    box1_taxable = (
        float(sales["net_total"])
        + float(cash_sales["net_total"])
        - float(credits["net_total"])
    )

    # Output VAT = sales vat + cash vat - credit vat
    box2_output_vat = (
        float(sales["vat_charged"])
        + float(cash_sales["vat_charged"])
        - float(credits["vat_charged"])
    )

    box3_acquisitions_vat = 0.0          # reverse charge (not applicable for CM currently)
    box4_vat_due = box2_output_vat + box3_acquisitions_vat
    box5_input_vat = float(purchases["vat_reclaimable"])
    box6_net_payable = box4_vat_due - box5_input_vat

    # Total value of all supplies (gross receipts line — for information)
    box7_total_sales = (
        float(sales["grand_total"])
        + float(cash_sales["grand_total"])
        - float(credits["grand_total"])
    )
    box8_total_purchases = float(purchases["grand_total"])
    box9_exempt_zero = 0.0               # CM supplies are standard-rate only currently

    # ── Detailed sales line breakdown ─────────────────────────────────────

    detail_sales = frappe.db.sql(
        """
        SELECT
            si.name,
            si.posting_date,
            si.customer_name,
            si.net_total,
            si.total_taxes_and_charges AS vat,
            si.grand_total,
            IF(si.is_return = 1, 'Credit Note', 'Invoice') AS doc_type
        FROM `tabSales Invoice` si
        WHERE si.docstatus = 1
          AND DATE(si.posting_date) BETWEEN %(df)s AND %(dt)s
        ORDER BY si.posting_date ASC, si.name ASC
        LIMIT 500
        """,
        params,
        as_dict=True,
    )

    # ── Purchase line breakdown ───────────────────────────────────────────

    detail_purchases = frappe.db.sql(
        """
        SELECT
            pi.name,
            pi.posting_date,
            pi.supplier_name,
            pi.net_total,
            pi.total_taxes_and_charges AS vat,
            pi.grand_total
        FROM `tabPurchase Invoice` pi
        WHERE pi.docstatus = 1
          AND DATE(pi.posting_date) BETWEEN %(df)s AND %(dt)s
        ORDER BY pi.posting_date ASC, pi.name ASC
        LIMIT 500
        """,
        params,
        as_dict=True,
    )

    return {
        "period": {"from": date_from, "to": date_to},
        "boxes": {
            "box1_taxable":         round(box1_taxable, 2),
            "box2_output_vat":      round(box2_output_vat, 2),
            "box3_acquisitions_vat":round(box3_acquisitions_vat, 2),
            "box4_vat_due":         round(box4_vat_due, 2),
            "box5_input_vat":       round(box5_input_vat, 2),
            "box6_net_payable":     round(box6_net_payable, 2),
            "box7_total_sales":     round(box7_total_sales, 2),
            "box8_total_purchases": round(box8_total_purchases, 2),
            "box9_exempt_zero":     round(box9_exempt_zero, 2),
        },
        "sales_invoices":  sales["invoice_count"],
        "cash_invoices":   cash_sales["invoice_count"],
        "credit_notes":    credits["invoice_count"],
        "purchase_invoices": purchases["invoice_count"],
        "detail_sales":    detail_sales,
        "detail_purchases": detail_purchases,
    }
