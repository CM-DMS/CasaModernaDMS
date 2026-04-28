from __future__ import annotations

import json

import frappe


STRUCTURAL_FIELDTYPES = {
	"Section Break",
	"Tab Break",
	"Column Break",
	"HTML",
	"Fold",
	"Heading",
	"Button",
	"Table",
	"Table MultiSelect",
}


def _upsert_doctype_prop(dt: str, prop: str, prop_type: str, value) -> None:
	name = f"{dt}-{prop}"
	if frappe.db.exists("Property Setter", name):
		ps = frappe.get_doc("Property Setter", name)
		ps.value = str(value)
		ps.property_type = prop_type
		ps.save(ignore_permissions=True)
		return

	ps = frappe.new_doc("Property Setter")
	ps.doctype_or_field = "DocType"
	ps.doc_type = dt
	ps.property = prop
	ps.property_type = prop_type
	ps.value = str(value)
	ps.insert(ignore_permissions=True)


def _upsert_docfield_prop(dt: str, fieldname: str, prop: str, prop_type: str, value) -> None:
	name = f"{dt}-{fieldname}-{prop}"
	if frappe.db.exists("Property Setter", name):
		ps = frappe.get_doc("Property Setter", name)
		ps.value = str(value)
		ps.property_type = prop_type
		ps.save(ignore_permissions=True)
		return

	ps = frappe.new_doc("Property Setter")
	ps.doctype_or_field = "DocField"
	ps.doc_type = dt
	ps.field_name = fieldname
	ps.property = prop
	ps.property_type = prop_type
	ps.value = str(value)
	ps.insert(ignore_permissions=True)


def _load_current_field_order(dt: str) -> list[str]:
	name = f"{dt}-field_order"
	if frappe.db.exists("Property Setter", name):
		value = frappe.db.get_value("Property Setter", name, "value")
		if value:
			try:
				order = json.loads(value)
				if isinstance(order, list):
					return [str(f) for f in order if f]
			except Exception:
				pass
	meta = frappe.get_meta(dt)
	return [df.fieldname for df in meta.fields if getattr(df, "fieldname", None)]


def _set_field_order(dt: str, desired_prefix: list[str]) -> None:
	meta = frappe.get_meta(dt)
	present = {df.fieldname for df in meta.fields if getattr(df, "fieldname", None)}
	desired = [f for f in desired_prefix if f in present]

	order = _load_current_field_order(dt)
	order = [f for f in order if f not in desired]
	new_order = desired + order
	_upsert_doctype_prop(dt, "field_order", "Text", json.dumps(new_order))


def _apply_grid_columns(child_dt: str, visible_columns: list[str]) -> dict:
	meta = frappe.get_meta(child_dt)
	present = {df.fieldname for df in meta.fields if getattr(df, "fieldname", None)}
	missing = [f for f in visible_columns if f not in present]
	if missing:
		raise frappe.ValidationError(f"Slice 023 requires {child_dt} fields: {missing}")

	visible_set = set(visible_columns)
	updated = {"child_doctype": child_dt, "visible_columns": visible_columns, "changed": []}

	for df in meta.fields:
		fn = getattr(df, "fieldname", None)
		if not fn:
			continue
		if getattr(df, "fieldtype", None) in STRUCTURAL_FIELDTYPES:
			continue

		want_in_list = 1 if fn in visible_set else 0
		if int(getattr(df, "in_list_view", 0) or 0) != want_in_list:
			_upsert_docfield_prop(child_dt, fn, "in_list_view", "Check", want_in_list)
			updated["changed"].append({"fieldname": fn, "property": "in_list_view", "value": want_in_list})

		if fn in visible_set and int(getattr(df, "hidden", 0) or 0) != 0:
			_upsert_docfield_prop(child_dt, fn, "hidden", "Check", 0)
			updated["changed"].append({"fieldname": fn, "property": "hidden", "value": 0})

	_set_field_order(child_dt, visible_columns)
	return updated


def execute():
	"""Slice 023: Items Grid V1-Parity (authoritative visible columns + order).

	Scope:
	- UI/meta only: child-table DocField `in_list_view` and selective `hidden=0` for target columns.
	- No permissions changes.
	- No pricing math changes.

	Targets:
	- Quotation/Sales Order: V1-like commercial inputs with CM pricing display fields.
	- Delivery Note: minimal operational surface.
	- Sales Invoice/POS Invoice: minimal fiscal surface (rate exposed, but no extra ERPNext clutter).
	- CM Proforma: currently has no CM pricing display fields; keep minimal rate-based surface.
	"""
	frappe.set_user("Administrator")

	columns_by_child: dict[str, list[str]] = {
		# Commercial entry surfaces
		"Quotation Item": [
			"item_code",
			"description",
			"cm_rrp_ex_vat",
			"discount_percentage",
			"cm_final_offer_inc_vat",
			"qty",
			"amount",
		],
		"Sales Order Item": [
			"item_code",
			"description",
			"cm_rrp_ex_vat",
			"discount_percentage",
			"cm_final_offer_inc_vat",
			"qty",
			"amount",
		],
		# Operational docs
		"Delivery Note Item": ["item_code", "description", "qty"],
		"Sales Invoice Item": ["item_code", "description", "qty", "rate", "amount"],
		"POS Invoice Item": ["item_code", "description", "qty", "rate", "amount"],
		# Proforma (bank document): rate-based minimal surface
		"CM Proforma Item": ["item_code", "description", "qty", "rate", "amount"],
	}

	results = []
	for child_dt, cols in columns_by_child.items():
		results.append(_apply_grid_columns(child_dt, cols))

	frappe.clear_cache()
	frappe.logger("casamoderna_dms").info({"slice": "023", "patch": __name__, "results": results})
