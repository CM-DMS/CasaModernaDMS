from __future__ import annotations

from datetime import datetime

import frappe
from frappe.utils import add_days, flt, today


def run():
	"""Smoke checks for Customer A / Customer B split on Quotation and Sales Order."""
	frappe.set_user("Administrator")

	company = _pick_one("Company")
	customer_group = _pick_one("Customer Group", filters={"is_group": 0})
	territory = _pick_one("Territory", filters={"is_group": 0})
	item_code = _get_or_create_test_item()
	warehouse = _pick_one("Warehouse", filters={"is_group": 0})

	customer_a = _get_or_create_customer("Test Customer A", customer_group, territory)
	customer_b = _get_or_create_customer("Test Customer B", customer_group, territory)

	# Check 1: Quotation no split
	qtn = frappe.get_doc(
		{
			"doctype": "Quotation",
			"quotation_to": "Customer",
			"party_name": customer_a,
			"company": company,
			"transaction_date": today(),
			"valid_till": add_days(today(), 7),
			"items": [
				{
					"item_code": item_code,
					"qty": 1,
					"rate": 200,
				}
			],
		}
	)
	_finalize(qtn)
	qtn.reload()

	total = flt(qtn.grand_total)
	print("1) Quotation no split:", qtn.name)
	print("   total(grand_total):", total)
	print("   cm_customer_a_amount:", flt(qtn.cm_customer_a_amount))
	print("   cm_customer_b_amount:", flt(qtn.cm_customer_b_amount or 0))
	assert flt(qtn.cm_customer_b_amount or 0) == 0
	assert flt(qtn.cm_customer_a_amount) == total

	# Check 2: Quotation with split
	qtn.cm_customer_b = customer_b
	qtn.cm_customer_b_amount = 100
	qtn.save()
	qtn.reload()
	print("2) Quotation with split:", qtn.name)
	print("   total(grand_total):", flt(qtn.grand_total))
	print("   cm_customer_b:", qtn.cm_customer_b)
	print("   cm_customer_b_amount:", flt(qtn.cm_customer_b_amount))
	print("   cm_customer_a_amount:", flt(qtn.cm_customer_a_amount))
	assert flt(qtn.cm_customer_a_amount) == flt(qtn.grand_total) - 100

	# Check 3: Validation — B amount > total
	try:
		qtn.cm_customer_b_amount = flt(qtn.grand_total) + 1
		qtn.save()
		raise AssertionError("Expected ValidationError but save succeeded")
	except Exception as e:
		msg = str(e)
		print("3) Validation caught:", msg)
		assert "Customer B Amount cannot exceed document total." in msg

	# Check 4: Sales Order with split
	sales_order = frappe.get_doc(
		{
			"doctype": "Sales Order",
			"customer": customer_a,
			"company": company,
			"transaction_date": today(),
			"delivery_date": add_days(today(), 7),
			"set_warehouse": warehouse,
			"items": [
				{
					"item_code": item_code,
					"qty": 1,
					"rate": 150,
					"warehouse": warehouse,
				}
			],
			"cm_customer_b": customer_b,
			"cm_customer_b_amount": 50,
		}
	)
	_finalize(sales_order)
	sales_order.reload()
	print("4) Sales Order with split:", sales_order.name)
	print("   total(grand_total):", flt(sales_order.grand_total))
	print("   cm_customer_b:", sales_order.cm_customer_b)
	print("   cm_customer_b_amount:", flt(sales_order.cm_customer_b_amount))
	print("   cm_customer_a_amount:", flt(sales_order.cm_customer_a_amount))
	assert flt(sales_order.cm_customer_a_amount) == flt(sales_order.grand_total) - 50

	# Check 5: Print Format presence
	pf_so = "CasaModerna Sales Order"
	pf_qtn = "CasaModerna Quotation"
	so_exists = frappe.db.exists("Print Format", pf_so)
	qtn_exists = frappe.db.exists("Print Format", pf_qtn)
	print("5) Print Format exists Sales Order:", bool(so_exists), pf_so)
	print("   Print Format exists Quotation:", bool(qtn_exists), pf_qtn)
	assert so_exists and qtn_exists
	so_pf = frappe.get_doc("Print Format", pf_so)
	qtn_pf = frappe.get_doc("Print Format", pf_qtn)
	print("   Sales Order Print Format disabled:", int(so_pf.disabled))
	print("   Quotation Print Format disabled:", int(qtn_pf.disabled))
	assert int(so_pf.disabled) == 0
	assert int(qtn_pf.disabled) == 0

	print("DONE")


def _finalize(doc):
	# Set missing values and compute totals deterministically.
	if hasattr(doc, "set_missing_values"):
		doc.set_missing_values()
	if hasattr(doc, "calculate_taxes_and_totals"):
		doc.calculate_taxes_and_totals()
	if doc.is_new():
		doc.insert(ignore_permissions=True)
	else:
		doc.save(ignore_permissions=True)


def _pick_one(doctype: str, filters: dict | None = None) -> str:
	name = frappe.get_all(doctype, filters=filters or {}, pluck="name", limit=1)
	if not name:
		frappe.throw(f"No {doctype} found to run smoke checks")
	return name[0]


def _get_or_create_customer(customer_name: str, customer_group: str, territory: str) -> str:
	existing = frappe.get_all("Customer", filters={"customer_name": customer_name}, pluck="name", limit=1)
	if existing:
		return existing[0]

	cust = frappe.get_doc(
		{
			"doctype": "Customer",
			"customer_name": customer_name,
			"customer_type": "Individual",
			"customer_group": customer_group,
			"territory": territory,
			"cm_mobile": "+356 9999 9999",
		}
	).insert(ignore_permissions=True)
	return cust.name


def _get_or_create_test_item() -> str:
	item_code = "CM-SPLIT-ITEM"
	if frappe.db.exists("Item", item_code):
		return item_code

	item_group = _pick_one("Item Group", filters={"is_group": 0})
	uom = _pick_one("UOM")
	item = frappe.get_doc(
		{
			"doctype": "Item",
			"item_code": item_code,
			"item_name": "CM Split Test Item",
			"item_group": item_group,
			"stock_uom": uom,
			"is_stock_item": 0,
			"is_sales_item": 1,
			"is_purchase_item": 0,
		}
	).insert(ignore_permissions=True)
	return item.name
