from __future__ import annotations

import json

import frappe


def audit_slice014_sales_order_ui_meta() -> str:
	"""Return a JSON snapshot of Sales Order UI meta relevant to Slice 014.

	This is read-only and safe to run in production. It exists so we can:
	- audit header/preview visibility + field ordering
	- detect site drift
	- assert expected UI meta deterministically in stabilisation_gate
	"""
	dt = "Sales Order"
	meta = frappe.get_meta(dt)

	current_tab = None
	current_section = None
	fields = []
	for df in meta.fields:
		ft = getattr(df, "fieldtype", None)
		if ft == "Tab Break":
			current_tab = getattr(df, "label", None) or getattr(df, "fieldname", None)
			current_section = None
		elif ft == "Section Break":
			current_section = getattr(df, "label", None) or getattr(df, "fieldname", None)

		fields.append(
			{
				"fieldname": getattr(df, "fieldname", None),
				"label": getattr(df, "label", None),
				"fieldtype": ft,
				"idx": getattr(df, "idx", None),
				"tab": current_tab,
				"section": current_section,
				"insert_after": getattr(df, "insert_after", None),
				"hidden": int(getattr(df, "hidden", 0) or 0),
				"collapsible": int(getattr(df, "collapsible", 0) or 0),
				"depends_on": getattr(df, "depends_on", None),
				"in_preview": int(getattr(df, "in_preview", 0) or 0),
				"in_list_view": int(getattr(df, "in_list_view", 0) or 0),
				"bold": int(getattr(df, "bold", 0) or 0),
				"read_only": int(getattr(df, "read_only", 0) or 0),
				"reqd": int(getattr(df, "reqd", 0) or 0),
				"permlevel": int(getattr(df, "permlevel", 0) or 0),
			}
		)

	custom_fields = frappe.get_all(
		"Custom Field",
		filters={"dt": dt},
		fields=[
			"name",
			"fieldname",
			"label",
			"fieldtype",
			"insert_after",
			"hidden",
			"read_only",
			"depends_on",
			"in_preview",
			"in_list_view",
			"bold",
			"idx",
		],
		order_by="idx asc, name asc",
	)

	property_setters = frappe.get_all(
		"Property Setter",
		filters={"doc_type": dt},
		fields=[
			"name",
			"doc_type",
			"field_name",
			"property",
			"value",
			"property_type",
			"doctype_or_field",
			"module",
			"modified",
		],
		order_by="field_name asc, property asc, name asc",
	)

	audit = {
		"doctype": dt,
		"meta_hash": getattr(meta, "hash", None),
		"fields": fields,
		"custom_fields": custom_fields,
		"property_setters": property_setters,
		"enabled_client_scripts": frappe.get_all(
			"Client Script",
			filters={"dt": dt, "enabled": 1},
			fields=["name", "dt", "enabled", "view", "modified"],
			order_by="name asc",
		),
	}

	return json.dumps(audit, indent=2, sort_keys=True, default=str)
