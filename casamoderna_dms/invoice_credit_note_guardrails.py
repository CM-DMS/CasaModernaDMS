import frappe
from frappe import _


def validate_sales_invoice_return_guardrails(doc, method=None):
	"""Slice 007: Sales Invoice Credit Note (CN) guardrails.

	Rules:
	- Applies to Sales Invoice returns only (is_return=1).
	- return_against must be set.
	- return_against must exist and be submitted.
	- CN must be against an IN (not a CS / POS invoice, not another return).

	This is server-side validation; no DocPerm/Custom DocPerm changes.
	"""
	if not doc or getattr(doc, "doctype", None) != "Sales Invoice":
		return

	if not int(getattr(doc, "is_return", 0) or 0):
		return

	return_against = (getattr(doc, "return_against", None) or "").strip()
	if not return_against:
		frappe.throw(
			_("Credit Note must be created as a return against an existing Sales Invoice."),
			title=_("Return Not Allowed"),
		)

	if return_against == getattr(doc, "name", None):
		frappe.throw(
			_("Credit Note cannot be created against itself."),
			title=_("Return Not Allowed"),
		)

	if not frappe.db.exists("Sales Invoice", return_against):
		frappe.throw(
			_("Credit Note return_against must reference an existing submitted Sales Invoice."),
			title=_("Return Not Allowed"),
		)

	base = frappe.db.get_value(
		"Sales Invoice",
		return_against,
		["docstatus", "is_return", "is_pos"],
		as_dict=True,
	)
	if not base or int(base.docstatus or 0) != 1:
		frappe.throw(
			_("Credit Note must be created against a submitted Sales Invoice (not Draft/Cancelled)."),
			title=_("Return Not Allowed"),
		)

	if int(base.is_return or 0) == 1:
		frappe.throw(
			_("Credit Note must be created against an Invoice (IN), not another Credit Note."),
			title=_("Return Not Allowed"),
		)

	# Slice 007 scope: CN against IN only (Cash Sale handled via POS Invoice in Slice 006).
	if int(base.is_pos or 0) == 1:
		frappe.throw(
			_("Credit Note against Cash Sale is not allowed in Sales Invoice flow. Use POS return flow."),
			title=_("Return Not Allowed"),
		)
