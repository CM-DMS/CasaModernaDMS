from __future__ import annotations

import json
from decimal import Decimal, ROUND_HALF_UP

import frappe


def _tab_for_field(meta, fieldname: str) -> str | None:
	current_tab = None
	for df in meta.fields:
		if df.fieldtype == "Tab Break" and df.fieldname:
			current_tab = df.fieldname
		if df.fieldname == fieldname:
			return current_tab
	return None


def discover():
	"""Contract 9 Phase A: inspect current Item model + pricing/VAT architecture.

	Prints JSON.
	"""
	frappe.set_user("Administrator")

	item_meta = frappe.get_meta("Item")

	# Standard field coverage for required business fields
	wanted_item_fields = [
		"item_name",
		"description",
		"item_group",
		"image",
		"website_image",
		"supplier_items",
		"supplier",
		"default_supplier",
		"manufacturer",
		"default_item_manufacturer",
		"default_manufacturer_part_no",
	]

	item_fields = {}
	for fn in wanted_item_fields:
		df = item_meta.get_field(fn)
		if not df:
			item_fields[fn] = None
			continue
		item_fields[fn] = {
			"fieldtype": df.fieldtype,
			"label": df.label,
			"options": getattr(df, "options", None),
			"hidden": int(getattr(df, "hidden", 0) or 0),
			"permlevel": int(getattr(df, "permlevel", 0) or 0),
			"tab": _tab_for_field(item_meta, fn),
		}

	# Supplier child table meta (if present)
	supplier_table_details = None
	supplier_items_df = item_meta.get_field("supplier_items")
	if supplier_items_df and supplier_items_df.fieldtype == "Table" and supplier_items_df.options:
		child_dt = supplier_items_df.options
		child_meta = frappe.get_meta(child_dt)
		child_fields = [
			{
				"fieldname": df.fieldname,
				"label": df.label,
				"fieldtype": df.fieldtype,
				"options": getattr(df, "options", None),
			}
			for df in child_meta.fields
			if df.fieldname
		]
		supplier_table_details = {"child_doctype": child_dt, "fields": child_fields}

	# Pricing doctypes present
	doctype_presence = {
		"Item Price": bool(frappe.db.exists("DocType", "Item Price")),
		"Price List": bool(frappe.db.exists("DocType", "Price List")),
		"Pricing Rule": bool(frappe.db.exists("DocType", "Pricing Rule")),
	}

	# VAT / taxes configuration discovery (non-guessy: list candidates and current values)
	global_defaults = frappe.get_single("Global Defaults") if frappe.db.exists("DocType", "Global Defaults") else None
	default_company = getattr(global_defaults, "default_company", None) if global_defaults else None

	company_tax_fields = {}
	company_doc = None
	if default_company and frappe.db.exists("Company", default_company):
		company_doc = frappe.get_doc("Company", default_company)
		# collect any company fields containing 'tax'
		for df in frappe.get_meta("Company").fields:
			if df.fieldname and "tax" in (df.fieldname or "").lower():
				company_tax_fields[df.fieldname] = getattr(company_doc, df.fieldname, None)

	selling_settings_tax_fields = {}
	if frappe.db.exists("DocType", "Selling Settings"):
		selling_settings = frappe.get_single("Selling Settings")
		for df in frappe.get_meta("Selling Settings").fields:
			if df.fieldname and any(x in (df.fieldname or "").lower() for x in ("tax", "charge")):
				selling_settings_tax_fields[df.fieldname] = getattr(selling_settings, df.fieldname, None)

	accounts_settings_tax_fields = {}
	if frappe.db.exists("DocType", "Accounts Settings"):
		accounts_settings = frappe.get_single("Accounts Settings")
		for df in frappe.get_meta("Accounts Settings").fields:
			if df.fieldname and any(x in (df.fieldname or "").lower() for x in ("tax", "charge")):
				accounts_settings_tax_fields[df.fieldname] = getattr(accounts_settings, df.fieldname, None)

	result = {
		"item_standard_fields": item_fields,
		"supplier_items_table": supplier_table_details,
		"pricing_doctypes_present": doctype_presence,
		"vat_discovery": {
			"default_company": default_company,
			"company_tax_fields": company_tax_fields,
			"selling_settings_tax_fields": selling_settings_tax_fields,
			"accounts_settings_tax_fields": accounts_settings_tax_fields,
		},
	}

	print(json.dumps(result, indent=2, sort_keys=True))
	return result


def compute_pricing(
	rrp_ex_vat: Decimal,
	discount_percent: Decimal,
	vat_rate_percent: Decimal,
	rounding_mode: str,
	cost_ex_vat: Decimal | None = None,
):
	"""Pure calculation engine.

	rounding_mode:
	- 'whole_euro_roundup'
	- 'tile_decimal_pricing'

	Contract 12 correction:
	- `discount_percent` is treated as a target discount input.
	- Effective discount is computed from the final rounded offer price.
	- Profitability outputs are computed only when `cost_ex_vat` is provided.
	"""
	if rrp_ex_vat is None:
		raise ValueError("rrp_ex_vat is required")
	if discount_percent is None:
		discount_percent = Decimal("0")
	if vat_rate_percent is None:
		raise ValueError("vat_rate_percent is required")

	rrp_ex_vat = Decimal(rrp_ex_vat)
	discount_percent = Decimal(discount_percent)
	vat_rate_percent = Decimal(vat_rate_percent)

	vat_multiplier = (Decimal("1") + (vat_rate_percent / Decimal("100")))
	rrp_inc_vat = rrp_ex_vat * vat_multiplier
	# Normalise RRP to standard 2dp money precision BEFORE applying the target discount.
	# This prevents sub-cent tax residuals in the RRP from inflating the offer by €1.
	# e.g. 127.12 × 1.18 = 150.0016 raw → 150.00 normalised → 50% off = 75.00 → round = 75.
	rrp_inc_vat_2dp = rrp_inc_vat.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
	discount_multiplier = (Decimal("1") - (discount_percent / Decimal("100")))
	discounted_inc_vat = rrp_inc_vat_2dp * discount_multiplier

	if rounding_mode == "tile_decimal_pricing":
		final_inc_vat = discounted_inc_vat.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
	elif rounding_mode == "whole_euro_roundup":
		# "round up" mode now rounds to nearest euro (ROUND_HALF_UP) rather than
		# always ceiling, so €640.005 → €640 instead of €641.
		final_inc_vat = discounted_inc_vat.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
	else:
		raise ValueError(f"Unknown rounding_mode: {rounding_mode}")

	final_ex_vat = (final_inc_vat / vat_multiplier).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
	discounted_inc_vat_2dp = discounted_inc_vat.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
	rounding_delta = (final_inc_vat - discounted_inc_vat_2dp).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

	effective_discount_percent = None
	if rrp_inc_vat_2dp != 0:
		effective_discount_percent = (
			(Decimal("1") - (final_inc_vat / rrp_inc_vat_2dp)) * Decimal("100")
		).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)

	profit_ex_vat = None
	margin_percent = None
	markup_percent = None
	if cost_ex_vat is not None:
		cost_ex_vat = Decimal(cost_ex_vat)
		profit_ex_vat = (final_ex_vat - cost_ex_vat).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
		if final_ex_vat != 0:
			margin_percent = (profit_ex_vat / final_ex_vat * Decimal("100")).quantize(
				Decimal("0.001"), rounding=ROUND_HALF_UP
			)
		if cost_ex_vat != 0:
			markup_percent = (profit_ex_vat / cost_ex_vat * Decimal("100")).quantize(
				Decimal("0.001"), rounding=ROUND_HALF_UP
			)

	return {
		"rrp_inc_vat": rrp_inc_vat_2dp,
		"discounted_inc_vat": discounted_inc_vat_2dp,
		"final_offer_inc_vat": final_inc_vat,
		"final_offer_ex_vat": final_ex_vat,
		"effective_discount_percent": effective_discount_percent,
		"rounding_delta": rounding_delta,
		"profit_ex_vat": profit_ex_vat,
		"margin_percent": margin_percent,
		"markup_percent": markup_percent,
	}


def set_default_company_vat_rate_percent(percent: str | int | float = 18):
	"""Set `Company.cm_vat_rate_percent` for the default company.

	Callable via `bench execute` (does not rely on Server Scripts / safe_exec).
	"""
	frappe.set_user("Administrator")

	default_company = frappe.db.get_single_value("Global Defaults", "default_company")
	if not default_company:
		raise ValueError("Global Defaults.default_company is not set")
	if not frappe.db.exists("Company", default_company):
		raise ValueError(f"Default company not found: {default_company}")

	vat_percent = Decimal(str(percent))
	frappe.db.set_value("Company", default_company, "cm_vat_rate_percent", vat_percent)
	frappe.db.commit()

	result = {"company": default_company, "cm_vat_rate_percent": str(vat_percent)}
	print(json.dumps(result, indent=2, sort_keys=True))
	return result
