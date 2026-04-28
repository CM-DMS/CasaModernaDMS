"""
aged_ar_ap_api.py — Aged Receivables and Aged Payables reports for Casa Moderna.

Ageing buckets (days overdue):
  Current   — not yet due (or due today)
  1–30      — 1 to 30 days overdue
  31–60     — 31 to 60 days overdue
  61–90     — 61 to 90 days overdue
  90+       — over 90 days overdue

AR source: tabSales Invoice (outstanding_amount > 0, docstatus = 1, is_return = 0)
AP source: tabPurchase Invoice (outstanding_amount > 0, docstatus = 1, is_return = 0)
"""
from __future__ import annotations

from datetime import date as _date

import frappe
from frappe import _


def _age_bucket(due_date_str, as_of: _date) -> str:
    """Return the ageing bucket label for a due date."""
    if not due_date_str:
        return "Current"
    due = _date.fromisoformat(str(due_date_str)[:10])
    days = (as_of - due).days
    if days <= 0:
        return "Current"
    if days <= 30:
        return "1-30"
    if days <= 60:
        return "31-60"
    if days <= 90:
        return "61-90"
    return "90+"


BUCKET_ORDER = ["Current", "1-30", "31-60", "61-90", "90+"]


def _build_ageing(rows: list[dict], party_field: str, name_field: str, as_of: _date) -> dict:
    """Group rows into party-level ageing summary."""
    parties: dict[str, dict] = {}

    for r in rows:
        key = r[party_field]
        if key not in parties:
            parties[key] = {
                "party": key,
                "party_name": r.get(name_field, key),
                "total": 0.0,
                **{b: 0.0 for b in BUCKET_ORDER},
            }
        bucket = _age_bucket(r.get("due_date"), as_of)
        amt = float(r.get("outstanding_amount") or 0)
        parties[key][bucket] += amt
        parties[key]["total"] += amt

    result = sorted(parties.values(), key=lambda x: x["total"], reverse=True)

    totals = {"party": "TOTAL", "party_name": "", "total": 0.0, **{b: 0.0 for b in BUCKET_ORDER}}
    for p in result:
        for b in BUCKET_ORDER:
            totals[b] += p[b]
        totals["total"] += p["total"]

    for k in list(totals.keys()):
        if isinstance(totals[k], float):
            totals[k] = round(totals[k], 2)
    for p in result:
        for k in list(p.keys()):
            if isinstance(p[k], float):
                p[k] = round(p[k], 2)

    return {"rows": result, "totals": totals, "as_of": str(as_of)}


@frappe.whitelist()
def get_aged_receivables(as_of_date: str | None = None) -> dict:
    """Return aged debtors (AR) report as of the given date (defaults to today)."""
    if not frappe.has_permission("Sales Invoice", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    as_of = _date.fromisoformat(as_of_date) if as_of_date else _date.today()

    rows = frappe.db.sql(
        """
        SELECT
            si.customer                  AS party,
            si.customer_name             AS party_name,
            si.name,
            si.posting_date,
            si.due_date,
            si.outstanding_amount,
            si.currency
        FROM `tabSales Invoice` si
        WHERE si.docstatus = 1
          AND si.is_return = 0
          AND si.outstanding_amount > 0.001
          AND DATE(si.posting_date) <= %(as_of)s
        ORDER BY si.customer, si.due_date
        """,
        {"as_of": str(as_of)},
        as_dict=True,
    )

    return _build_ageing(rows, "party", "party_name", as_of)


@frappe.whitelist()
def get_aged_payables(as_of_date: str | None = None) -> dict:
    """Return aged creditors (AP) report as of the given date (defaults to today)."""
    if not frappe.has_permission("Purchase Invoice", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    as_of = _date.fromisoformat(as_of_date) if as_of_date else _date.today()

    rows = frappe.db.sql(
        """
        SELECT
            pi.supplier                  AS party,
            pi.supplier_name             AS party_name,
            pi.name,
            pi.posting_date,
            pi.due_date,
            pi.outstanding_amount,
            pi.currency
        FROM `tabPurchase Invoice` pi
        WHERE pi.docstatus = 1
          AND pi.is_return = 0
          AND pi.outstanding_amount > 0.001
          AND DATE(pi.posting_date) <= %(as_of)s
        ORDER BY pi.supplier, pi.due_date
        """,
        {"as_of": str(as_of)},
        as_dict=True,
    )

    return _build_ageing(rows, "party", "party_name", as_of)
