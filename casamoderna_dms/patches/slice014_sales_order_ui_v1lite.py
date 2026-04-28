from __future__ import annotations

import json

import frappe


DT = "Sales Order"


def _load_current_field_order() -> list[str]:
	# Prefer existing field_order property setter if present.
	name = f"{DT}-field_order"
	if frappe.db.exists("Property Setter", name):
		value = frappe.db.get_value("Property Setter", name, "value")
		if value:
			try:
				order = json.loads(value)
				if isinstance(order, list):
					return [str(f) for f in order if f]
			except Exception:
				pass

	meta = frappe.get_meta(DT)
	return [df.fieldname for df in meta.fields if getattr(df, "fieldname", None)]


def _upsert_field_order(order: list[str]) -> None:
	value = json.dumps(order)
	name = f"{DT}-field_order"

	if frappe.db.exists("Property Setter", name):
		ps = frappe.get_doc("Property Setter", name)
		ps.value = value
		ps.save(ignore_permissions=True)
		return

	ps = frappe.new_doc("Property Setter")
	ps.doctype_or_field = "DocType"
	ps.doc_type = DT
	ps.property = "field_order"
	ps.property_type = "Text"
	ps.value = value
	ps.module = "Selling"
	ps.insert(ignore_permissions=True)


def _upsert_docfield_prop(fieldname: str, prop: str, prop_type: str, value) -> None:
	name = f"{DT}-{fieldname}-{prop}"
	if frappe.db.exists("Property Setter", name):
		ps = frappe.get_doc("Property Setter", name)
		ps.value = str(value)
		ps.property_type = prop_type
		ps.save(ignore_permissions=True)
		return

	ps = frappe.new_doc("Property Setter")
	ps.doctype_or_field = "DocField"
	ps.doc_type = DT
	ps.field_name = fieldname
	ps.property = prop
	ps.property_type = prop_type
	ps.value = str(value)
	ps.insert(ignore_permissions=True)


def _set_custom_field_props(fieldname: str, props: dict) -> None:
	name = frappe.db.get_value("Custom Field", {"dt": DT, "fieldname": fieldname}, "name")
	if not name:
		return

	for key, expected in props.items():
		current = frappe.db.get_value("Custom Field", name, key)
		if str(current) != str(expected):
			frappe.db.set_value("Custom Field", name, key, expected, update_modified=False)


def execute():
	"""Slice 014: Sales Order UI v1-lite identity strip + clutter cleanup.

	Constraints:
	- UI-only (meta): Property Setter / Custom Field properties
	- No workflow/conversion/guardrail behavior changes
	- No DocPerm/Custom DocPerm changes
	"""
	frappe.clear_cache(doctype=DT)

	meta = frappe.get_meta(DT)
	required = [
		"cm_v1_draft_no",
		"cm_v1_operational_no",
		"workflow_state",
		"status",
		"customer",
		"transaction_date",
	]
	missing = [f for f in required if not meta.has_field(f)]
	if missing:
		# Fail fast: this slice is explicitly "no guessing" and depends on these fields.
		raise frappe.ValidationError(f"Slice 014 requires Sales Order fields: {missing}")

	# Make V1 numbers visually scannable in the top identity strip.
	_set_custom_field_props("cm_v1_draft_no", {"bold": 1, "hidden": 0, "read_only": 1})
	_set_custom_field_props("cm_v1_operational_no", {"bold": 1, "hidden": 0, "read_only": 1})

	# Ensure workflow identity is visible and emphasized.
	_upsert_docfield_prop("workflow_state", "hidden", "Check", 0)
	_upsert_docfield_prop("workflow_state", "bold", "Check", 1)
	_upsert_docfield_prop("status", "bold", "Check", 1)

	# Reduce day-to-day clutter: make "Pricing Rules" collapsible (rarely used).
	if meta.has_field("pricing_rule_details"):
		_upsert_docfield_prop("pricing_rule_details", "collapsible", "Check", 1)

	# Move workflow state + status into the top customer section (identity-first).
	order = _load_current_field_order()

	# Remove any existing occurrences.
	move = ["workflow_state", "status"]
	order = [f for f in order if f not in move]

	anchor = "transaction_date" if "transaction_date" in order else "customer"
	insert_at = (order.index(anchor) + 1) if anchor in order else len(order)
	for i, f in enumerate(move):
		order.insert(insert_at + i, f)

	_upsert_field_order(order)

	frappe.clear_cache(doctype=DT)
