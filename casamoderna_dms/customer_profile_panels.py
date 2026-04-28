from __future__ import annotations

import frappe


def _assert_can_read_customer(customer: str) -> None:
	if not customer:
		frappe.throw("Missing customer")
	if not frappe.db.exists("Customer", customer):
		frappe.throw("Customer not found")
	if not frappe.has_permission("Customer", "read", customer):
		frappe.throw("Not permitted")


@frappe.whitelist()
def get_customer_contact_persons(customer: str):
	"""Return basic Contact info linked to a Customer via Dynamic Link.

	This powers the Customer form's "Contact Persons" HTML panel.
	"""
	_assert_can_read_customer(customer)

	primary_contact = frappe.db.get_value("Customer", customer, "customer_primary_contact")

	rows = frappe.get_all(
		"Dynamic Link",
		filters={
			"parenttype": "Contact",
			"link_doctype": "Customer",
			"link_name": customer,
		},
		fields=["parent"],
		distinct=True,
	)
	contact_names = [r.parent for r in rows if r.parent]

	if not contact_names:
		return {"customer": customer, "primary_contact": primary_contact, "contacts": []}

	contacts = frappe.get_all(
		"Contact",
		filters={"name": ["in", contact_names]},
		fields=["name", "full_name", "first_name", "last_name", "email_id", "mobile_no", "phone"],
	)

	for c in contacts:
		full_name = c.get("full_name")
		if not full_name:
			first_name = (c.get("first_name") or "").strip()
			last_name = (c.get("last_name") or "").strip()
			full_name = (first_name + " " + last_name).strip() or c.get("name")
		c["full_name"] = full_name
		c["is_primary"] = bool(primary_contact and c.get("name") == primary_contact)

	contacts.sort(key=lambda x: (not x.get("is_primary"), (x.get("full_name") or "").lower(), x.get("name")))

	return {"customer": customer, "primary_contact": primary_contact, "contacts": contacts}


@frappe.whitelist()
def get_customer_transactions_ledger(customer: str, limit: int = 20):
	"""Return recent GL Entries for a Customer.

	This powers the Customer form's "Transactions Ledger" HTML panel.
	"""
	_assert_can_read_customer(customer)

	try:
		limit_int = int(limit)
	except Exception:
		limit_int = 20
	limit_int = max(1, min(limit_int, 200))

	if not frappe.has_permission("GL Entry", "read"):
		return {"customer": customer, "entries": []}

	entries_desc = frappe.get_all(
		"GL Entry",
		filters={
			"party_type": "Customer",
			"party": customer,
			"is_cancelled": 0,
		},
		fields=[
			"posting_date",
			"voucher_type",
			"voucher_no",
			"debit",
			"credit",
			"remarks",
		],
		order_by="posting_date desc, creation desc",
		limit=limit_int,
	)

	# Compute a running balance over the returned window.
	entries_asc = list(reversed(entries_desc))
	running = 0.0
	for e in entries_asc:
		debit = float(e.get("debit") or 0)
		credit = float(e.get("credit") or 0)
		running += debit - credit
		e["balance"] = running

	return {"customer": customer, "entries": list(reversed(entries_asc))}
