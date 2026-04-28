import frappe
from frappe import _


def validate_cash_sale_return_guardrails(doc, method=None):
	"""Slice 006: guardrails for cash-sale return (Credit Note) flow.

	Cash Sale path is POS Invoice (ERPNext-first). A return / credit note must only
	be created against an existing cash sale document.

	This is intentionally non-destructive:
	- Does not rename documents
	- Does not change naming series / autoname
	- Does not touch permissions / Custom DocPerm
	"""
	if not doc or getattr(doc, "doctype", None) != "POS Invoice":
		return

	if not int(getattr(doc, "is_return", 0) or 0):
		return

	return_against = getattr(doc, "return_against", None)
	if not return_against:
		frappe.throw(
			_("Credit Note (cash sale return) must be created as a return against an existing Cash Sale."),
			title=_("Return Not Allowed"),
		)

	# ERPNext may represent cash-sale source as POS Invoice, but be tolerant
	# of legacy paths where a cash sale is a Sales Invoice with is_pos=1.
	if frappe.db.exists("POS Invoice", return_against):
		row = frappe.db.get_value(
			"POS Invoice",
			return_against,
			["docstatus", "is_pos", "is_return"],
			as_dict=True,
		)
		if not row or int(row.docstatus or 0) != 1:
			frappe.throw(
				_("Cash Sale return must be against a submitted Cash Sale."),
				title=_("Return Not Allowed"),
			)
		if int(row.is_return or 0) == 1:
			frappe.throw(
				_("Cash Sale return cannot be created against another return document."),
				title=_("Return Not Allowed"),
			)
		if int(row.is_pos or 0) != 1:
			frappe.throw(
				_("Cash Sale return must be against a Cash Sale (POS) document."),
				title=_("Return Not Allowed"),
			)
		return

	if frappe.db.exists("Sales Invoice", return_against):
		row = frappe.db.get_value(
			"Sales Invoice",
			return_against,
			["docstatus", "is_pos", "is_return"],
			as_dict=True,
		)
		if not row or int(row.docstatus or 0) != 1:
			frappe.throw(
				_("Cash Sale return must be against a submitted Cash Sale."),
				title=_("Return Not Allowed"),
			)
		if int(row.is_return or 0) == 1:
			frappe.throw(
				_("Cash Sale return cannot be created against another return document."),
				title=_("Return Not Allowed"),
			)
		if int(row.is_pos or 0) != 1:
			frappe.throw(
				_("Cash Sale return must be against a Cash Sale (POS) document."),
				title=_("Return Not Allowed"),
			)
		return

	frappe.throw(
		_("Cash Sale return must be against an existing Cash Sale document."),
		title=_("Return Not Allowed"),
	)
