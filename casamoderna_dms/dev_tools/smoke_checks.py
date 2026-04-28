from __future__ import annotations

from datetime import datetime

import frappe


def run():
	"""Creates a test Customer and verifies Contact/Address sync.

	This is intended for evidence during implementation; it is not used by runtime hooks.
	"""
	frappe.set_user("Administrator")

	now = datetime.now().strftime("%Y%m%d-%H%M%S")
	customer_name = f"John Doe {now}"

	customer_group = _pick_one("Customer Group", filters={"is_group": 0})
	territory = _pick_one("Territory", filters={"is_group": 0})

	# 1) Create Customer with Mobile only
	customer = frappe.get_doc(
		{
			"doctype": "Customer",
			"customer_name": customer_name,
			"customer_type": "Individual",
			"customer_group": customer_group,
			"territory": territory,
			"cm_mobile": "+356 9999 9999",
		}
	).insert()

	customer.reload()
	contact = _get_linked_doc("Contact", customer.name)
	print("1) Customer created:", customer.name)
	print("   Linked Contact:", contact.name if contact else None)
	if not contact:
		frappe.throw("Smoke check failed: no Contact linked to Customer")
	if contact:
		print("   Contact mobile_no:", contact.mobile_no)

	# 2) Add billing capture and save
	customer.cm_bill_line1 = "123 Test Street"
	customer.cm_bill_locality = "Valletta"
	customer.cm_bill_country = "Malta"
	customer.save()

	bill_addr = _get_linked_address(customer.name, address_type="Billing")
	print("2) Billing Address:", bill_addr.name if bill_addr else None)
	if not bill_addr:
		frappe.throw("Smoke check failed: no Billing Address linked to Customer")
	if bill_addr:
		print("   Billing line1/city/country:", bill_addr.address_line1, bill_addr.city, bill_addr.country)

	# 3) Add delivery capture and save
	customer.cm_del_line1 = "Warehouse 5"
	customer.cm_del_locality = "Mosta"
	customer.cm_del_country = "Malta"
	customer.save()

	ship_addr = _get_linked_address(customer.name, address_type="Shipping")
	print("3) Delivery(Shipping) Address:", ship_addr.name if ship_addr else None)
	if not ship_addr:
		frappe.throw("Smoke check failed: no Shipping Address linked to Customer")
	if ship_addr:
		print("   Shipping line1/city/country:", ship_addr.address_line1, ship_addr.city, ship_addr.country)

	# 4) Blank capture fields and ensure we don't overwrite existing address fields with blanks
	before_bill_line1 = bill_addr.address_line1 if bill_addr else None
	before_ship_line1 = ship_addr.address_line1 if ship_addr else None
	customer.cm_bill_line1 = ""
	customer.cm_bill_line2 = ""
	customer.cm_bill_locality = ""
	customer.cm_bill_postcode = ""
	customer.cm_del_line1 = ""
	customer.cm_del_line2 = ""
	customer.cm_del_locality = ""
	customer.cm_del_postcode = ""
	# leave country as-is (often defaulted)
	customer.save()

	bill_addr_after = frappe.get_doc("Address", bill_addr.name) if bill_addr else None
	ship_addr_after = frappe.get_doc("Address", ship_addr.name) if ship_addr else None
	after_bill_line1 = bill_addr_after.address_line1 if bill_addr_after else None
	after_ship_line1 = ship_addr_after.address_line1 if ship_addr_after else None
	print("4) Non-destructive update (billing line1):", before_bill_line1, "->", after_bill_line1)
	print("   Non-destructive update (shipping line1):", before_ship_line1, "->", after_ship_line1)

	# 5) Client script fixture presence
	cs_name = "Customer - CasaModerna Capture Helpers"
	exists = frappe.db.exists("Client Script", cs_name)
	print("5) Client Script exists:", bool(exists))
	if not exists:
		frappe.throw("Smoke check failed: Client Script fixture not found")
	if exists:
		cs = frappe.get_doc("Client Script", cs_name)
		print("   Client Script enabled:", int(cs.enabled))
		if not cs.enabled:
			frappe.throw("Smoke check failed: Client Script exists but is disabled")

	print("DONE")


def _pick_one(doctype: str, filters: dict | None = None) -> str:
	name = frappe.get_all(doctype, filters=filters or {}, pluck="name", limit=1)
	if not name:
		frappe.throw(f"No {doctype} found to run smoke checks")
	return name[0]


def _get_linked_doc(parenttype: str, customer_name: str):
	parents = frappe.get_all(
		"Dynamic Link",
		filters={
			"parenttype": parenttype,
			"link_doctype": "Customer",
			"link_name": customer_name,
		},
		pluck="parent",
		limit=1,
	)
	if not parents:
		return None
	return frappe.get_doc(parenttype, parents[0])


def _get_linked_address(customer_name: str, *, address_type: str):
	parents = frappe.get_all(
		"Dynamic Link",
		filters={
			"parenttype": "Address",
			"link_doctype": "Customer",
			"link_name": customer_name,
		},
		pluck="parent",
	)
	if not parents:
		return None

	rows = frappe.get_all(
		"Address",
		filters={"name": ["in", parents], "address_type": address_type},
		pluck="name",
		limit=1,
	)
	if not rows:
		return None
	return frappe.get_doc("Address", rows[0])
