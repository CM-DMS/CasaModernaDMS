import frappe


def execute():
	filters = {
		"doc_type": "Customer",
		"field_name": "cm_delivery_capture_section",
		"property": "width",
	}

	# Best-effort deletion by known name and by attribute filters.
	to_delete = set()
	if frappe.db.exists("Property Setter", "Customer-cm_delivery_capture_section-width"):
		to_delete.add("Customer-cm_delivery_capture_section-width")

	rows = frappe.get_all("Property Setter", filters=filters, pluck="name")
	for name in rows:
		to_delete.add(name)

	for name in sorted(to_delete):
		frappe.delete_doc("Property Setter", name, force=1, ignore_permissions=True)

	if to_delete:
		frappe.clear_cache(doctype="Customer")
