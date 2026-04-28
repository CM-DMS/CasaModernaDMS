"""remove_v1_numbering — Drop V1 custom number fields; restore naming_series visibility.

Removes the cm_v1_draft_no, cm_v1_operational_no, and cm_v1_fiscal_record_no
Custom Fields that were created by slice005/slice010/slice009. Also removes the
Property Setter that hid the standard naming_series field on sales doctypes so
Frappe's native document numbering is visible again.
"""
import frappe


def execute():
	frappe.set_user("Administrator")

	# ── 1. Delete cm_v1_* Custom Fields ────────────────────────────────────────
	v1_fieldnames = [
		"cm_v1_draft_no",
		"cm_v1_operational_no",
		"cm_v1_fiscal_record_no",
	]
	affected_doctypes = [
		"Quotation",
		"Sales Order",
		"Delivery Note",
		"Sales Invoice",
		"POS Invoice",
		"Payment Entry",
		"CM Proforma",
	]
	for dt in affected_doctypes:
		for fn in v1_fieldnames:
			if frappe.db.exists("Custom Field", {"dt": dt, "fieldname": fn}):
				frappe.db.delete("Custom Field", {"dt": dt, "fieldname": fn})

	# ── 2. Restore naming_series visibility ─────────────────────────────────────
	# slice016 created a Property Setter hidden=1 for naming_series on each
	# sales doctype. Remove those setters so Frappe's native naming series field
	# shows up in the form again.
	ns_doctypes = [
		"Quotation",
		"Sales Order",
		"Delivery Note",
		"Sales Invoice",
		"POS Invoice",
	]
	for dt in ns_doctypes:
		frappe.db.delete(
			"Property Setter",
			{"doc_type": dt, "field_name": "naming_series", "property": "hidden"},
		)

	frappe.clear_cache()
