"""One-time patch: create the 'CasaModerna Credit Manager' Frappe Role.

This role is assigned (via the ERPNext admin UI) to the single user who is
authorised to grant credit lines to customers (currently jason.falzon).
The role is referenced by customer_credit.py – no code should hard-code
a username.
"""
import frappe


def execute():
	role_name = "CasaModerna Credit Manager"
	if not frappe.db.exists("Role", role_name):
		role = frappe.new_doc("Role")
		role.role_name = role_name
		role.desk_access = 0
		role.save(ignore_permissions=True)
		frappe.db.commit()
		print(f"Created role: {role_name}")
	else:
		print(f"Role already exists: {role_name}")
