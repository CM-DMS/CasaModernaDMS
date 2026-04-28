from __future__ import annotations

from decimal import Decimal

import frappe

from casamoderna_dms.contract9_products_pricing import compute_pricing


def _to_decimal(value) -> Decimal | None:
	if value is None:
		return None
	if value == "":
		return None
	return Decimal(str(value))


def _get_company_vat_rate_percent(company: str | None) -> Decimal | None:
	if not company:
		company = frappe.db.get_single_value("Global Defaults", "default_company")
	if not company:
		return None
	if not frappe.db.exists("Company", company):
		return None
	return _to_decimal(frappe.db.get_value("Company", company, "cm_vat_rate_percent"))


def _is_any_tax_included_in_print_rate(doc) -> bool:
	for tax in getattr(doc, "taxes", []) or []:
		try:
			if int(getattr(tax, "included_in_print_rate", 0) or 0):
				return True
		except Exception:
			continue
	return False


def apply_sales_doc_pricing(doc, method=None):
	"""Contract 13: map CasaModerna Item pricing into selling document rows.

	Scope (bounded):
	- Quotation / Sales Order only
	- Server-side deterministic pricing using existing compute_pricing()
	- Does not alter ERPNext tax engine; it only sets row rate and stores CM traceability fields

	Policy alignment:
	- Source of truth remains Item.cm_rrp_ex_vat
	- Target discount input uses row.discount_percentage (prefilled from Item.cm_discount_target_percent when empty)
	- Effective discount is stored on the row from the final rounded offer
	- Tile exception preserved via Item.cm_pricing_rounding_mode
	"""
	if getattr(doc, "doctype", None) not in {"Quotation", "Sales Order"}:
		return
	if not hasattr(doc, "items"):
		return

	vat_rate_percent = _get_company_vat_rate_percent(getattr(doc, "company", None))
	if vat_rate_percent is None:
		frappe.throw(
			"VAT rate is not configured. Open your Company and set 'CM VAT Rate (%)' (cm_vat_rate_percent) before creating quotations/orders for CM-priced items."
		)
	if vat_rate_percent < 0:
		frappe.throw("Company VAT rate must be >= 0")

	taxes_included = _is_any_tax_included_in_print_rate(doc)
	is_new_doc = False
	try:
		is_new_doc = bool(doc.is_new())
	except Exception:
		is_new_doc = bool(getattr(doc, "__islocal", 0) or 0)

	item_codes = [row.item_code for row in (doc.items or []) if getattr(row, "item_code", None)]
	if not item_codes:
		return

	items = frappe.get_all(
		"Item",
		filters={"name": ["in", list(set(item_codes))]},
		fields=[
			"name",
			"cm_rrp_ex_vat",
			"cm_discount_target_percent",
			"cm_pricing_rounding_mode",
		],
	)
	item_map = {i["name"]: i for i in items}

	# Build a set of item_codes that have an active DB-persisted override lock
	# for this specific document.  This covers the submit path and any re-save
	# after the initial approval save — the transient _price_override_approved
	# flag only lives for the duration of save_doc_with_approvals().
	_doc_name = getattr(doc, "name", None)
	_db_locked_item_codes: set[str] = set()
	if _doc_name and not (getattr(doc, "__islocal", 0) or doc.is_new()):
		try:
			locked_rows = frappe.get_all(
				"CM Price Override Request",
				filters={"doc_name": _doc_name, "status": "Approved", "consumed": 1},
				fields=["item_code"],
				ignore_permissions=True,
			)
			_db_locked_item_codes = {r["item_code"] for r in locked_rows}
		except Exception:
			pass  # If the doctype isn't available, degrade gracefully

	changed_any = False
	for row in doc.items:
		item_code = getattr(row, "item_code", None)
		if not item_code:
			continue

		# Skip rows that carry a supervisor-approved price override.
		# _price_override_approved is a transient Python attribute set by
		# price_override_api.save_doc_with_approvals — only valid for the
		# duration of that save call.
		if getattr(row, "_price_override_approved", False):
			continue

		# Skip rows whose override was persisted to DB (covers submit and any
		# re-save after the initial approval).  The CM Price Override Request
		# record is consumed (one-time) and tied to this exact doc_name, so it
		# won't bleed into amendments (which get a new doc_name like SO000022-1).
		if item_code in _db_locked_item_codes:
			continue

		it = item_map.get(item_code)
		if not it:
			continue

		# Price Calc rows carry supplier-formula pricing — preserve the rate that was
		# calculated from the supplier's quoted price.
		#
		# IMPORTANT: our custom validate hooks run AFTER ERPNext's own validate()
		# (which includes calculate_item_values()).  By the time we arrive here,
		# row.rate may already have been overwritten by ERPNext using price_list_rate.
		# We must therefore derive the correct offer price from custom fields that
		# ERPNext's engine never touches:
		#   cm_final_offer_inc_vat  — exact offer price set by the Price Calc modal
		#   cm_rrp_inc_vat          — stored RRP (fallback if cm_final_offer_inc_vat is 0)
		#   cm_effective_discount_percent — discount that was applied
		if getattr(row, "cm_price_calculator", None):
			correct_rate = float(getattr(row, "cm_final_offer_inc_vat", 0) or 0)
			if not correct_rate:
				# Fallback: reconstruct from stored RRP + effective discount
				rrp  = float(getattr(row, "cm_rrp_inc_vat", 0) or 0)
				disc = float(getattr(row, "cm_effective_discount_percent", 0) or 0)
				correct_rate = round(rrp * (1 - disc / 100), 2) if rrp else 0.0
			# Explicitly set rate — overrides whatever calculate_item_values() wrote.
			row.rate = correct_rate
			# Anchor ERPNext pricing engine for subsequent saves so calculate_item_values()
			# computes rate = rate_with_margin × (1 − 0%) = correct_rate.
			for _fn in ("rate_with_margin", "base_rate_with_margin"):
				if hasattr(row, _fn):
					setattr(row, _fn, correct_rate)
			for _fn in ("discount_percentage", "discount_amount", "base_discount_amount",
						"margin_rate_or_amount"):
				if hasattr(row, _fn):
					setattr(row, _fn, 0)
			if hasattr(row, "margin_type"):
				setattr(row, "margin_type", "")
			changed_any = True
			continue

		rrp_ex_vat = _to_decimal(it.get("cm_rrp_ex_vat"))
		if rrp_ex_vat is None or rrp_ex_vat == 0:
			continue

		rounding_mode = (it.get("cm_pricing_rounding_mode") or "whole_euro_roundup").strip()

		# Target discount input: use discount_percentage if non-zero.
		# If it is zero, fall back to cm_effective_discount_percent, which is
		# written by this hook after every save and survives across saves.
		# Background: at the end of each save this hook zeroes discount_percentage
		# (to stop ERPNext's calculate_item_values from overriding our rate), so on
		# the next save / submit the row arrives with discount_percentage = 0.  Without
		# the fallback, compute_pricing would receive 0 % and reset every price to
		# full RRP — even for items the user had discounted.
		row_target_discount = _to_decimal(getattr(row, "discount_percentage", None))
		cm_effective       = _to_decimal(getattr(row, "cm_effective_discount_percent", None))
		if (row_target_discount is None or row_target_discount == 0) and cm_effective:
			row_target_discount = cm_effective

		item_target_discount = _to_decimal(it.get("cm_discount_target_percent"))
		# Fall back to the item's default target discount only on the very first save
		# of a new doc where no discount has been set yet.
		if (
			item_target_discount is not None
			and (
				row_target_discount is None
				or (is_new_doc and row_target_discount == 0)
			)
		):
			row.discount_percentage = float(item_target_discount)
			row_target_discount = item_target_discount
		if row_target_discount is None:
			row_target_discount = Decimal("0")
		if row_target_discount < 0 or row_target_discount > 100:
			frappe.throw("Discount Percentage must be between 0 and 100")

		res = compute_pricing(
			rrp_ex_vat=rrp_ex_vat,
			discount_percent=row_target_discount,
			vat_rate_percent=vat_rate_percent,
			rounding_mode=rounding_mode,
		)

		# Store CM traceability fields when available on the row doctype.
		for fieldname, value in [
			("cm_rrp_ex_vat", rrp_ex_vat),
			("cm_rrp_inc_vat", res.get("rrp_inc_vat")),
			("cm_final_offer_inc_vat", res.get("final_offer_inc_vat")),
			("cm_final_offer_ex_vat", res.get("final_offer_ex_vat")),
			("cm_effective_discount_percent", res.get("effective_discount_percent")),
			("cm_pricing_rounding_mode", rounding_mode),
		]:
			if hasattr(row, fieldname):
				if value is None:
					setattr(row, fieldname, None)
				elif isinstance(value, Decimal):
					setattr(row, fieldname, float(value))
				else:
					setattr(row, fieldname, value)

		# Set row rate in a way that respects ERPNext taxes engine.
		# If taxes are included in print rate, rate should be VAT-inclusive; otherwise use ex-VAT.
		target_rate = res["final_offer_inc_vat"] if taxes_included else res["final_offer_ex_vat"]
		row.rate = float(target_rate)

		# Prevent ERPNext's calculate_taxes_and_totals() from overriding our price.
		# If the row has ERPNext margin/discount fields set (e.g. margin_type="Percentage",
		# margin_rate_or_amount=17.54, discount_percentage=30), calculate_item_values()
		# recomputes: rate = rate_with_margin × (1 - discount%) - discount_amount
		# which silently overwrites our final price.  Fix: anchor rate_with_margin to
		# our target_rate and zero all discount/margin fields so ERPNext computes
		# rate = target_rate × 1.0 − 0 = target_rate (our price sticks).
		# The effective CasaModerna discount is stored in cm_effective_discount_percent.
		for _fn in ("rate_with_margin", "base_rate_with_margin"):
			if hasattr(row, _fn):
				setattr(row, _fn, float(target_rate))
		for _fn in ("discount_percentage", "discount_amount", "base_discount_amount",
		            "margin_rate_or_amount"):
			if hasattr(row, _fn):
				setattr(row, _fn, 0)
		for _fn in ("margin_type",):
			if hasattr(row, _fn):
				setattr(row, _fn, "")

		changed_any = True

	# Ensure totals align with the updated row rates.
	if changed_any and hasattr(doc, "calculate_taxes_and_totals"):
		doc.calculate_taxes_and_totals()

	# Safeguard: warn if any configured-product placeholder row has rate=0.
	# CM-SOFA and CM-WARDROBE are skipped by the pricing loop above (rrp_ex_vat=0 on the
	# Item master) so their rate must be set by the configurator before saving. A zero
	# rate means pricing was never resolved — surface a clear warning instead of silently
	# creating a line that invoices at €0.
	_CONFIGURED_CODES = frozenset({"CM-SOFA", "CM-WARDROBE"})
	zero_cfg = [
		getattr(row, "item_code", "") or ""
		for row in (doc.items or [])
		if (getattr(row, "item_code", "") or "") in _CONFIGURED_CODES
		and not float(getattr(row, "rate", 0) or 0)
	]
	if zero_cfg:
		names = ", ".join(sorted(set(zero_cfg)))
		frappe.msgprint(
			f"Warning: {names} line(s) have a €0 price. "
			"Open the configurator and complete the configuration to set pricing before saving.",
			alert=True,
			indicator="orange",
		)
