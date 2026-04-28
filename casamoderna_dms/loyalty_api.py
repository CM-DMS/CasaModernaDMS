"""
loyalty_api.py — Customer Loyalty Tier system for Casa Moderna.

Tier thresholds are based on lifetime ex-VAT spending (submitted Sales Orders + Sales Invoices).

Tiers:
  Bronze    €0        – €4,999
  Silver    €5,000    – €14,999
  Gold      €15,000   – €29,999
  Platinum  €30,000+

Each tier unlocks a default additional discount available in Sales Docs
(applied as a price list or validated in the CM pricing hook).
"""
from __future__ import annotations

import frappe
from frappe import _

# (min_spend_inclusive, tier_name, discount_pct, accent_color)
_TIERS = [
    (0,      "Bronze",   0.0,  "#cd7f32"),
    (5000,   "Silver",   2.0,  "#9e9e9e"),
    (15000,  "Gold",     3.5,  "#fdd835"),
    (30000,  "Platinum", 5.0,  "#b0bec5"),
]


def _tier_for(spend: float) -> dict:
    tier = _TIERS[0]
    for t in _TIERS:
        if spend >= t[0]:
            tier = t
    return {
        "tier": tier[1],
        "min_spend": tier[0],
        "discount_pct": tier[2],
        "color": tier[3],
    }


def _next_tier(spend: float) -> dict | None:
    """Return the next tier above current spend, or None if already Platinum."""
    current_min = 0
    for t in _TIERS:
        if spend >= t[0]:
            current_min = t[0]
    for t in _TIERS:
        if t[0] > current_min:
            return {"tier": t[1], "min_spend": t[0], "discount_pct": t[2], "remaining": round(t[0] - spend, 2)}
    return None


@frappe.whitelist()
def get_customer_loyalty(customer: str) -> dict:
    """
    Return loyalty tier and spend summary for a customer.

    Spend is calculated from:
      - Submitted Sales Invoices (net_total, non-return)
      - Submitted Sales Orders not yet invoiced (base_net_total)
    """
    if not frappe.has_permission("Customer", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    # Invoiced spend (most authoritative)
    invoiced = frappe.db.sql(
        """
        SELECT IFNULL(SUM(net_total), 0)
        FROM `tabSales Invoice`
        WHERE customer = %(c)s
          AND docstatus = 1
          AND is_return = 0
        """,
        {"c": customer},
        as_list=True,
    )[0][0]

    # Orders placed (not yet invoiced) — avoid double-counting fully billed SOs
    pending_so = frappe.db.sql(
        """
        SELECT IFNULL(SUM(base_net_total), 0)
        FROM `tabSales Order`
        WHERE customer = %(c)s
          AND docstatus = 1
          AND billing_status IN ('Not Billed', 'Partly Billed')
        """,
        {"c": customer},
        as_list=True,
    )[0][0]

    lifetime_spend = float(invoiced or 0) + float(pending_so or 0)
    tier_info = _tier_for(lifetime_spend)
    next_tier = _next_tier(lifetime_spend)

    # Count of orders
    order_count = frappe.db.sql(
        """SELECT COUNT(*) FROM `tabSales Order` WHERE customer=%(c)s AND docstatus=1""",
        {"c": customer},
        as_list=True,
    )[0][0]

    return {
        "customer": customer,
        "lifetime_spend": round(float(lifetime_spend), 2),
        "invoiced_spend": round(float(invoiced or 0), 2),
        "pending_spend": round(float(pending_so or 0), 2),
        "order_count": int(order_count or 0),
        "tier": tier_info["tier"],
        "tier_discount_pct": tier_info["discount_pct"],
        "tier_color": tier_info["color"],
        "next_tier": next_tier,
        "tiers": [
            {"tier": t[1], "min_spend": t[0], "discount_pct": t[2], "color": t[3]}
            for t in _TIERS
        ],
    }


@frappe.whitelist()
def get_loyalty_leaderboard(limit: int = 20) -> list[dict]:
    """Return top N customers by lifetime spend with tier info."""
    if not frappe.has_permission("Customer", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    rows = frappe.db.sql(
        """
        SELECT
            si.customer,
            si.customer_name,
            IFNULL(SUM(si.net_total), 0) AS lifetime_spend,
            COUNT(si.name)               AS invoice_count
        FROM `tabSales Invoice` si
        WHERE si.docstatus = 1
          AND si.is_return = 0
        GROUP BY si.customer, si.customer_name
        ORDER BY lifetime_spend DESC
        LIMIT %(lim)s
        """,
        {"lim": int(limit)},
        as_dict=True,
    )

    for r in rows:
        spend = float(r["lifetime_spend"] or 0)
        t = _tier_for(spend)
        r["tier"] = t["tier"]
        r["tier_color"] = t["color"]
        r["tier_discount_pct"] = t["discount_pct"]
        r["lifetime_spend"] = round(spend, 2)

    return rows
