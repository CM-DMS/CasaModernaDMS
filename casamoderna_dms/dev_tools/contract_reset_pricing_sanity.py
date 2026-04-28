from __future__ import annotations

from decimal import Decimal

import frappe

from casamoderna_dms.cm_pricing import apply_item_pricing


def _make_test_item():
	# In-memory Item (no insert/save).
	doc = frappe.new_doc("Item")

	# Minimal identity so validations that touch standard fields don't explode.
	doc.item_code = "_PRICING_SANITY_"
	doc.item_name = "Pricing Sanity"
	item_group = frappe.get_all("Item Group", pluck="name", limit=1)
	doc.item_group = item_group[0] if item_group else "All Item Groups"
	doc.stock_uom = "Nos"
	doc.is_stock_item = 1

	# Ladder inputs
	doc.cm_supplier_list_price_ex_vat = Decimal("100")
	doc.cm_increase_before_percent = Decimal("10")
	doc.cm_discount_1_percent = Decimal("5")
	doc.cm_discount_2_percent = Decimal("2")
	doc.cm_discount_3_percent = Decimal("1")
	doc.cm_increase_after_percent = Decimal("3")
	doc.cm_shipping_percent = Decimal("4")
	doc.cm_shipping_fee = Decimal("2")
	doc.cm_handling_fee = Decimal("1")
	doc.cm_other_landed = Decimal("0.50")

	# Selling inputs
	doc.cm_rrp_ex_vat = Decimal("200")
	doc.cm_discount_target_percent = Decimal("12.5")

	return doc


def _assert_equal(label: str, actual, expected: Decimal):
	actual_d = Decimal(str(actual))
	if actual_d != expected:
		frappe.throw(f"Pricing sanity failed: {label}: {actual_d} != {expected}")


def run():
	"""Contract reset: server-side pricing sanity check.

	Runs `apply_item_pricing` on an in-memory Item and asserts a few key values.
	Prints a compact JSON with the key outputs for log evidence.
	"""
	frappe.only_for("System Manager")

	# Case A: Whole Euro rounding (round up)
	doc = _make_test_item()
	doc.cm_pricing_mode_ui = "Whole Euro (Round Up)"
	apply_item_pricing(doc)

	# Ladder expected values (2dp quantization)
	_assert_equal("after_increase_before", doc.cm_after_increase_before_ex_vat, Decimal("110.00"))
	_assert_equal("after_discount_1", doc.cm_after_discount_1_ex_vat, Decimal("104.50"))
	_assert_equal("after_discount_2", doc.cm_after_discount_2_ex_vat, Decimal("102.41"))
	_assert_equal("after_discount_3", doc.cm_after_discount_3_ex_vat, Decimal("101.39"))
	_assert_equal("purchase_price", doc.cm_purchase_price_ex_vat, Decimal("104.43"))
	_assert_equal("landed_total", doc.cm_landed_additions_total_ex_vat, Decimal("7.68"))
	_assert_equal("cost_calc", doc.cm_cost_ex_vat_calculated, Decimal("112.11"))

	out_a = {
		"mode": doc.cm_pricing_mode_ui,
		"after_increase_before": str(doc.cm_after_increase_before_ex_vat),
		"after_discount_1": str(doc.cm_after_discount_1_ex_vat),
		"after_discount_2": str(doc.cm_after_discount_2_ex_vat),
		"after_discount_3": str(doc.cm_after_discount_3_ex_vat),
		"purchase_price": str(doc.cm_purchase_price_ex_vat),
		"landed_total": str(doc.cm_landed_additions_total_ex_vat),
		"cost_calc": str(doc.cm_cost_ex_vat_calculated),
		"rrp_inc_vat": str(getattr(doc, "cm_rrp_inc_vat", None)),
		"discounted_inc_vat": str(getattr(doc, "cm_discounted_inc_vat", None)),
		"final_offer_inc_vat": str(getattr(doc, "cm_final_offer_inc_vat", None)),
		"final_offer_ex_vat": str(getattr(doc, "cm_final_offer_ex_vat", None)),
		"rounding_delta": str(getattr(doc, "cm_rounding_delta", None)),
		"effective_discount": str(getattr(doc, "cm_discount_percent", None)),
		"pricing_rounding_mode": str(getattr(doc, "cm_pricing_rounding_mode", None)),
	}

	# Case B: Tile pricing (2 decimals)
	doc2 = _make_test_item()
	doc2.cm_pricing_mode_ui = "Tiles (2 Decimals)"
	apply_item_pricing(doc2)
	out_b = {
		"mode": doc2.cm_pricing_mode_ui,
		"final_offer_inc_vat": str(getattr(doc2, "cm_final_offer_inc_vat", None)),
		"pricing_rounding_mode": str(getattr(doc2, "cm_pricing_rounding_mode", None)),
	}

	print(frappe.as_json({"whole_euro": out_a, "tiles": out_b}))
