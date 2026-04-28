"""
supplier_performance_api.py — Supplier delivery and quality performance scoring.

Metrics calculated per supplier over a given period:
  - on_time_rate        %  — GRN items received on or before PO required_date
  - avg_delay_days         — average days late (positive = late)
  - order_count            — number of submitted POs
  - grn_count              — number of GRNs received
  - quality_issues         — count of Purchase Returns (GRN returns / debit notes)
  - quality_rate        %  — 100 − (quality_issues / grn_count * 100)
  - performance_score   0–100 composite (70% on-time + 30% quality)
"""
from __future__ import annotations

import frappe
from frappe import _


def _score(on_time_rate: float, quality_rate: float) -> float:
    return round(0.70 * on_time_rate + 0.30 * quality_rate, 1)


@frappe.whitelist()
def get_supplier_performance(
    date_from: str,
    date_to: str,
    supplier: str = "",
) -> list[dict]:
    """Return supplier performance summary for the given period."""
    if not frappe.has_permission("Purchase Order", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    params = {"df": date_from, "dt": date_to}
    supplier_filter = "AND po.supplier = %(sup)s" if supplier else ""
    if supplier:
        params["sup"] = supplier

    # ── PO counts ──────────────────────────────────────────────────────────
    po_rows = frappe.db.sql(
        f"""
        SELECT po.supplier, po.supplier_name, COUNT(*) AS order_count
        FROM `tabPurchase Order` po
        WHERE po.docstatus = 1
          AND DATE(po.transaction_date) BETWEEN %(df)s AND %(dt)s
          {supplier_filter}
        GROUP BY po.supplier, po.supplier_name
        """,
        params,
        as_dict=True,
    )

    if not po_rows:
        return []

    supplier_ids = [r["supplier"] for r in po_rows]
    supplier_map = {r["supplier"]: r for r in po_rows}
    placeholders = ", ".join(["%s"] * len(supplier_ids))

    # ── GRN on-time analysis ───────────────────────────────────────────────
    # Compare GRN posting_date vs PO item schedule_date
    grn_rows = frappe.db.sql(
        f"""
        SELECT
            pr.supplier,
            COUNT(DISTINCT pr.name)                             AS grn_count,
            SUM(CASE WHEN DATE(pr.posting_date) <= poi.schedule_date THEN 1 ELSE 0 END) AS on_time,
            AVG(DATEDIFF(DATE(pr.posting_date), poi.schedule_date))                      AS avg_delay
        FROM `tabPurchase Receipt` pr
        INNER JOIN `tabPurchase Receipt Item` pri ON pri.parent = pr.name
        INNER JOIN `tabPurchase Order Item` poi   ON poi.name   = pri.purchase_order_item
        WHERE pr.docstatus = 1
          AND DATE(pr.posting_date) BETWEEN %(df)s AND %(dt)s
          AND pr.supplier IN ({placeholders})
        GROUP BY pr.supplier
        """,
        params + (supplier_ids,) if False else {**params, **{f"s{i}": s for i, s in enumerate(supplier_ids)}},
        # ↑ frappe.db.sql doesn't support list params directly; use separate approach below
        as_dict=True,
    ) if False else []

    # Safer parameterised approach for the IN list:
    grn_rows = frappe.db.sql(
        """
        SELECT
            pr.supplier,
            COUNT(DISTINCT pr.name)                                                      AS grn_count,
            SUM(CASE WHEN DATE(pr.posting_date) <= poi.schedule_date THEN 1 ELSE 0 END) AS on_time,
            AVG(DATEDIFF(DATE(pr.posting_date), poi.schedule_date))                      AS avg_delay
        FROM `tabPurchase Receipt` pr
        INNER JOIN `tabPurchase Receipt Item` pri ON pri.parent = pr.name
        INNER JOIN `tabPurchase Order Item` poi   ON poi.name   = pri.purchase_order_item
        WHERE pr.docstatus = 1
          AND DATE(pr.posting_date) BETWEEN %(df)s AND %(dt)s
          AND pr.supplier IN %(suppliers)s
        GROUP BY pr.supplier
        """,
        {**params, "suppliers": tuple(supplier_ids)},
        as_dict=True,
    )

    # ── Quality issues (Purchase Returns / Debit Notes) ────────────────────
    quality_rows = frappe.db.sql(
        """
        SELECT supplier, COUNT(*) AS quality_issues
        FROM `tabPurchase Invoice`
        WHERE docstatus = 1
          AND is_return = 1
          AND DATE(posting_date) BETWEEN %(df)s AND %(dt)s
          AND supplier IN %(suppliers)s
        GROUP BY supplier
        """,
        {**params, "suppliers": tuple(supplier_ids)},
        as_dict=True,
    )

    grn_map = {r["supplier"]: r for r in grn_rows}
    quality_map = {r["supplier"]: r["quality_issues"] for r in quality_rows}

    results = []
    for sup_id, po_data in supplier_map.items():
        grn = grn_map.get(sup_id, {})
        grn_count = int(grn.get("grn_count") or 0)
        on_time = int(grn.get("on_time") or 0)
        avg_delay = round(float(grn.get("avg_delay") or 0), 1)
        quality_issues = int(quality_map.get(sup_id, 0))

        on_time_rate = round((on_time / grn_count * 100) if grn_count > 0 else 0, 1)
        quality_rate = round(
            max(0, 100 - (quality_issues / grn_count * 100)) if grn_count > 0 else 100,
            1,
        )
        perf_score = _score(on_time_rate, quality_rate)

        results.append({
            "supplier": sup_id,
            "supplier_name": po_data["supplier_name"],
            "order_count": po_data["order_count"],
            "grn_count": grn_count,
            "on_time": on_time,
            "on_time_rate": on_time_rate,
            "avg_delay_days": avg_delay,
            "quality_issues": quality_issues,
            "quality_rate": quality_rate,
            "performance_score": perf_score,
            "grade": "A" if perf_score >= 90 else "B" if perf_score >= 75 else "C" if perf_score >= 60 else "D",
        })

    results.sort(key=lambda x: x["performance_score"], reverse=True)
    return results
