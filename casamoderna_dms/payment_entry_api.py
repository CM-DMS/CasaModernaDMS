"""
payment_entry_api.py — helper methods for Payment Entry queries.
"""
import frappe
from frappe import _


@frappe.whitelist()
def get_references_for_entries(names_json: str):
	"""Return Payment Entry Reference rows for a list of PE names.

	Args:
		names_json: JSON-encoded list of Payment Entry names.

	Returns:
		List of dicts with keys: parent, reference_doctype, reference_name, allocated_amount.
	"""
	try:
		names = frappe.parse_json(names_json)
	except Exception:
		frappe.throw(_("Invalid names JSON."), frappe.ValidationError)

	if not names or not isinstance(names, list):
		return []

	# Whitelist only — callers must be logged in (frappe.whitelist handles this).
	return frappe.get_all(
		"Payment Entry Reference",
		fields=["name", "parent", "reference_doctype", "reference_name", "allocated_amount"],
		filters=[
			["parent", "in", names],
			["reference_doctype", "in", ["Sales Invoice", "Sales Order"]],
		],
		limit=len(names) * 10,
	)
