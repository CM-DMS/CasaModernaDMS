"""products_export.py

Unified Product Data Export API — returns all product master fields (identity,
supplier, cost ladder, pricing inputs + computed outputs) LEFT JOINed with
aggregated stock balances from tabBin.

Used by the DMS React frontend's "Export unified" button in ProductCsvImportModal.

Virtual fields (is_virtual=1, no DB column) are computed in Python after the
SQL fetch — replicates the Decimal arithmetic from cm_pricing.apply_supplier_ladder.
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

import frappe


# ── Stored Item columns fetched by SQL ───────────────────────────────────────
# These all have real DB columns (is_virtual=0 or standard ERPNext fields).
_STORED_ITEM_COLS = [
	# Identity
	"item_code",
	"item_name",
	"cm_given_name",
	"cm_description_line_1",
	"cm_description_line_2",
	"item_group",
	"brand",
	"stock_uom",
	"is_stock_item",
	"disabled",
	"cm_product_type",
	"cm_hidden_from_catalogue",
	# Supplier
	"cm_supplier_code",
	"cm_supplier_name",
	"cm_supplier_item_code",
	"cm_supplier_item_name",
	"cm_supplier_variant_description",
	"cm_supplier_currency",
	"cm_supplier_pack",
	"lead_time_days",
	"image",
	# Pricing inputs
	"cm_rrp_ex_vat",
	"cm_vat_rate_percent",
	"cm_discount_target_percent",
	"cm_pricing_rounding_mode",
	# Cost ladder inputs (stored)
	"cm_purchase_price_ex_vat",
	"cm_increase_before_percent",
	"cm_discount_1_percent",
	"cm_discount_2_percent",
	"cm_discount_3_percent",
	"cm_increase_after_percent",
	# Landed cost inputs
	"cm_shipping_percent",
	"cm_shipping_fee",
	"cm_handling_fee",
	"cm_other_landed",
	# Pack / dimensions
	"cm_tiles_per_box",
	"cm_sqm_per_box",
	# Configurator / product coding
	"cm_product_code",
	"cm_family_code",
	"cm_finish_code",
	"cm_role_name",
	"cm_variant",
	"cm_dimensions",
	"cm_weight_factor",
	# Stored computed outputs
	"cm_rrp_inc_vat",
	"cm_final_offer_inc_vat",
	"cm_final_offer_ex_vat",
	"cm_discount_percent",
	"cm_cost_ex_vat_calculated",
	"cm_landed_additions_total_ex_vat",
	"cm_profit_ex_vat",
	"cm_margin_percent",
	"cm_markup_percent",
]

# Virtual fields computed after SQL fetch (no DB column).
_VIRTUAL_FIELDS = [
	"cm_supplier_list_price_ex_vat",
	"cm_after_increase_before_ex_vat",
	"cm_after_discount_1_ex_vat",
	"cm_after_discount_2_ex_vat",
	"cm_after_discount_3_ex_vat",
	"cm_cost_ex_vat",
]

_STOCK_FIELDS = [
	"total_actual_qty",
	"total_reserved_qty",
	"total_ordered_qty",
	"total_projected_qty",
]


def _to_dec(value) -> Decimal | None:
	if value is None or value == "":
		return None
	return Decimal(str(value))


def _q2(value: Decimal) -> Decimal:
	return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _compute_virtual_fields(row: dict) -> None:
	"""Replicate apply_supplier_ladder Decimal arithmetic for a single row dict."""
	purchase = _to_dec(row.get("cm_purchase_price_ex_vat"))
	if purchase is None:
		for f in _VIRTUAL_FIELDS:
			row[f] = None
		return

	inc_before = _to_dec(row.get("cm_increase_before_percent")) or Decimal("0")
	disc1 = _to_dec(row.get("cm_discount_1_percent")) or Decimal("0")
	disc2 = _to_dec(row.get("cm_discount_2_percent")) or Decimal("0")
	disc3 = _to_dec(row.get("cm_discount_3_percent")) or Decimal("0")
	inc_after = _to_dec(row.get("cm_increase_after_percent")) or Decimal("0")

	ONE = Decimal("1")
	HUNDRED = Decimal("100")

	after_inc_before = _q2(purchase * (ONE + inc_before / HUNDRED))
	after_d1 = _q2(after_inc_before * (ONE - disc1 / HUNDRED))
	after_d2 = _q2(after_d1 * (ONE - disc2 / HUNDRED))
	after_d3 = _q2(after_d2 * (ONE - disc3 / HUNDRED))
	cost = _q2(after_d3 * (ONE + inc_after / HUNDRED))

	row["cm_supplier_list_price_ex_vat"] = float(purchase)
	row["cm_after_increase_before_ex_vat"] = float(after_inc_before)
	row["cm_after_discount_1_ex_vat"] = float(after_d1)
	row["cm_after_discount_2_ex_vat"] = float(after_d2)
	row["cm_after_discount_3_ex_vat"] = float(after_d3)
	row["cm_cost_ex_vat"] = float(cost)


@frappe.whitelist()
def get_unified_product_data() -> list[dict]:
	"""Return all products with full field set + aggregated stock.

	Columns returned:
	  - All stored Item fields (identity, supplier, cost ladder, pricing I/O)
	  - Virtual ladder intermediates (computed in Python)
	  - Aggregated stock totals from tabBin (LEFT JOIN)
	"""
	item_cols_sql = ", ".join(f"i.`{c}`" for c in _STORED_ITEM_COLS)

	sql = f"""
		SELECT
			{item_cols_sql},
			IFNULL(b.total_actual_qty, 0)    AS total_actual_qty,
			IFNULL(b.total_reserved_qty, 0)  AS total_reserved_qty,
			IFNULL(b.total_ordered_qty, 0)   AS total_ordered_qty,
			IFNULL(b.total_projected_qty, 0) AS total_projected_qty
		FROM `tabItem` i
		LEFT JOIN (
			SELECT
				item_code,
				SUM(IFNULL(actual_qty, 0))    AS total_actual_qty,
				SUM(IFNULL(reserved_qty, 0))  AS total_reserved_qty,
				SUM(IFNULL(ordered_qty, 0))   AS total_ordered_qty,
				SUM(IFNULL(projected_qty, 0)) AS total_projected_qty
			FROM `tabBin`
			GROUP BY item_code
		) b ON b.item_code = i.name
		ORDER BY i.item_code
	"""

	rows = frappe.db.sql(sql, as_dict=True)

	for row in rows:
		_compute_virtual_fields(row)

	return rows
