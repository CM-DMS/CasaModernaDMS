import frappe


def _ensure_locality(name: str) -> str:
	if frappe.db.exists("CM Locality", name):
		return name
	doc = frappe.new_doc("CM Locality")
	doc.locality_name = name
	doc.insert(ignore_permissions=True)
	return doc.name


def _get_customer_link(address_doc) -> str | None:
	for row in address_doc.get("links") or []:
		if row.link_doctype == "Customer":
			return row.link_name
	return None


def run(site: str | None = None):
	if site:
		frappe.init(site=site)
		frappe.connect()

	try:
		assert frappe.db.exists("DocType", "CM Locality"), "Expected CM Locality DocType"
		assert frappe.get_meta("Address").has_field("cm_locality"), "Expected Address.cm_locality"

		suffix = frappe.utils.now_datetime().strftime("%Y%m%d-%H%M%S")
		customer = frappe.new_doc("Customer")
		customer.customer_name = f"SMOKE UX COPY {suffix}"
		customer.cm_mobile = "+356 9999 1111"

		# Customer Type is required in this environment.
		customer.customer_type = "Individual"
		customer.insert(ignore_permissions=True)

		loc = _ensure_locality(f"SMOKE COPY LOC {suffix}")

		billing_title = f"{customer.customer_name or customer.name} - Billing"[:140]
		billing = frappe.new_doc("Address")
		billing.address_title = billing_title
		billing.address_type = "Billing"
		billing.address_line1 = "1 Billing Street"
		billing.address_line2 = "Apt 2"
		billing.city = "Valletta"
		billing.pincode = "VLT 1000"
		billing.country = "Malta"
		billing.cm_locality = loc
		billing.append("links", {"link_doctype": "Customer", "link_name": customer.name})
		billing.insert(ignore_permissions=True)

		from casamoderna_dms.address_tools import copy_customer_billing_to_delivery

		result = copy_customer_billing_to_delivery(customer.name)
		shipping_name = result.get("shipping_address")
		assert shipping_name, "Expected shipping_address in result"

		shipping = frappe.get_doc("Address", shipping_name)
		assert shipping.address_type == "Shipping"
		assert _get_customer_link(shipping) == customer.name, "Expected Shipping Address linked to Customer"

		for fieldname in [
			"address_line1",
			"address_line2",
			"city",
			"pincode",
			"country",
			"cm_locality",
		]:
			if frappe.get_meta("Address").has_field(fieldname):
				assert getattr(shipping, fieldname) == getattr(billing, fieldname), f"Mismatch for {fieldname}"

		print("SMOKE OK — CUSTOMER UX COPY")
	finally:
		if site:
			frappe.destroy()
