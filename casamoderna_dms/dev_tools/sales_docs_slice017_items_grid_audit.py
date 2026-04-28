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


def _load_doctype_field_order(dt: str) -> list[str] | None:
	name = f"{dt}-field_order"
	if frappe.db.exists("Property Setter", name):
		value = frappe.db.get_value("Property Setter", name, "value")
		if value:
			try:
				order = json.loads(value)
				if isinstance(order, list):
					return [str(f) for f in order if f]
			except Exception:
				return None
	return None


def _child_table_snapshot(child_dt: str) -> dict:
	meta = frappe.get_meta(child_dt)
	fields = []
	for df in meta.fields:
		fn = getattr(df, "fieldname", None)
		if not fn:
			continue
		fields.append(
			{
				"idx": int(getattr(df, "idx", 0) or 0),
				"fieldname": fn,
				"label": getattr(df, "label", None),
				"fieldtype": getattr(df, "fieldtype", None),
				"reqd": int(getattr(df, "reqd", 0) or 0),
				"read_only": int(getattr(df, "read_only", 0) or 0),
				"hidden": int(getattr(df, "hidden", 0) or 0),
				"in_list_view": int(getattr(df, "in_list_view", 0) or 0),
				"depends_on": getattr(df, "depends_on", None),
				"mandatory_depends_on": getattr(df, "mandatory_depends_on", None),
			}
		)

	visible_grid_columns = []
	for df in meta.fields:
		fn = getattr(df, "fieldname", None)
		if not fn:
			continue
		if getattr(df, "fieldtype", None) in STRUCTURAL_FIELDTYPES:
			continue
		if int(getattr(df, "hidden", 0) or 0) == 1:
			continue
		if int(getattr(df, "in_list_view", 0) or 0) != 1:
			continue
		visible_grid_columns.append(fn)

	return {
		"child_doctype": child_dt,
		"doctype_field_order_property_setter": _load_doctype_field_order(child_dt),
		"visible_grid_columns": visible_grid_columns,
		"fields": fields,
	}


def audit_slice017_items_grid() -> dict:
	"""Slice 017 audit: inspect sales doc items child tables (meta only; no changes)."""
	frappe.set_user("Administrator")

	parents = [
		"Quotation",
		"Sales Order",
		"Delivery Note",
		"Sales Invoice",
		"POS Invoice",
		"CM Proforma",
	]

	result: dict = {
		"site": frappe.local.site,
		"generated_on": frappe.utils.now_datetime().isoformat(),
		"parents": {},
		"child_tables": {},
	}

	child_dts: set[str] = set()

	for parent in parents:
		meta = frappe.get_meta(parent)
		items_field = meta.get_field("items")
		items_child = getattr(items_field, "options", None) if items_field else None
		result["parents"][parent] = {
			"items_fieldname": "items" if bool(items_field) else None,
			"items_child_doctype": items_child,
		}
		if items_child:
			child_dts.add(str(items_child))

	for child_dt in sorted(child_dts):
		result["child_tables"][child_dt] = _child_table_snapshot(child_dt)

	return result
