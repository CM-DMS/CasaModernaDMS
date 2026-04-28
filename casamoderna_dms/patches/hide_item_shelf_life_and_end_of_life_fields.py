from __future__ import annotations

import frappe


DT = "Item"


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


def execute():
	"""Hide inventory lifecycle fields not used by CasaModerna.

	CasaModerna sells furniture and tiles and does not use:
	- shelf_life_in_days
	- end_of_life

	This is UI/meta-only: Property Setters on Item DocFields.
	"""
	frappe.set_user("Administrator")

	meta = frappe.get_meta(DT)
	for fn in ["shelf_life_in_days", "end_of_life"]:
		if not meta.has_field(fn):
			# No guessing: only act if field exists.
			continue
		_upsert_docfield_prop(fn, "hidden", "Check", 1)
		_upsert_docfield_prop(fn, "in_list_view", "Check", 0)

	frappe.clear_cache(doctype=DT)
