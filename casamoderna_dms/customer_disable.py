"""customer_disable.py — Role-gated customer disable/enable.

Only holders of the 'CasaModerna Customer Admin' role (or System Manager /
Administrator) may toggle the ``disabled`` flag on a Customer record.

Hooks registered in hooks.py:
  Customer.validate → validate_customer_disabled
"""
from __future__ import annotations

import frappe

CUSTOMER_ADMIN_ROLE = "CasaModerna Customer Admin"


def _can_disable_customers(user: str | None = None) -> bool:
	user = user or frappe.session.user
	if user in ("Administrator",):
		return True
	user_roles: set[str] = set(frappe.get_roles(user) or [])
	return CUSTOMER_ADMIN_ROLE in user_roles or "System Manager" in user_roles


def validate_customer_disabled(doc, method=None) -> None:
	"""Customer.validate hook — guard the disabled field.

	On new documents the field is always 0, so no check needed.
	On existing documents, check if the value changed and reject the save
	if the current user lacks the required role.
	"""
	if doc.is_new() or not getattr(doc, "name", None):
		return

	old_disabled = int(doc.get_db_value("disabled") or 0)
	new_disabled = int(getattr(doc, "disabled", 0) or 0)

	if old_disabled == new_disabled:
		return

	if not _can_disable_customers():
		frappe.throw(
			"Only Customer Admins may enable or disable a customer account.",
			frappe.PermissionError,
		)


@frappe.whitelist()
def set_customer_disabled(customer: str, disabled: bool | int) -> dict:
	"""Toggle the disabled flag on a Customer.

	Called from the Customer form button. Only permitted for
	'CasaModerna Customer Admin' or 'System Manager'.
	"""
	if not _can_disable_customers():
		frappe.throw(
			"Only Customer Admins may enable or disable a customer account.",
			frappe.PermissionError,
		)

	disabled_int = 1 if disabled else 0
	doc = frappe.get_doc("Customer", customer)
	doc.disabled = disabled_int
	doc.save(ignore_permissions=True)
	frappe.db.commit()

	state = "disabled" if disabled_int else "enabled"
	return {"customer": customer, "disabled": disabled_int, "message": f"Customer {state}."}


@frappe.whitelist()
def can_disable_customers() -> bool:
	"""Front-end permission probe: returns True if the current user may toggle disabled."""
	return _can_disable_customers()
