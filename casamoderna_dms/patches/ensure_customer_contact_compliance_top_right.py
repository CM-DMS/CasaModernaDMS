import json

import frappe


def _load_current_field_order() -> list[str]:
	# Prefer existing field_order property setter if present.
	name = "Customer-field_order"
	if frappe.db.exists("Property Setter", name):
		value = frappe.db.get_value("Property Setter", name, "value")
		if value:
			try:
				order = json.loads(value)
				if isinstance(order, list):
					return [str(f) for f in order if f]
			except Exception:
				pass

	meta = frappe.get_meta("Customer")
	return [df.fieldname for df in meta.fields if getattr(df, "fieldname", None)]


def _upsert_field_order(order: list[str]) -> None:
	value = json.dumps(order)
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
	frappe.clear_cache(doctype="Customer")

	order = _load_current_field_order()

	group = [
		"cm_mobile",
		"cm_email",
		"cm_id_card_no",
		"cm_vat_no",
	]

	# Only act if the fields exist.
	meta = frappe.get_meta("Customer")
	missing = [f for f in group if not meta.has_field(f)]
	if missing:
		return

	# Remove existing occurrences.
	order = [f for f in order if f not in group]

	# Insert into the right-hand column next to Customer Name.
	# This column begins at `column_break0` in ERPNext Customer.
	anchor = "column_break0" if "column_break0" in order else None
	if not anchor and "territory" in order:
		# Fallback: insert before the hidden default right-column fields.
		insert_at = order.index("territory")
	else:
		insert_at = (order.index(anchor) + 1) if anchor else len(order)

	for i, f in enumerate(group):
		order.insert(insert_at + i, f)

	_upsert_field_order(order)
	frappe.clear_cache(doctype="Customer")
