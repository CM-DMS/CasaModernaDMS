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


def _visible_grid_columns(child_dt: str) -> list[str]:
	meta = frappe.get_meta(child_dt)
	out: list[str] = []
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
		out.append(fn)
	return out


def _child_table_snapshot(child_dt: str) -> dict:
	meta = frappe.get_meta(child_dt)
	fields = []
	cm_fields = []
	for df in meta.fields:
		fn = getattr(df, "fieldname", None)
		if not fn:
			continue
		if str(fn).startswith("cm_"):
			cm_fields.append(fn)
		fields.append(
			{
				"idx": int(getattr(df, "idx", 0) or 0),
				"fieldname": fn,
				"label": getattr(df, "label", None),
				"fieldtype": getattr(df, "fieldtype", None),
				"options": getattr(df, "options", None),
				"reqd": int(getattr(df, "reqd", 0) or 0),
				"read_only": int(getattr(df, "read_only", 0) or 0),
				"hidden": int(getattr(df, "hidden", 0) or 0),
				"in_list_view": int(getattr(df, "in_list_view", 0) or 0),
				"precision": getattr(df, "precision", None),
				"depends_on": getattr(df, "depends_on", None),
				"mandatory_depends_on": getattr(df, "mandatory_depends_on", None),
			}
		)

	return {
		"child_doctype": child_dt,
		"doctype_field_order_property_setter": _load_doctype_field_order(child_dt),
		"visible_grid_columns": _visible_grid_columns(child_dt),
		"cm_fields_present": sorted(cm_fields),
		"fields": fields,
	}


def audit_slice023_items_grid() -> dict:
	"""Slice 023 Phase A: inspect Sales Doc items child tables (meta only; no changes).

	Outputs:
	- Parent → child doctype mapping for items table.
	- For each child doctype: current visible grid columns + field metadata.
	- Field presence mapping for V1 target concepts (RRP/Discount/Offer/Line Total).
	"""
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
		"field_mappings": {},
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

	# Deterministic field presence mapping for V1 target concepts.
	concept_candidates = {
		"rrp_ex_vat": ["cm_rrp_ex_vat", "price_list_rate"],
		"discount_percent": ["discount_percentage"],
		"offer_inc_vat_or_rate": ["cm_final_offer_inc_vat", "rate"],
		"line_total": ["amount"],
		"qty": ["qty"],
		"description": ["description"],
		"item_code": ["item_code"],
	}

	for child_dt in sorted(child_dts):
		meta = frappe.get_meta(child_dt)
		mapping: dict[str, dict] = {}
		for concept, candidates in concept_candidates.items():
			present = [fn for fn in candidates if meta.has_field(fn)]
			mapping[concept] = {"candidates": candidates, "present": present}
		result["field_mappings"][child_dt] = mapping

	return result
