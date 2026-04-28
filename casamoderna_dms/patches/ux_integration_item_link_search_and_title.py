from __future__ import annotations

import frappe


def _upsert_property_setter(doc_type: str, property_name: str, value: str, property_type: str = "Data"):
	name = f"{doc_type}-{property_name}"
	if frappe.db.exists("Property Setter", name):
		doc = frappe.get_doc("Property Setter", name)
		changed = False
		if (doc.value or "") != value:
			doc.value = value
			changed = True
		if (doc.property_type or "") != property_type:
			doc.property_type = property_type
			changed = True
		if (doc.doctype_or_field or "") != "DocType":
			doc.doctype_or_field = "DocType"
			changed = True
		if changed:
			doc.save(ignore_permissions=True)
		return

	doc = frappe.get_doc(
		{
			"doctype": "Property Setter",
			"name": name,
			"doc_type": doc_type,
			"doctype_or_field": "DocType",
			"property": property_name,
			"property_type": property_type,
			"value": value,
			"is_system_generated": 0,
		}
	)
	doc.insert(ignore_permissions=True)


def execute():
	"""Native Item UX integration.

	- Use cm_display_name as Item title (link dialogs / list title)
	- Make cm_given_name + cm_supplier_code searchable via search_fields
	- Show title field in Link widgets

	Note: cm_display_name is a virtual field (not stored in DB) so it cannot be
	included in search_fields (which runs SQL LIKE queries).  It is still used as
	the title_field because Frappe resolves title_field from the loaded doc object,
	which has the virtual value set by the onload hook.
	"""
	if not frappe.db.exists("DocType", "Item"):
		return

	# cm_display_name intentionally excluded from search_fields — virtual field.
	search_fields = "item_code,item_name,cm_given_name,cm_supplier_code,description,item_group,customer_code"

	_upsert_property_setter("Item", "title_field", "cm_display_name", "Data")
	_upsert_property_setter("Item", "search_fields", search_fields, "Small Text")
	_upsert_property_setter("Item", "show_title_field_in_link", "1", "Check")

	frappe.clear_cache(doctype="Item")
