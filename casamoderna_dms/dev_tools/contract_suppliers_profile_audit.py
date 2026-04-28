from __future__ import annotations

import json

import frappe


KEY_FIELDS = [
	"supplier_name",
	"supplier_group",
	"supplier_type",
	"tax_id",
	"website",
	"disabled",
	"on_hold",
	"payment_terms",
	"default_bank_account",
	"supplier_primary_contact",
	"mobile_no",
	"email_id",
	"contact_html",
	"supplier_primary_address",
	"primary_address",
	"address_html",
	"supplier_details",
]


def _field_row(meta, fieldname: str) -> dict:
	df = meta.get_field(fieldname)
	if not df:
		return {"fieldname": fieldname, "present": False}
	return {
		"fieldname": fieldname,
		"present": True,
		"fieldtype": df.fieldtype,
		"label": df.label,
		"hidden": int(getattr(df, "hidden", 0) or 0),
		"read_only": int(getattr(df, "read_only", 0) or 0),
		"reqd": int(getattr(df, "reqd", 0) or 0),
		"insert_after": getattr(df, "insert_after", None),
		"options": getattr(df, "options", None),
	}


def audit() -> dict:
	frappe.set_user("Administrator")
	meta = frappe.get_meta("Supplier")

	# High-signal structural walk: tabs + sections in order.
	structure = []
	current_tab = "(default)"
	for df in meta.fields:
		if df.fieldtype == "Tab Break":
			current_tab = df.label or df.fieldname or "(tab)"
			structure.append(
				{
					"kind": "tab",
					"fieldname": df.fieldname,
					"label": df.label,
					"hidden": int(getattr(df, "hidden", 0) or 0),
				}
			)
			continue
		if df.fieldtype == "Section Break":
			structure.append(
				{
					"kind": "section",
					"tab": current_tab,
					"fieldname": df.fieldname,
					"label": df.label,
					"hidden": int(getattr(df, "hidden", 0) or 0),
					"options": getattr(df, "options", None),
				}
			)

	# Key meta facts for business capture.
	facts = {
		"title_field": getattr(meta, "title_field", None),
		"search_fields": getattr(meta, "search_fields", None),
		"autoname": getattr(meta, "autoname", None),
		"naming_series_options": None,
	}
	series_df = meta.get_field("naming_series")
	if series_df:
		facts["naming_series_options"] = getattr(series_df, "options", None)

	key_field_rows = [_field_row(meta, f) for f in KEY_FIELDS]

	return {
		"site": frappe.local.site,
		"doctype": "Supplier",
		"facts": facts,
		"structure": structure,
		"key_fields": key_field_rows,
	}


def run() -> dict:
	res = audit()
	print(json.dumps(res, indent=2, ensure_ascii=False, default=str))
	return res
