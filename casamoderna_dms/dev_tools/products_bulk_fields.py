from __future__ import annotations

import json


# ── Importable fields (round-trip: export → edit in Excel → re-import) ───────
EXPORT_FIELDS = [
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
	# Cost ladder inputs
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
]

# ── Computed pricing outputs (export-only, read-only — server-computed) ──────
COMPUTED_OUTPUT_FIELDS = [
	"cm_rrp_inc_vat",
	"cm_final_offer_inc_vat",
	"cm_final_offer_ex_vat",
	"cm_discount_percent",
	"cm_cost_ex_vat_calculated",
	"cm_landed_additions_total_ex_vat",
	"cm_profit_ex_vat",
	"cm_margin_percent",
	"cm_markup_percent",
	# Virtual ladder intermediates (computed by apply_supplier_ladder)
	"cm_supplier_list_price_ex_vat",
	"cm_after_increase_before_ex_vat",
	"cm_after_discount_1_ex_vat",
	"cm_after_discount_2_ex_vat",
	"cm_after_discount_3_ex_vat",
	"cm_cost_ex_vat",
]

# ── Stock aggregates (export-only, read-only — from tabBin) ─────────────────
STOCK_FIELDS = [
	"total_actual_qty",
	"total_reserved_qty",
	"total_ordered_qty",
	"total_projected_qty",
]


def get_export_fields() -> list[str]:
	return list(EXPORT_FIELDS)


def get_unified_export_fields() -> list[str]:
	return EXPORT_FIELDS + COMPUTED_OUTPUT_FIELDS + STOCK_FIELDS


def print_export_fields(as_csv_header: int = 1) -> dict:
	"""Bench helper for operators.

	Usage:
	- CSV header: `bench --site <site> execute casamoderna_dms.products_bulk_fields.print_export_fields`
	- JSON list: `bench --site <site> execute casamoderna_dms.products_bulk_fields.print_export_fields --kwargs "{'as_csv_header': 0}"`
	"""
	if int(as_csv_header or 0):
		header = ",".join(EXPORT_FIELDS)
		print(header)
		return {"format": "csv_header", "value": header, "count": len(EXPORT_FIELDS)}

	print(json.dumps(EXPORT_FIELDS, indent=2))
	return {"format": "json", "value": EXPORT_FIELDS, "count": len(EXPORT_FIELDS)}
