from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, now


def _existing_proforma_for_source(*, quotation: str | None = None, sales_order: str | None = None) -> str | None:
	filters: dict[str, str] = {}
	if quotation:
		filters["quotation"] = quotation
	if sales_order:
		filters["sales_order"] = sales_order
	if not filters:
		return None
	return frappe.db.get_value("CM Proforma", filters, "name")


def _build_items_from_source(items: list[Document]) -> list[dict]:
	out: list[dict] = []
	for row in items or []:
		item_code = getattr(row, "item_code", None)
		if not item_code:
			continue
		description = getattr(row, "description", None) or getattr(row, "item_name", None) or item_code
		qty = flt(getattr(row, "qty", 0) or 0)
		rate = flt(getattr(row, "rate", 0) or 0)
		amount = flt(getattr(row, "amount", None)) if getattr(row, "amount", None) is not None else flt(qty * rate)
		out.append({
			"item_code": item_code,
			"description": description,
			"qty": qty,
			"rate": rate,
			"amount": amount,
		})
	return out


def _copy_common(doc: Document, *, source: Document):
	# Quotation stores the customer as party_name.
	if getattr(source, "doctype", None) == "Quotation":
		quotation_to = getattr(source, "quotation_to", None)
		party_name = getattr(source, "party_name", None)
		if quotation_to and quotation_to != "Customer":
			frappe.throw(_("Proforma can only be created from Customer quotations"))
		doc.customer = party_name
		doc.customer_name = getattr(source, "customer_name", None) or frappe.db.get_value("Customer", party_name, "customer_name")
	else:
		doc.customer = getattr(source, "customer", None)
		doc.customer_name = getattr(source, "customer_name", None)
	doc.currency = getattr(source, "currency", None)
	doc.customer_address = getattr(source, "customer_address", None) or getattr(source, "customer_primary_address", None)
	doc.shipping_address_name = getattr(source, "shipping_address_name", None)
	doc.contact_person = getattr(source, "contact_person", None)

	# Snapshot totals for a stable bank document.
	for fn in ["net_total", "total_taxes_and_charges", "grand_total", "rounded_total"]:
		if hasattr(source, fn):
			setattr(doc, fn, getattr(source, fn, None))

	# Optional notes/remarks.
	doc.notes = getattr(source, "remarks", None) or getattr(source, "terms", None) or None


@frappe.whitelist()
def create_proforma_from_quotation(quotation: str) -> dict:
	"""Create (or return existing) CM Proforma from a Quotation.

	Idempotent behavior: if a CM Proforma already exists for this quotation, return it.
	"""
	if not quotation:
		frappe.throw(_("Quotation is required"))

	existing = _existing_proforma_for_source(quotation=quotation)
	if existing:
		return {"name": existing, "existing": True}

	q = frappe.get_doc("Quotation", quotation)
	if getattr(q, "docstatus", 0) == 2:
		frappe.throw(_("Cannot create Proforma from a cancelled Quotation"))

	pf = frappe.new_doc("CM Proforma")
	pf.quotation = q.name
	pf.sales_order = None
	pf.cm_pf_issued = 0
	pf.cm_pf_issued_on = None
	_copy_common(pf, source=q)

	for row in _build_items_from_source(getattr(q, "items", None) or []):
		pf.append("items", row)

	pf.insert()
	return {"name": pf.name, "existing": False}


@frappe.whitelist()
def create_proforma_from_sales_order(sales_order: str) -> dict:
	"""Create (or return existing) CM Proforma from a Sales Order.

	Idempotent behavior: if a CM Proforma already exists for this sales order, return it.
	"""
	if not sales_order:
		frappe.throw(_("Sales Order is required"))

	existing = _existing_proforma_for_source(sales_order=sales_order)
	if existing:
		return {"name": existing, "existing": True}

	so = frappe.get_doc("Sales Order", sales_order)
	if getattr(so, "docstatus", 0) == 2:
		frappe.throw(_("Cannot create Proforma from a cancelled Sales Order"))

	pf = frappe.new_doc("CM Proforma")
	pf.sales_order = so.name
	pf.quotation = None
	pf.cm_pf_issued = 0
	pf.cm_pf_issued_on = None
	_copy_common(pf, source=so)

	for row in _build_items_from_source(getattr(so, "items", None) or []):
		pf.append("items", row)

	pf.insert()
	return {"name": pf.name, "existing": False}


@frappe.whitelist()
def issue_proforma(name: str) -> dict:
	"""Mark a CM Proforma as issued.

	This is an explicit transition for a non-submittable, non-fiscal bank document.
	"""
	if not name:
		frappe.throw(_("Proforma name is required"))

	pf = frappe.get_doc("CM Proforma", name)
	if int(getattr(pf, "cm_pf_issued", 0) or 0) == 1:
		return {"name": pf.name, "issued": True, "already": True}

	pf.cm_pf_issued = 1
	pf.cm_pf_issued_on = now()
	pf.save()
	return {"name": pf.name, "issued": True, "already": False}
