import json

import frappe


def _upsert_field_order_property_setter(field_order: list[str]):
	value = json.dumps(field_order)
	name = "Customer-field_order"

	if frappe.db.exists("Property Setter", name):
		ps = frappe.get_doc("Property Setter", name)
		ps.value = value
		ps.save(ignore_permissions=True)
		return

	ps = frappe.new_doc("Property Setter")
	ps.doctype_or_field = "DocType"
	ps.doc_type = "Customer"
	ps.property = "field_order"
	ps.property_type = "Text"
	ps.value = value
	ps.module = "Selling"
	ps.insert(ignore_permissions=True)


def execute():
	# Force meta regeneration before computing field_order.
	frappe.clear_cache(doctype="Customer")
	meta = frappe.get_meta("Customer")
	order = [df.fieldname for df in meta.fields if getattr(df, "fieldname", None)]

	group = [
		"cm_addresses_section",
		"cm_addr_col_left",
		"customer_primary_address",
		"cm_bill_addr_preview",
		"cm_addr_col_right",
		"shipping_address_name",
		"cm_ship_addr_preview",
		"cm_copy_billing_to_delivery",
	]

	missing = [f for f in group if f not in order]
	if missing:
		# Fixtures may not have been imported yet (or fieldnames changed);
		# fail softly so migration can proceed.
		return

	# Remove existing occurrences and re-insert the group in the desired spot.
	order = [f for f in order if f not in group]

	anchor = "customer_primary_contact"
	if anchor in order:
		insert_at = order.index(anchor) + 1
	else:
		fallback = "customer_name"
		insert_at = order.index(fallback) + 1 if fallback in order else len(order)

	for i, f in enumerate(group):
		order.insert(insert_at + i, f)

	_upsert_field_order_property_setter(order)
	frappe.clear_cache(doctype="Customer")
