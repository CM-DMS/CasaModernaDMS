import frappe


def execute():
	# Earlier iteration added `cm_phone` but the contract requires a single Phone/Mobile field.
	# Safe to delete the Custom Field definition; this does not delete any core data.
	field_name = "Customer-cm_phone"
	if frappe.db.exists("Custom Field", field_name):
		doc = frappe.get_doc("Custom Field", field_name)
		doc.delete(ignore_permissions=True)
