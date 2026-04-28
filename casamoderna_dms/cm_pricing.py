from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

import frappe

from casamoderna_dms.contract9_products_pricing import compute_pricing

# ── Dirty-check: only recompute when these inputs actually changed ──────────
PRICING_INPUT_FIELDS = {
	"cm_purchase_price_ex_vat",
	"cm_increase_before_percent",
	"cm_discount_1_percent",
	"cm_discount_2_percent",
	"cm_discount_3_percent",
	"cm_increase_after_percent",
	"cm_rrp_ex_vat",
	"cm_discount_target_percent",
	"cm_cost_ex_vat_override",
	"cm_shipping_percent",
	"cm_shipping_fee",
	"cm_handling_fee",
	"cm_other_landed",
	"cm_delivery_installation_fee",
	"cm_vat_rate_percent",
	"cm_pricing_rounding_mode",
}

_SELLING_PRICE_LIST = "Standard Selling"


def pricing_inputs_changed(doc) -> bool:
	"""Return True if any pricing input changed since last save, or if this is a new doc."""
	if doc.is_new():
		return True
	before = doc.get_doc_before_save()
	if not before:
		return True
	return any(doc.get(f) != before.get(f) for f in PRICING_INPUT_FIELDS)


def sync_item_price(doc, method=None):
	"""Keep Item Price (Standard Selling, price_list_rate = cm_final_offer_ex_vat) in sync.

	Called from Item.on_update so it always runs against the persisted values.
	Skips silently when cm_final_offer_ex_vat is zero/missing or when the
	rate is already correct (cheap comparison avoids unnecessary DB writes).
	"""
	rate = float(doc.get("cm_final_offer_ex_vat") or 0)
	if rate <= 0:
		return

	currency = frappe.get_cached_value("Price List", _SELLING_PRICE_LIST, "currency") or "EUR"

	existing = frappe.db.get_value(
		"Item Price",
		{"item_code": doc.name, "price_list": _SELLING_PRICE_LIST, "selling": 1},
		["name", "price_list_rate"],
		as_dict=True,
	)

	if existing:
		if abs(float(existing.price_list_rate or 0) - rate) < 0.001:
			return  # already correct — skip write
		frappe.db.set_value("Item Price", existing.name, {
			"price_list_rate": rate,
			"currency": currency,
		}, update_modified=False)
	else:
		ip = frappe.get_doc({
			"doctype":         "Item Price",
			"item_code":       doc.name,
			"item_name":       doc.item_name,
			"price_list":      _SELLING_PRICE_LIST,
			"price_list_rate": rate,
			"currency":        currency,
			"selling":         1,
			"buying":          0,
			"uom":             doc.stock_uom,
		})
		ip.insert(ignore_permissions=True)

	frappe.db.commit()


def _to_decimal(value) -> Decimal | None:
	if value is None:
		return None
	if value == "":
		return None
	return Decimal(str(value))


def _get_company_vat_rate_percent() -> Decimal | None:
	if not frappe.db.exists("DocType", "Global Defaults"):
		return None
	default_company = frappe.db.get_single_value("Global Defaults", "default_company")
	if not default_company:
		return None
	if not frappe.db.exists("Company", default_company):
		return None
	vat_rate = frappe.db.get_value("Company", default_company, "cm_vat_rate_percent")
	return _to_decimal(vat_rate)


def _quantize_money(value: Decimal) -> Decimal:
	# Money values displayed/compared at 2dp.
	return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _to_percent(value) -> Decimal | None:
	"""Parse a percent-like input into Decimal.

	Returns None when empty.
	"""
	return _to_decimal(value)


def _get_rounding_mode_from_ui(ui_value: str | None) -> str | None:
	if not ui_value:
		return None
	ui_value = str(ui_value).strip()
	if ui_value == "Whole Euro (Round)":
		return "whole_euro_roundup"
	if ui_value == "Tiles (2 Decimals)":
		return "tile_decimal_pricing"
	return None


def _get_ui_from_rounding_mode(rounding_mode: str | None) -> str | None:
	if not rounding_mode:
		return None
	rounding_mode = str(rounding_mode).strip()
	if rounding_mode == "whole_euro_roundup":
		return "Whole Euro (Round)"
	if rounding_mode == "tile_decimal_pricing":
		return "Tiles (2 Decimals)"
	return None


def apply_supplier_ladder(doc):
	"""Compute the full cost ladder from the single source field: cm_purchase_price_ex_vat.

	Waterfall (→ = derived from previous step; all intermediate steps are VIRTUAL):

	  cm_purchase_price_ex_vat         STORED  — user-editable primary input
	  cm_supplier_list_price_ex_vat    VIRTUAL — display alias (= purchase price)
	  cm_after_increase_before_ex_vat  VIRTUAL — × (1 + increase_before%)
	  cm_after_discount_1_ex_vat       VIRTUAL — previous × (1 − disc1%)
	  cm_after_discount_2_ex_vat       VIRTUAL — previous × (1 − disc2%)
	  cm_after_discount_3_ex_vat       VIRTUAL — previous × (1 − disc3%)
	  cm_cost_ex_vat                   VIRTUAL — previous × (1 + increase_after%)
	  ─────────────────────────────────────────
	  cm_landed_additions_total_ex_vat STORED  — shipping + handling + other (computed, stored)
	  cm_cost_ex_vat_calculated        STORED  — cm_cost_ex_vat + landed additions (computed, stored)

	When all percentages are 0 (current operating state):
	  all intermediate virtuals = cm_purchase_price_ex_vat
	  cm_cost_ex_vat = cm_purchase_price_ex_vat
	  cm_cost_ex_vat_calculated = cm_purchase_price_ex_vat + landed additions

	Future-proof: setting any percentage to a non-zero value automatically flows
	through the chain with no code changes required.

	Backward-compat: if cm_purchase_price_ex_vat is absent but cm_supplier_list_price_ex_vat
	is set (pre-migration records), the latter is used as the purchase price.  Run the
	migration patch item_dedup_stored_fields to backfill permanently.
	"""
	# --- single source of truth --------------------------------------------------
	purchase = _to_decimal(getattr(doc, "cm_purchase_price_ex_vat", None))
	if purchase is None:
		# Legacy fallback: pre-migration record still has only list_price stored.
		purchase = _to_decimal(getattr(doc, "cm_supplier_list_price_ex_vat", None))
	if purchase is None:
		for fn in [
			"cm_supplier_list_price_ex_vat",
			"cm_after_increase_before_ex_vat",
			"cm_after_discount_1_ex_vat",
			"cm_after_discount_2_ex_vat",
			"cm_after_discount_3_ex_vat",
			"cm_cost_ex_vat",
			"cm_landed_additions_total_ex_vat",
			"cm_cost_ex_vat_calculated",
		]:
			setattr(doc, fn, None)
		return None

	if purchase < 0:
		frappe.throw("Purchase Price Ex VAT must be >= 0")

	# --- percent inputs ----------------------------------------------------------
	inc_before  = _to_percent(getattr(doc, "cm_increase_before_percent", None)) or Decimal("0")
	disc1       = _to_percent(getattr(doc, "cm_discount_1_percent",      None)) or Decimal("0")
	disc2       = _to_percent(getattr(doc, "cm_discount_2_percent",      None)) or Decimal("0")
	disc3       = _to_percent(getattr(doc, "cm_discount_3_percent",      None)) or Decimal("0")
	inc_after   = _to_percent(getattr(doc, "cm_increase_after_percent",  None)) or Decimal("0")

	ship_percent  = _to_percent(getattr(doc, "cm_shipping_percent", None)) or Decimal("0")
	ship_fee      = _to_decimal(getattr(doc, "cm_shipping_fee",     None)) or Decimal("0")
	handling_fee  = _to_decimal(getattr(doc, "cm_handling_fee",     None)) or Decimal("0")
	other_landed  = _to_decimal(getattr(doc, "cm_other_landed",     None)) or Decimal("0")
	delivery_install = _to_decimal(getattr(doc, "cm_delivery_installation_fee", None)) or Decimal("0")

	for label, v in [
		("Increase Before (%)", inc_before),
		("Discount 1 (%)",      disc1),
		("Discount 2 (%)",      disc2),
		("Discount 3 (%)",      disc3),
		("Increase After (%)",  inc_after),
		("Shipping (%)",        ship_percent),
	]:
		if v < 0 or v > 100:
			frappe.throw(f"{label} must be between 0 and 100")
	for label, v in [
		("Shipping Fee",  ship_fee),
		("Handling Fee",  handling_fee),
		("Other Landed",  other_landed),
		("Delivery & Installation Fee", delivery_install),
	]:
		if v < 0:
			frappe.throw(f"{label} must be >= 0")

	# --- virtual waterfall (each step derived from the previous) -----------------
	after_inc_before  = _quantize_money(purchase       * (Decimal("1") + (inc_before / Decimal("100"))))
	after_d1          = _quantize_money(after_inc_before * (Decimal("1") - (disc1     / Decimal("100"))))
	after_d2          = _quantize_money(after_d1        * (Decimal("1") - (disc2     / Decimal("100"))))
	after_d3          = _quantize_money(after_d2        * (Decimal("1") - (disc3     / Decimal("100"))))
	cost_before_landed = _quantize_money(after_d3       * (Decimal("1") + (inc_after  / Decimal("100"))))

	# Landed additions (applied to purchase price base, not to the discount waterfall)
	landed_total = _quantize_money(
		(purchase * (ship_percent / Decimal("100"))) + ship_fee + handling_fee + other_landed + delivery_install
	)
	cost_calc = _quantize_money(cost_before_landed + landed_total)

	# --- set virtual fields on doc (never read from DB; derived on every load/save)
	# Note: virtual fields (is_virtual=1) are NOT loaded as Python attributes by
	# Frappe's ORM, so hasattr() returns False.  Use direct assignment — Frappe's
	# BaseDocument.__setattr__ and as_dict() both honour meta-defined virtual fields.
	doc.cm_supplier_list_price_ex_vat = float(purchase)
	doc.cm_after_increase_before_ex_vat = float(after_inc_before)
	doc.cm_after_discount_1_ex_vat = float(after_d1)
	doc.cm_after_discount_2_ex_vat = float(after_d2)
	doc.cm_after_discount_3_ex_vat = float(after_d3)
	doc.cm_cost_ex_vat = float(cost_before_landed)

	# --- stored computed outputs (persisted so they can be queried/reported) -----
	doc.cm_landed_additions_total_ex_vat = float(landed_total)
	doc.cm_cost_ex_vat_calculated = float(cost_calc)

	return {"purchase_ex_vat": purchase, "cost_ex_vat_calculated": cost_calc}


def apply_item_pricing(doc, method=None):
	"""Contract 9 pricing engine: derive VAT-inclusive and offer prices from ex-VAT RRP.

	Source of truth:
	- cm_rrp_ex_vat
	- cm_discount_target_percent (Contract 12 target input; falls back to cm_discount_percent if missing)
	- cm_pricing_rounding_mode
	- Company.cm_vat_rate_percent (for the site's default company)

	Derived outputs (stored on Item):
	- cm_discount_percent (Contract 12 effective discount post-rounding)
	- profitability outputs when cm_cost_ex_vat is provided

	Dirty-check: the full compute chain only runs when at least one pricing input
	field changed since the last save. Unrelated saves (image upload, description
	edits, etc.) skip the compute entirely — sync_item_price is handled by on_update.
	"""
	if not pricing_inputs_changed(doc):
		return

	# Phase C (reset contract): compute supplier/list ladder outputs when inputs exist.
	ladder = apply_supplier_ladder(doc)

	# VAT context: populate Item VAT rate when available (read-only field for operators).
	vat_rate_percent = _get_company_vat_rate_percent()
	doc.cm_vat_rate_percent = float(vat_rate_percent) if vat_rate_percent is not None else None

	# Only apply selling-side pricing when the input is present; keep existing items safe.
	rrp_ex_vat = _to_decimal(getattr(doc, "cm_rrp_ex_vat", None))
	if rrp_ex_vat is None:
		return

	# Contract 12: treat discount as a target input, compute/store effective discount after rounding.
	# Backward compatible: if cm_discount_target_percent is empty, fall back to cm_discount_percent
	# (historically used as an input) and copy it into the target field when available.
	target_discount_percent = _to_decimal(getattr(doc, "cm_discount_target_percent", None))
	legacy_discount_percent = _to_decimal(getattr(doc, "cm_discount_percent", None))
	if target_discount_percent is None and legacy_discount_percent is not None:
		target_discount_percent = legacy_discount_percent
		doc.cm_discount_target_percent = float(legacy_discount_percent)
	if target_discount_percent is None:
		target_discount_percent = Decimal("0")
	if target_discount_percent < 0 or target_discount_percent > 100:
		frappe.throw("CM Discount Target Percent must be between 0 and 100")

	# Business-facing UI mapping for pricing mode (avoid exposing internal option tokens).
	ui_mode = getattr(doc, "cm_pricing_mode_ui", None)
	rounding_mode_from_ui = _get_rounding_mode_from_ui(ui_mode)
	if rounding_mode_from_ui:
		doc.cm_pricing_rounding_mode = rounding_mode_from_ui

	internal_rounding_mode = (getattr(doc, "cm_pricing_rounding_mode", None) or "whole_euro_roundup").strip()
	if not ui_mode:
		# Backfill the UI mode for existing records.
		doc.cm_pricing_mode_ui = _get_ui_from_rounding_mode(internal_rounding_mode)

	rounding_mode = rounding_mode_from_ui or internal_rounding_mode

	if vat_rate_percent is None:
		frappe.throw(
			"VAT rate is not configured. Open your default Company and set 'CM VAT Rate (%)' (cm_vat_rate_percent) before entering RRP Ex VAT."
		)
	if vat_rate_percent < 0:
		frappe.throw("Company VAT rate must be >= 0")

	# Profitability is based on total landed cost (purchase + shipping/handling/other),
	# not the pre-landing purchase price.  apply_supplier_ladder() returns cost_ex_vat_calculated
	# which is the fully-landed figure.
	cost_ex_vat = ladder.get("cost_ex_vat_calculated") if ladder else None
	if cost_ex_vat is not None and cost_ex_vat < 0:
		frappe.throw("CM Cost Ex VAT must be >= 0")

	result = compute_pricing(
		rrp_ex_vat=rrp_ex_vat,
		discount_percent=target_discount_percent,
		vat_rate_percent=vat_rate_percent,
		rounding_mode=rounding_mode,
		cost_ex_vat=cost_ex_vat,
	)

	doc.cm_rrp_inc_vat = float(result["rrp_inc_vat"])
	doc.cm_discounted_inc_vat = float(result["discounted_inc_vat"])
	doc.cm_final_offer_inc_vat = float(result["final_offer_inc_vat"])
	doc.cm_final_offer_ex_vat = float(result["final_offer_ex_vat"])
	doc.cm_rounding_delta = float(result["rounding_delta"])

	# Mirror the offer price to ERPNext's standard_rate so the built-in
	# pricing system stays in sync with the CM pricing pipeline.
	# With included_in_print_rate = 1 on the sales tax template, rate is inc-VAT.
	doc.standard_rate = float(result["final_offer_inc_vat"])

	# Effective discount (post-rounding), stored with 3dp intent.
	effective = result.get("effective_discount_percent")
	if effective is not None:
		doc.cm_discount_percent = float(effective)

	# Profitability outputs only when cost is provided.
	profit = result.get("profit_ex_vat")
	doc.cm_profit_ex_vat = float(profit) if profit is not None else None
	margin = result.get("margin_percent")
	doc.cm_margin_percent = float(margin) if margin is not None else None
	markup = result.get("markup_percent")
	doc.cm_markup_percent = float(markup) if markup is not None else None
