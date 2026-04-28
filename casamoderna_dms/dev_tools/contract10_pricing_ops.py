from __future__ import annotations

import json

import frappe


def _tab_for_field(meta, fieldname: str) -> str | None:
	current_tab = None
	for df in meta.fields:
		if df.fieldtype == "Tab Break" and df.fieldname:
			current_tab = df.fieldname
		if df.fieldname == fieldname:
			return current_tab
	return None


def _describe_field(meta, fieldname: str) -> dict:
	df = meta.get_field(fieldname)
	if not df:
		return {"fieldname": fieldname, "exists": False}

	props = {
		"fieldname": fieldname,
		"exists": True,
		"fieldtype": df.fieldtype,
		"label": df.label,
		"tab": _tab_for_field(meta, fieldname),
		"hidden": int(getattr(df, "hidden", 0) or 0),
		"read_only": int(getattr(df, "read_only", 0) or 0),
		"reqd": int(getattr(df, "reqd", 0) or 0),
		"in_list_view": int(getattr(df, "in_list_view", 0) or 0),
		"depends_on": getattr(df, "depends_on", None),
		"read_only_depends_on": getattr(df, "read_only_depends_on", None),
		"insert_after": getattr(df, "insert_after", None),
		"options": getattr(df, "options", None),
	}
	return props


def inspect():
	"""Contract 10 Phase A: inspect current Contract 9 pricing field layout and list visibility.

	Prints JSON (for use in reports).
	"""
	frappe.set_user("Administrator")

	item_meta = frappe.get_meta("Item")
	company_meta = frappe.get_meta("Company")

	pricing_fieldnames = [
		"cm_suppliers_pricing_section",
		"cm_pricing_ops_help",
		"cm_supplier_name",
		"cm_supplier_code",
		"cm_supplier_variant_description",
		"cm_pricing_inputs_section",
		"cm_rrp_ex_vat",
		"cm_discount_percent",
		"cm_pricing_rounding_mode",
		"cm_pricing_outputs_section",
		"cm_rrp_inc_vat",
		"cm_discounted_inc_vat",
		"cm_final_offer_inc_vat",
		"cm_final_offer_ex_vat",
		"cm_rounding_delta",
	]

	item_fields = [_describe_field(item_meta, fn) for fn in pricing_fieldnames]
	company_vat = _describe_field(company_meta, "cm_vat_rate_percent")

	in_list_view = [df.fieldname for df in item_meta.fields if getattr(df, "in_list_view", 0) and df.fieldname]

	default_company = frappe.db.get_single_value("Global Defaults", "default_company")
	vat_value = None
	if default_company and frappe.db.exists("Company", default_company):
		vat_value = frappe.db.get_value("Company", default_company, "cm_vat_rate_percent")

	list_filters = {}
	for name in [
		"CM Active Products",
		"CM Stock Items",
		"CM Non-Stock Items",
		"CM Templates (Has Variants)",
		"CM Variants (Variant Of Set)",
		"CM Missing RRP",
		"CM Tile Pricing",
	]:
		list_filters[name] = bool(frappe.db.exists("List Filter", name))

	result = {
		"item_pricing_fields": item_fields,
		"company_vat_field": company_vat,
		"default_company": default_company,
		"default_company_cm_vat_rate_percent": vat_value,
		"item_in_list_view_fieldnames": in_list_view,
		"item_list_filter_presence": list_filters,
	}

	print(json.dumps(result, indent=2, sort_keys=True, default=str))
	return result
