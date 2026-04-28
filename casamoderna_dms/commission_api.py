"""
commission_api.py — Monthly tiered commission calculation for Casa Moderna.

Commission tiers (applied to each salesperson's total ex-VAT SO value for the month):
  €0 – €50,000        → 1.0%
  €50,001 – €100,000  → 1.5%
  €100,001 – €150,000 → 2.0%
  €150,001 – €200,000 → 2.5%
  €200,001+           → 3.0%

Team bonus: €1,000 pool shared pro-rata if collective monthly ex-VAT total ≥ €200,000.
"""
from __future__ import annotations

import frappe
from frappe import _

# --- Tier configuration ----------------------------------------------------- #
#  Each entry: (upper_bound_exclusive, rate_percent)
#  The last tier has no upper bound (None).
_TIERS: list[tuple[float | None, float]] = [
    (50_000,  1.0),
    (100_000, 1.5),
    (150_000, 2.0),
    (200_000, 2.5),
    (None,    3.0),
]

_TEAM_BONUS_POOL = 1_000.0
_TEAM_BONUS_THRESHOLD = 200_000.0


def _commission_rate(total_ex_vat: float) -> float:
    """Return the commission rate % applicable for a given monthly ex-VAT total."""
    for upper, rate in _TIERS:
        if upper is None or total_ex_vat <= upper:
            return rate
    return _TIERS[-1][1]


def _tier_label(rate: float) -> str:
    labels = {1.0: "Tier 1", 1.5: "Tier 2", 2.0: "Tier 3", 2.5: "Tier 4", 3.0: "Tier 5"}
    return labels.get(rate, f"{rate}%")


@frappe.whitelist()
def get_commission_report(date_from: str, date_to: str) -> dict:
    """
    Return commission summary for all salespersons with submitted Sales Orders
    in [date_from, date_to].

    Returns:
      {
        "rows": [
          {
            "sales_person": str,
            "orders": int,
            "total_ex_vat": float,
            "rate": float,          # commission rate %
            "tier": str,            # human label
            "commission": float,    # commission amount €
            "team_bonus": float,    # share of team bonus €
            "total_earned": float,  # commission + team_bonus
          },
          ...
        ],
        "totals": {
          "orders": int,
          "total_ex_vat": float,
          "commission": float,
          "team_bonus": float,
          "total_earned": float,
        },
        "team_bonus_triggered": bool,
        "team_bonus_pool": float,
      }
    """
    if not frappe.has_permission("Sales Order", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    # Fetch submitted SOs in period — use base_net_total (ex-VAT system currency amount)
    rows = frappe.db.sql(
        """
        SELECT
            COALESCE(cm_sales_person, '') AS sales_person,
            COUNT(*)                      AS orders,
            COALESCE(SUM(base_net_total), 0) AS total_ex_vat
        FROM `tabSales Order`
        WHERE docstatus = 1
          AND transaction_date >= %(date_from)s
          AND transaction_date <= %(date_to)s
        GROUP BY cm_sales_person
        ORDER BY total_ex_vat DESC
        """,
        {"date_from": date_from, "date_to": date_to},
        as_dict=True,
    )

    if not rows:
        return {
            "rows": [],
            "totals": {"orders": 0, "total_ex_vat": 0.0, "commission": 0.0, "team_bonus": 0.0, "total_earned": 0.0},
            "team_bonus_triggered": False,
            "team_bonus_pool": _TEAM_BONUS_POOL,
        }

    # Calculate per-person commission
    for r in rows:
        r["total_ex_vat"] = float(r["total_ex_vat"] or 0)
        rate = _commission_rate(r["total_ex_vat"])
        r["rate"] = rate
        r["tier"] = _tier_label(rate)
        r["commission"] = round(r["total_ex_vat"] * rate / 100, 2)
        r["team_bonus"] = 0.0
        r["total_earned"] = r["commission"]

    # Team bonus
    grand_total_ex_vat = sum(r["total_ex_vat"] for r in rows)
    team_bonus_triggered = grand_total_ex_vat >= _TEAM_BONUS_THRESHOLD

    if team_bonus_triggered and grand_total_ex_vat > 0:
        for r in rows:
            share = r["total_ex_vat"] / grand_total_ex_vat
            r["team_bonus"] = round(_TEAM_BONUS_POOL * share, 2)
            r["total_earned"] = round(r["commission"] + r["team_bonus"], 2)

    totals = {
        "orders":       sum(r["orders"] for r in rows),
        "total_ex_vat": round(grand_total_ex_vat, 2),
        "commission":   round(sum(r["commission"] for r in rows), 2),
        "team_bonus":   round(sum(r["team_bonus"] for r in rows), 2),
        "total_earned": round(sum(r["total_earned"] for r in rows), 2),
    }

    return {
        "rows": rows,
        "totals": totals,
        "team_bonus_triggered": team_bonus_triggered,
        "team_bonus_pool": _TEAM_BONUS_POOL,
    }
