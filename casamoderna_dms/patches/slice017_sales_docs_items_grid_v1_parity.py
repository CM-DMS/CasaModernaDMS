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
		raise frappe.ValidationError(f"Slice 017 requires {child_dt} fields: {missing}")

	# Make exactly these fields visible as grid columns.
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

		# Ensure visible columns are not hidden.
		if fn in visible_set and int(getattr(df, "hidden", 0) or 0) != 0:
			_upsert_docfield_prop(child_dt, fn, "hidden", "Check", 0)
			updated["changed"].append({"fieldname": fn, "property": "hidden", "value": 0})

	# Ensure grid column order starts with the V1 column sequence.
	_set_field_order(child_dt, visible_columns)

	return updated


def execute():
	"""Slice 017: Sales Docs Items Grid V1-Parity (Pass 1).

	Scope:
	- UI/meta only: child-table DocField `in_list_view` and selective `hidden=0` for V1 columns.
	- No business logic changes.
	- No permissions changes.

	Target V1-like working columns (where fields exist):
	- Code, Description, RRP, Disc %, Offer (inc VAT), Qty, Total

	Notes:
	- Only Quotation Item / Sales Order Item currently expose CasaModerna pricing display fields.
	- For downstream stock/fiscal docs (DN/SI/POS) and CM Proforma, we reduce the grid to a minimal
	  commercial working surface (Code, Description, Qty, Total) and keep operational fields off-grid.
	"""
	frappe.set_user("Administrator")

	# Child doctypes (audited deterministically in Slice 017 audit).
	columns_by_child: dict[str, list[str]] = {
		# Commercial entry surfaces (CasaModerna pricing display fields are present)
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
		# Downstream docs: minimal V1-like working surface (no CM pricing display fields exist)
		"Delivery Note Item": ["item_code", "description", "qty", "amount"],
		"Sales Invoice Item": ["item_code", "description", "qty", "amount"],
		"POS Invoice Item": ["item_code", "description", "qty", "amount"],
		"CM Proforma Item": ["item_code", "description", "qty", "amount"],
	}

	results = []
	for child_dt, cols in columns_by_child.items():
		results.append(_apply_grid_columns(child_dt, cols))

	frappe.clear_cache()
	frappe.logger("casamoderna_dms").info({"slice": "017", "patch": __name__, "results": results})
