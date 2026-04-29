"""products_export.py

Unified CM Product Data Export API — returns all product master fields
(identity, supplier, cost inputs, pricing inputs + server-computed outputs)
LEFT JOINed with aggregated free stock from tabBin.

Used by the DMS React frontend's "Export" button in ProductCsvImportModal.
The resulting workbook feeds back into the "Upload" sheet for round-trip updates.
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

import frappe


# ── Stored columns fetched by SQL ─────────────────────────────────────────────
# All have real DB columns in tabCM Product.  name = cm_given_code.
_STORED_CM_COLS = [
    # Identifier (autoname field)
    "name",
    # Identity
    "item_name",
    "cm_given_name",
    "cm_description_line_1",
    "cm_description_line_2",
    "item_group",
    "stock_uom",
    "is_stock_item",
    "disabled",
    "cm_product_type",
    "cm_hidden_from_catalogue",
    "cm_tiles_per_box",
    "cm_sqm_per_box",
    # Supplier
    "cm_supplier_name",
    "cm_supplier_code",
    # Cost inputs
    "cm_purchase_price_ex_vat",
    "cm_shipping_percent",
    "cm_shipping_fee",
    "cm_handling_fee",
    "cm_other_landed",
    "cm_delivery_installation_fee",
    # Pricing inputs
    "cm_vat_rate_percent",
    "cm_target_margin_percent",
    "cm_rrp_ex_vat",
    "cm_rrp_manual_override",
    "cm_show_inc_vat",
    # Offer tier inputs (editable)
    "cm_offer_tier1_inc_vat",
    "cm_offer_tier2_inc_vat",
    "cm_offer_tier3_inc_vat",
    # Server-computed fields (stored on save by controller)
    "cm_landed_additions_total_ex_vat",
    "cm_cost_ex_vat_calculated",
    "cm_rrp_inc_vat",
    "cm_offer_tier1_ex_vat",
    "cm_offer_tier1_discount_pct",
    "cm_offer_tier2_ex_vat",
    "cm_offer_tier2_discount_pct",
    "cm_offer_tier3_ex_vat",
    "cm_offer_tier3_discount_pct",
]


def _d(value) -> Decimal:
    if value is None or value == "":
        return Decimal("0")
    return Decimal(str(value))


def _q2(v: Decimal) -> Decimal:
    return v.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _q3(v: Decimal) -> Decimal:
    return v.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def _compute_profitability(row: dict) -> None:
    """Compute profit / margin / markup from tier-1 and cost (not stored on CM Product)."""
    t1_ex = _d(row.get("cm_offer_tier1_ex_vat"))
    cost = _d(row.get("cm_cost_ex_vat_calculated"))
    ZERO = Decimal("0")
    if t1_ex > ZERO and cost > ZERO:
        profit = _q2(t1_ex - cost)
        margin = _q3(profit / t1_ex * 100)
        markup = _q3(profit / cost * 100)
    else:
        profit = margin = markup = ZERO
    row["cm_profit_ex_vat"] = float(profit)
    row["cm_margin_percent"] = float(margin)
    row["cm_markup_percent"] = float(markup)


@frappe.whitelist()
def get_unified_product_data() -> list[dict]:
    """Return all CM Products with full field set + free stock.

    The `name` column = cm_given_code (product identifier used for round-trip
    uploads). Profitability (profit / margin / markup) is computed here since
    it is not stored as a field on tabCM Product.
    """
    col_sql = ", ".join(f"i.`{c}`" for c in _STORED_CM_COLS)

    sql = f"""
        SELECT
            {col_sql},
            IFNULL(SUM(
                IFNULL(b.actual_qty, 0) - IFNULL(b.reserved_qty, 0)
            ), 0) AS free_stock
        FROM `tabCM Product` i
        LEFT JOIN `tabBin` b ON b.item_code = i.name
        GROUP BY i.name
        ORDER BY i.name
    """

    rows = frappe.db.sql(sql, as_dict=True)

    for row in rows:
        _compute_profitability(row)

    return rows
