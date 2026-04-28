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

	return {
		"fieldname": fieldname,
		"exists": True,
		"fieldtype": df.fieldtype,
		"label": df.label,
		"tab": _tab_for_field(meta, fieldname),
		"hidden": int(getattr(df, "hidden", 0) or 0),
		"read_only": int(getattr(df, "read_only", 0) or 0),
		"reqd": int(getattr(df, "reqd", 0) or 0),
		"in_list_view": int(getattr(df, "in_list_view", 0) or 0),
		"precision": getattr(df, "precision", None),
		"options": getattr(df, "options", None),
		"insert_after": getattr(df, "insert_after", None),
	}


def inspect():
	"""Contract 12 Phase A: inspect current full pricing model + print discount usage.

	Prints JSON.
	"""
	frappe.set_user("Administrator")

	item_meta = frappe.get_meta("Item")
	company_meta = frappe.get_meta("Company")

	# Explicit Contract 9/10 fields
	cm_fields = [
		"cm_rrp_ex_vat",
		"cm_discount_percent",
		"cm_pricing_rounding_mode",
		"cm_rrp_inc_vat",
		"cm_discounted_inc_vat",
		"cm_final_offer_inc_vat",
		"cm_final_offer_ex_vat",
		"cm_rounding_delta",
		"cm_pricing_ops_help",
	]

	# Candidate standard cost / price inputs (if they exist)
	candidate_item_fields = [
		"valuation_rate",
		"last_purchase_rate",
		"standard_rate",
		"opening_stock",
		"opening_stock_value",
		"is_purchase_item",
		"is_sales_item",
	]

	# Also scan for anything cost-ish in Item meta
	scanned = []
	for df in item_meta.fields:
		fn = getattr(df, "fieldname", None)
		if not fn:
			continue
		low = fn.lower()
		if any(k in low for k in ("cost", "valuation", "purchase", "rate", "price", "margin", "profit", "markup", "land")):
			scanned.append(fn)

	company_vat = _describe_field(company_meta, "cm_vat_rate_percent")
	default_company = frappe.db.get_single_value("Global Defaults", "default_company")
	vat_value = None
	if default_company and frappe.db.exists("Company", default_company):
		vat_value = frappe.db.get_value("Company", default_company, "cm_vat_rate_percent")

	client_scripts = {}
	for cs_name in ["Item - CasaModerna Pricing Ops"]:
		client_scripts[cs_name] = {
			"exists": bool(frappe.db.exists("Client Script", cs_name)),
		}
		if client_scripts[cs_name]["exists"]:
			cs = frappe.get_doc("Client Script", cs_name)
			client_scripts[cs_name].update(
				{
					"enabled": int(getattr(cs, "enabled", 0) or 0),
					"dt": getattr(cs, "dt", None),
					"has_cm_pricing_ops_help": "cm_pricing_ops_help" in (cs.script or ""),
					"has_cm_vat_rate_percent": "cm_vat_rate_percent" in (cs.script or ""),
				}
			)

	# Print Formats: scan for any discount-related tokens.
	print_formats = []
	if frappe.db.exists("DocType", "Print Format"):
		rows = frappe.get_all(
			"Print Format",
			fields=["name", "doc_type", "disabled", "print_format_type"],
			order_by="modified desc",
			limit=200,
		)
		for r in rows:
			pf = frappe.get_doc("Print Format", r.name)
			html = (pf.html or "")
			needle_hits = []
			for needle in ["discount", "discount_percentage", "discount_amount", "cm_discount"]:
				if needle in html:
					needle_hits.append(needle)
			print_formats.append(
				{
					"name": pf.name,
					"doc_type": pf.doc_type,
					"disabled": int(getattr(pf, "disabled", 0) or 0),
					"print_format_type": pf.print_format_type,
					"discount_tokens_found": needle_hits,
				}
			)

	result = {
		"item_fields": {
			"contract9_10": [_describe_field(item_meta, fn) for fn in cm_fields],
			"candidates": [_describe_field(item_meta, fn) for fn in candidate_item_fields],
			"scan_costish_fieldnames": sorted(set(scanned)),
		},
		"company_vat_field": company_vat,
		"default_company": default_company,
		"default_company_cm_vat_rate_percent": vat_value,
		"calculation_paths": {
			"server": "Item validate hook: casamoderna_dms.cm_pricing.apply_item_pricing (see hooks.py)",
			"client": "Client Script: Item - CasaModerna Pricing Ops (help/warning only)",
		},
		"client_scripts": client_scripts,
		"print_formats_discount_scan": print_formats,
	}

	print(json.dumps(result, indent=2, sort_keys=True, default=str))
	return result
