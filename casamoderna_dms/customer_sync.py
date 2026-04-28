from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import frappe


@dataclass(frozen=True)
class CaptureAddress:
	line1: str | None
	line2: str | None
	locality: str | None
	postcode: str | None
	country: str | None

	def is_all_blank(self) -> bool:
		return not any(
			(v or "").strip()
			for v in [
				self.line1,
				self.line2,
				self.locality,
				self.postcode,
				self.country,
			]
		)

	def has_minimum_for_new_address(self) -> bool:
		# Address requires line1 + city + country.
		return bool((self.line1 or "").strip() and (self.locality or "").strip() and (self.country or "").strip())


@frappe.whitelist()
def check_duplicate_customer(customer_name: str, mobile: str) -> dict:
	"""Return customers that clash on name or phone separately.

	Called from the Customer form client script before saving.
	Returns {"name_matches": [...], "phone_matches": [...]}
	"""
	name_q  = (customer_name or "").strip()
	mobile_q = (mobile or "").strip()

	name_matches: list[dict] = []
	phone_matches: list[dict] = []

	if name_q:
		name_matches = frappe.get_all(
			"Customer",
			filters={"customer_name": ["like", name_q]},
			fields=["name", "customer_name", "cm_mobile"],
			limit=10,
		)

	if mobile_q:
		phone_matches = frappe.get_all(
			"Customer",
			filters={"cm_mobile": mobile_q},
			fields=["name", "customer_name", "cm_mobile"],
			limit=10,
		)
		# Exclude records already found by name to avoid double-listing
		name_set = {r["name"] for r in name_matches}
		phone_matches = [r for r in phone_matches if r["name"] not in name_set]

	return {"name_matches": name_matches, "phone_matches": phone_matches}


def _assert_no_duplicate_customer(doc) -> None:
	"""Raise ValidationError if another Customer already has the same name or phone."""
	name_q  = (getattr(doc, "customer_name", None) or "").strip()
	mobile_q = (getattr(doc, "cm_mobile", None) or "").strip()

	# Exclude the current record on edits (doc.name is set after first save)
	exclude = getattr(doc, "name", None)

	if name_q:
		filters: dict = {"customer_name": ["like", name_q]}
		if exclude:
			filters["name"] = ["!=", exclude]
		clashes = frappe.get_all("Customer", filters=filters, pluck="name", limit=1)
		if clashes:
			frappe.throw(
				f"A customer named '{name_q}' already exists ({clashes[0]}). "
				"Duplicate customer names are not allowed.",
				frappe.ValidationError,
			)

	if mobile_q:
		filters = {"cm_mobile": mobile_q}
		if exclude:
			filters["name"] = ["!=", exclude]
		clashes = frappe.get_all(
			"Customer", filters=filters, fields=["name", "customer_name"], limit=1
		)
		if clashes:
			frappe.msgprint(
				f"Warning: phone number '{mobile_q}' is already registered to customer "
				f"'{clashes[0]['customer_name']}' ({clashes[0]['name']}).",
				title="Duplicate Phone Number",
				indicator="orange",
			)


def validate_customer_capture(doc, method=None):
	cm_mobile = (getattr(doc, "cm_mobile", None) or "").strip()
	if not cm_mobile:
		frappe.throw("Phone/Mobile is required.", frappe.ValidationError)

	_assert_no_duplicate_customer(doc)

	# Keep standard Customer fields in sync when empty (optional, non-destructive)
	if cm_mobile and not (getattr(doc, "mobile_no", None) or "").strip():
		doc.mobile_no = cm_mobile
	cm_email = (getattr(doc, "cm_email", None) or "").strip()
	if cm_email and not (getattr(doc, "email_id", None) or "").strip():
		doc.email_id = cm_email

	_apply_customer_locality_display(doc)


def sync_customer_related_records(doc, method=None):
	# Sync canonical doctypes after Customer is saved.
	sync_contact(doc)
	sync_address(doc, kind="Billing")
	sync_address(doc, kind="Shipping")
	sync_customer_locality_display(doc.name)


# Backwards-compatible names (in case anything referenced the earlier version)
validate_customer = validate_customer_capture
on_customer_update = sync_customer_related_records


def _get_linked_parent(parenttype: str, customer_name: str) -> Optional[str]:
	row = frappe.get_all(
		"Dynamic Link",
		filters={
			"parenttype": parenttype,
			"link_doctype": "Customer",
			"link_name": customer_name,
		},
		fields=["parent"],
		limit=1,
	)
	return row[0].parent if row else None


def sync_contact(customer):
	contact = _get_or_create_customer_contact(customer)

	cm_mobile = (getattr(customer, "cm_mobile", None) or "").strip()
	cm_email = (getattr(customer, "cm_email", None) or "").strip()

	# Non-destructive rules: only write when capture field has value.
	if cm_mobile:
		_set_if_field_exists(contact, "mobile_no", cm_mobile)
		_upsert_contact_phone(contact, phone=cm_mobile, as_mobile=True)

	if cm_email:
		_set_if_field_exists(contact, "email_id", cm_email)
		_upsert_contact_email(contact, email=cm_email)

	if contact.is_new():
		contact.insert(ignore_permissions=True)
	else:
		contact.save(ignore_permissions=True)

	# Link primary contact if empty
	if not getattr(customer, "customer_primary_contact", None):
		frappe.db.set_value("Customer", customer.name, "customer_primary_contact", contact.name, update_modified=False)


def _get_or_create_customer_contact(customer):
	linked = frappe.get_all(
		"Dynamic Link",
		filters={
			"parenttype": "Contact",
			"link_doctype": "Customer",
			"link_name": customer.name,
		},
		pluck="parent",
	)
	if linked:
		rows = frappe.get_all(
			"Contact",
			filters={"name": ["in", linked]},
			fields=["name", "is_primary_contact", "modified"],
			order_by="is_primary_contact desc, modified desc",
			limit=1,
		)
		if rows:
			return frappe.get_doc("Contact", rows[0].name)

	contact = frappe.new_doc("Contact")
	contact.first_name = (customer.customer_name or customer.name)[:140]
	contact.append(
		"links",
		{
			"link_doctype": "Customer",
			"link_name": customer.name,
		},
	)
	return contact


def _set_if_field_exists(doc, fieldname: str, value):
	meta = frappe.get_meta(doc.doctype)
	if meta.has_field(fieldname):
		setattr(doc, fieldname, value)


def _upsert_contact_email(contact, email: str):
	if not email:
		return

	for row in contact.get("email_ids") or []:
		if (row.email_id or "").strip().lower() == email.lower():
			row.is_primary = 1
			break
	else:
		contact.append("email_ids", {"email_id": email, "is_primary": 1})

	# Ensure only one primary
	primaries = [r for r in contact.get("email_ids") or [] if getattr(r, "is_primary", 0)]
	if primaries:
		keep = primaries[0]
		for r in contact.get("email_ids") or []:
			r.is_primary = 1 if r == keep else 0


def _upsert_contact_phone(contact, phone: str, *, as_mobile: bool):
	if not phone:
		return

	field_primary = "is_primary_mobile_no" if as_mobile else "is_primary_phone"

	for row in contact.get("phone_nos") or []:
		if (row.phone or "").strip() == phone:
			setattr(row, field_primary, 1)
			break
	else:
		row = {"phone": phone, field_primary: 1}
		contact.append("phone_nos", row)

	# Ensure only one primary for each type
	primaries = [r for r in contact.get("phone_nos") or [] if getattr(r, field_primary, 0)]
	if primaries:
		keep = primaries[0]
		for r in contact.get("phone_nos") or []:
			setattr(r, field_primary, 1 if r == keep else 0)

def sync_address(customer, *, kind: str):
	if kind not in {"Billing", "Shipping"}:
		raise ValueError("kind must be Billing or Shipping")

	if kind == "Billing":
		capture = CaptureAddress(
			line1=getattr(customer, "cm_bill_line1", None),
			line2=getattr(customer, "cm_bill_line2", None),
			locality=getattr(customer, "cm_bill_locality", None),
			postcode=getattr(customer, "cm_bill_postcode", None),
			country=getattr(customer, "cm_bill_country", None),
		)
		title_suffix = "Billing"
		primary_flag_field = "is_primary_address"
	else:
		capture = CaptureAddress(
			line1=getattr(customer, "cm_del_line1", None),
			line2=getattr(customer, "cm_del_line2", None),
			locality=getattr(customer, "cm_del_locality", None),
			postcode=getattr(customer, "cm_del_postcode", None),
			country=getattr(customer, "cm_del_country", None),
		)
		title_suffix = "Delivery"
		primary_flag_field = "is_shipping_address"

	address_name = _sync_one_address(
		customer,
		address_type=kind,
		title_suffix=title_suffix,
		capture=capture,
		primary_flag_field=primary_flag_field,
	)

	if kind == "Billing" and address_name and not getattr(customer, "customer_primary_address", None):
		frappe.db.set_value(
			"Customer",
			customer.name,
			"customer_primary_address",
			address_name,
			update_modified=False,
		)


def _sync_one_address(
	customer,
	*,
	address_type: str,
	title_suffix: str,
	capture: CaptureAddress,
	primary_flag_field: str,
) -> Optional[str]:
	if capture.is_all_blank():
		return None

	address_title = f"{customer.customer_name or customer.name} - {title_suffix}"[:140]

	address = _find_existing_address(customer.name, address_type=address_type, address_title=address_title)
	if not address:
		# For a new Address, required fields must be present; otherwise skip to avoid blocking Customer save.
		if not capture.has_minimum_for_new_address():
			return None
		address = frappe.new_doc("Address")
		address.address_title = address_title
		address.address_type = address_type
		address.append(
			"links",
			{
				"link_doctype": "Customer",
				"link_name": customer.name,
			},
		)

	meta = frappe.get_meta("Address")
	field_line1 = _pick_field(meta, ["address_line1"])
	field_line2 = _pick_field(meta, ["address_line2"])
	field_city = _pick_field(meta, ["city"])  # ERPNext v15 uses 'city'
	field_pincode = _pick_field(meta, ["pincode"])
	field_country = _pick_field(meta, ["country"])
	field_cm_locality = "cm_locality" if meta.has_field("cm_locality") else None

	# Non-destructive updates: only overwrite fields when capture value is provided.
	if (capture.line1 or "").strip():
		setattr(address, field_line1, capture.line1)
	if (capture.line2 or "").strip():
		setattr(address, field_line2, capture.line2)
	if (capture.locality or "").strip():
		setattr(address, field_city, capture.locality)
		if field_cm_locality and frappe.db.exists("CM Locality", capture.locality):
			setattr(address, field_cm_locality, capture.locality)
	if (capture.postcode or "").strip():
		setattr(address, field_pincode, capture.postcode)
	if (capture.country or "").strip():
		setattr(address, field_country, capture.country)

	# Keep title/type stable
	address.address_title = address_title
	address.address_type = address_type
	setattr(address, primary_flag_field, 1)

	if address.is_new():
		address.insert(ignore_permissions=True)
	else:
		address.save(ignore_permissions=True)

	return address.name


def _pick_field(meta, candidates: list[str]) -> str:
	for fieldname in candidates:
		if meta.has_field(fieldname):
			return fieldname
	raise frappe.ValidationError(f"Required field not found in {meta.name}: {candidates}")


def _find_existing_address(customer_name: str, *, address_type: str, address_title: str) -> Optional[object]:
	linked = frappe.get_all(
		"Dynamic Link",
		filters={
			"parenttype": "Address",
			"link_doctype": "Customer",
			"link_name": customer_name,
		},
		pluck="parent",
	)
	if not linked:
		return None

	candidates = frappe.get_all(
		"Address",
		filters={"name": ["in", linked], "address_type": address_type},
		fields=["name", "address_title"],
		order_by="modified desc",
	)
	if not candidates:
		return None

	# Prefer our stable title if present
	for row in candidates:
		if (row.address_title or "") == address_title:
			return frappe.get_doc("Address", row.name)

	return frappe.get_doc("Address", candidates[0].name)


def _get_primary_address_fieldname() -> str | None:
	meta = frappe.get_meta("Customer")
	if meta.has_field("customer_primary_address"):
		return "customer_primary_address"
	if meta.has_field("primary_address"):
		return "primary_address"
	return None


def _fallback_primary_address(customer_name: str) -> str | None:
	linked = frappe.get_all(
		"Dynamic Link",
		filters={
			"parenttype": "Address",
			"link_doctype": "Customer",
			"link_name": customer_name,
		},
		pluck="parent",
	)
	if not linked:
		return None

	rows = frappe.get_all(
		"Address",
		filters={"name": ["in", linked], "disabled": 0},
		fields=["name", "is_primary_address", "modified"],
		order_by="is_primary_address desc, modified desc",
		limit=1,
	)
	return rows[0].name if rows else None


def _resolve_primary_address_name(customer_doc) -> str | None:
	fieldname = _get_primary_address_fieldname()
	if fieldname:
		value = (getattr(customer_doc, fieldname, None) or "").strip()
		if value and frappe.db.exists("Address", value):
			return value

	return _fallback_primary_address(customer_doc.name)


def _apply_customer_locality_display(customer_doc) -> None:
	"""Set Customer.cm_locality_display from the selected primary Address.

	Runs during Customer validate; safe and non-blocking when fields are missing.
	"""
	try:
		customer_meta = frappe.get_meta("Customer")
		address_meta = frappe.get_meta("Address")
	except Exception:
		return

	if not customer_meta.has_field("cm_locality_display"):
		return
	if not address_meta.has_field("cm_locality"):
		return

	primary_address = _resolve_primary_address_name(customer_doc)
	if not primary_address:
		customer_doc.cm_locality_display = None
		return

	locality = frappe.db.get_value("Address", primary_address, "cm_locality")
	customer_doc.cm_locality_display = locality


def sync_customer_locality_display(customer_name: str) -> None:
	"""Refresh stored Customer.cm_locality_display for list-view.

	Used when the customer_primary_address is set/changed outside the validate hook.
	"""
	try:
		customer_meta = frappe.get_meta("Customer")
		address_meta = frappe.get_meta("Address")
	except Exception:
		return

	if not customer_meta.has_field("cm_locality_display"):
		return
	if not address_meta.has_field("cm_locality"):
		return

	fieldname = _get_primary_address_fieldname()
	primary_address = None
	if fieldname:
		primary_address = frappe.db.get_value("Customer", customer_name, fieldname)
		if primary_address and not frappe.db.exists("Address", primary_address):
			primary_address = None
	if not primary_address:
		primary_address = _fallback_primary_address(customer_name)

	locality = frappe.db.get_value("Address", primary_address, "cm_locality") if primary_address else None

	current = frappe.db.get_value("Customer", customer_name, "cm_locality_display")
	if str(current or "") != str(locality or ""):
		frappe.db.set_value(
			"Customer",
			customer_name,
			"cm_locality_display",
			locality,
			update_modified=False,
		)


def sync_customers_locality_from_address(doc, method=None) -> None:
	"""Keep Customer.cm_locality_display in sync when an Address changes."""
	try:
		customer_meta = frappe.get_meta("Customer")
		address_meta = frappe.get_meta("Address")
	except Exception:
		return

	if not customer_meta.has_field("cm_locality_display"):
		return
	if not address_meta.has_field("cm_locality"):
		return

	locality = getattr(doc, "cm_locality", None)
	meta = frappe.get_meta("Customer")

	if meta.has_field("customer_primary_address"):
		customers = frappe.get_all(
			"Customer",
			filters={"customer_primary_address": doc.name},
			pluck="name",
		)
		for customer_name in customers:
			frappe.db.set_value(
				"Customer",
				customer_name,
				"cm_locality_display",
				locality,
				update_modified=False,
			)
		return

	# If the site lacks a direct Link field to Address, fall back to checking linked customers.
	linked_customers = frappe.get_all(
		"Dynamic Link",
		filters={
			"parenttype": "Address",
			"parent": doc.name,
			"link_doctype": "Customer",
		},
		pluck="link_name",
	)
	for customer_name in linked_customers:
		# Only update when this Address is the resolved primary address.
		primary = _fallback_primary_address(customer_name)
		if primary == doc.name:
			frappe.db.set_value(
				"Customer",
				customer_name,
				"cm_locality_display",
				locality,
				update_modified=False,
			)
