from __future__ import annotations

import frappe

from casamoderna_dms.customer_sync import _find_existing_address


def _has_any_role(roles: set[str]) -> bool:
	user_roles = set(frappe.get_roles() or [])
	return bool(user_roles.intersection(roles))


def _require_sales_context() -> None:
	# Keep this aligned with role-gated client scripts.
	if frappe.session.user == "Administrator":
		return
	if _has_any_role({"System Manager", "CM Director", "CM Admin", "CM Sales Manager", "CM Office Admin", "CM Sales"}):
		return
	raise frappe.PermissionError


def _ensure_customer_link(address_doc, customer_name: str) -> None:
	for row in address_doc.get("links") or []:
		if row.link_doctype == "Customer" and row.link_name == customer_name:
			return
	address_doc.append(
		"links",
		{
			"link_doctype": "Customer",
			"link_name": customer_name,
		},
	)


@frappe.whitelist()
def copy_customer_billing_to_delivery(customer: str) -> dict:
	"""Copy real Address fields from Billing -> Delivery (Shipping).

	This updates/creates the linked Shipping Address record, rather than only copying
	Customer capture fields.
	"""
	_require_sales_context()

	cust = frappe.get_doc("Customer", customer)
	customer_name = cust.name

	billing_title = f"{cust.customer_name or cust.name} - Billing"[:140]
	delivery_title = f"{cust.customer_name or cust.name} - Delivery"[:140]

	billing = _find_existing_address(customer_name, address_type="Billing", address_title=billing_title)
	if not billing:
		frappe.throw(
			"No Billing Address found for this Customer. Please capture the billing address first.",
			frappe.ValidationError,
		)

	shipping = _find_existing_address(customer_name, address_type="Shipping", address_title=delivery_title)
	if not shipping:
		shipping = frappe.new_doc("Address")
		shipping.address_title = delivery_title
		shipping.address_type = "Shipping"
		_ensure_customer_link(shipping, customer_name)

	address_meta = frappe.get_meta("Address")
	copy_fields = [
		"address_line1",
		"address_line2",
		"city",
		"pincode",
		"country",
		"state",
		"county",
		"email_id",
		"phone",
		"fax",
		"cm_locality",
	]

	for fieldname in copy_fields:
		if address_meta.has_field(fieldname):
			setattr(shipping, fieldname, getattr(billing, fieldname, None))

	# Keep title/type stable
	shipping.address_title = delivery_title
	shipping.address_type = "Shipping"
	if address_meta.has_field("is_shipping_address"):
		shipping.is_shipping_address = 1
	if address_meta.has_field("is_primary_address"):
		shipping.is_primary_address = 0

	if shipping.is_new():
		shipping.insert(ignore_permissions=True)
	else:
		shipping.save(ignore_permissions=True)

	# Keep the Customer form link fields aligned with the Address records.
	cust_meta = frappe.get_meta("Customer")
	changed = False
	if cust_meta.has_field("customer_primary_address") and not getattr(cust, "customer_primary_address", None):
		cust.customer_primary_address = billing.name
		changed = True
	if cust_meta.has_field("shipping_address_name") and getattr(cust, "shipping_address_name", None) != shipping.name:
		cust.shipping_address_name = shipping.name
		changed = True
	if changed:
		cust.save(ignore_permissions=True)

	# Ensure list-view locality column stays up-to-date
	from casamoderna_dms.customer_sync import sync_customer_locality_display

	sync_customer_locality_display(customer_name)

	return {"shipping_address": shipping.name}
