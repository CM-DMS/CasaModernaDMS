from __future__ import annotations

import frappe
from frappe.utils import flt


def validate_ab_split(doc, method=None):
	# Only proceed if fields exist on this DocType (fixtures should ensure they do).
	if not hasattr(doc, "cm_customer_b"):
		return

	total, total_field = _get_total(doc)

	customer_a = _get_customer_a(doc)
	customer_b = (getattr(doc, "cm_customer_b", None) or "").strip()

	# Normalize amount
	b_amount = flt(getattr(doc, "cm_customer_b_amount", 0) or 0)
	if not customer_b:
		if b_amount != 0:
			doc.cm_customer_b_amount = 0
		b_amount = 0
	else:
		# Customer B is set, but amount might be empty
		doc.cm_customer_b_amount = b_amount

	# Optional confusion-prevention
	if customer_b and customer_a and customer_b == customer_a:
		frappe.throw("Customer B cannot be the same as Customer A.", frappe.ValidationError)

	# Validate amount
	if b_amount < 0:
		frappe.throw("Customer B Amount cannot be negative.", frappe.ValidationError)
	if b_amount > total:
		frappe.throw("Customer B Amount cannot exceed document total.", frappe.ValidationError)

	# Compute and store
	if hasattr(doc, "cm_customer_a_amount"):
		doc.cm_customer_a_amount = flt(total - b_amount)

	# For debugging / transparency (smoke checks print these)
	if hasattr(doc, "cm_split_total_field"):
		doc.cm_split_total_field = total_field


def _get_total(doc) -> tuple[float, str]:
	meta = frappe.get_meta(doc.doctype)
	if meta.has_field("grand_total"):
		return flt(getattr(doc, "grand_total", 0) or 0), "grand_total"
	if meta.has_field("rounded_total"):
		return flt(getattr(doc, "rounded_total", 0) or 0), "rounded_total"

	# Hard stop: we can't safely determine totals
	raise frappe.ValidationError(f"Cannot determine total for {doc.doctype}: missing grand_total/rounded_total")


def _get_customer_a(doc) -> str:
	if doc.doctype == "Sales Order":
		return (getattr(doc, "customer", None) or "").strip()
	if doc.doctype == "Quotation":
		# In ERPNext v15, Quotation uses quotation_to + party_name.
		return (getattr(doc, "party_name", None) or "").strip()

	return (getattr(doc, "customer", None) or "").strip()
