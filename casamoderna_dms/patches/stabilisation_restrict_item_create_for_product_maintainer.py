import frappe


def execute():
	"""Ensure Product Maintainer cannot create Items (write-only).

	This matches the existing Products Console contract smoke checks.
	"""
	if not frappe.db.exists("DocType", "Custom DocPerm"):
		return

	filters = {
		"parent": "Item",
		"role": "CasaModerna Product Maintainer",
		"permlevel": 0,
	}

	name = frappe.db.get_value("Custom DocPerm", filters, "name")
	if not name:
		return

	doc = frappe.get_doc("Custom DocPerm", name)
	if int(doc.create or 0) != 0:
		doc.create = 0
		doc.save(ignore_permissions=True)

	frappe.clear_cache(doctype="Item")
