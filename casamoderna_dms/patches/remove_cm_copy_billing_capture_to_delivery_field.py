import json

import frappe


def _remove_from_field_order(fieldname: str) -> None:
	name = "Customer-field_order"
	if not frappe.db.exists("Property Setter", name):
		return
	value = frappe.db.get_value("Property Setter", name, "value")
	if not value:
		return
	try:
		order = json.loads(value)
	except Exception:
		return
	if not isinstance(order, list):
		return
	new_order = [f for f in order if f and str(f) != fieldname]
	if new_order == order:
		return
	ps = frappe.get_doc("Property Setter", name)
	ps.value = json.dumps(new_order)
	ps.save(ignore_permissions=True)


def execute():
	fieldname = "cm_copy_billing_capture_to_delivery"

	# Remove Custom Field record (which also removes the Custom DocField).
	cf_name = f"Customer-{fieldname}"
	if frappe.db.exists("Custom Field", cf_name):
		frappe.delete_doc("Custom Field", cf_name, force=1, ignore_permissions=True)

	# Defensive: remove any matching DocField rows if present.
	frappe.db.delete("DocField", {"parent": "Customer", "fieldname": fieldname})

	_remove_from_field_order(fieldname)
	frappe.clear_cache(doctype="Customer")
