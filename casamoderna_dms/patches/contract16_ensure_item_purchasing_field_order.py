import json

import frappe


def _upsert_doctype_field_order_property_setter(doctype: str, field_order: list[str], module: str | None = None):
	value = json.dumps(field_order)
	name = f"{doctype}-field_order"

	if frappe.db.exists("Property Setter", name):
		ps = frappe.get_doc("Property Setter", name)
		ps.value = value
		ps.save(ignore_permissions=True)
		return

	ps = frappe.new_doc("Property Setter")
	ps.doctype_or_field = "DocType"
	ps.doc_type = doctype
	ps.property = "field_order"
	ps.property_type = "Text"
	ps.value = value
	ps.module = module or "Stock"
	ps.insert(ignore_permissions=True)


def execute():
	"""Contract 16: enforce V1-like commercial flow ordering on Item > purchasing_tab.

	Why: Property Setters like `insert_after` update the field property, but do not
	reliably re-order the runtime meta sequence for standard fields. Using the
	DocType-level `field_order` is the canonical way to enforce ordering without
	schema changes.

	Goal: move standard ERPNext purchase-control leftovers under
	`cm_erpnext_purchase_controls_section`.
	"""
	frappe.clear_cache(doctype="Item")
	meta = frappe.get_meta("Item")
	order = [df.fieldname for df in meta.fields if getattr(df, "fieldname", None)]

	anchor = "cm_erpnext_purchase_controls_section"
	if anchor not in order:
		# Fixtures may not have been imported yet; fail softly.
		return

	# Keep this list tight: only the clutter fields we want isolated.
	move_after_anchor = [
		"min_order_qty",
		"safety_stock",
		"is_purchase_item",
		"last_purchase_rate",
		"is_customer_provided_item",
		"customer",
		"delivered_by_supplier",
		"country_of_origin",
		"customs_tariff_number",
	]

	present = [f for f in move_after_anchor if f in order]
	if not present:
		return

	# Remove and re-insert just after anchor.
	order = [f for f in order if f not in present]
	insert_at = order.index(anchor) + 1
	for i, f in enumerate(present):
		order.insert(insert_at + i, f)

	_upsert_doctype_field_order_property_setter("Item", order, module="Stock")
	frappe.clear_cache(doctype="Item")
