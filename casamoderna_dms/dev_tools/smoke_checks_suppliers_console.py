from __future__ import annotations

import json

import frappe


def run():
	"""Deterministic smoke checks for the Suppliers Console baseline.

	Scope:
	- Workspace exists and is role-gated
	- Roles exist
	- Supplier list/search is usable (list columns + CM list filters)

	This is implementation evidence only; not used by runtime hooks.
	"""
	frappe.set_user("Administrator")

	created_docs: list[tuple[str, str]] = []
	try:
		print("== Suppliers Console: Role presence ==")
		role_name = "CasaModerna Suppliers Console"
		maintainer_role = "CasaModerna Supplier Maintainer"
		for r in [role_name, maintainer_role]:
			if not frappe.db.exists("Role", r):
				frappe.throw(f"Smoke check failed: Role missing: {r}")
			print("Role:", r)

		print("== Suppliers Console: Workspace presence ==")
		ws_name = "Suppliers Console"
		ws = frappe.get_doc("Workspace", ws_name)
		print("Workspace:", ws.name, "module=", ws.module, "public=", int(ws.public))

		roles = {r.role for r in (ws.roles or [])}
		print("Workspace roles:", sorted(roles))
		if role_name not in roles:
			frappe.throw(f"Smoke check failed: Workspace not gated by role: {role_name}")

		print("== Suppliers Console: Shortcut sanity ==")
		shortcut_labels = [s.label for s in (ws.shortcuts or [])]
		print("Shortcut labels:", shortcut_labels)
		expected = ["Suppliers", "New Supplier", "Supplier Groups"]
		if shortcut_labels[:3] != expected:
			frappe.throw(f"Smoke check failed: Suppliers Console shortcuts should start with: {expected}")

		print("== Suppliers Console: CM Supplier list filters ==")
		for name in ["CM Active Suppliers", "CM Inactive Suppliers"]:
			if not frappe.db.exists("List Filter", name):
				frappe.throw(f"Smoke check failed: List Filter missing: {name}")
			doc = frappe.get_doc("List Filter", name)
			if doc.reference_doctype != "Supplier":
				frappe.throw(f"Smoke check failed: List Filter doctype mismatch: {name} -> {doc.reference_doctype}")
			print("List Filter:", doc.name)

		print("== Suppliers Console: Supplier list-view columns ==")
		# Property Setters (kept for deterministic export and parity with other consoles)
		for ps_name in [
			"Supplier-supplier_name-in_list_view",
			"Supplier-supplier_type-in_list_view",
			"Supplier-on_hold-in_list_view",
			"Supplier-disabled-in_list_view",
		]:
			if not frappe.db.exists("Property Setter", ps_name):
				frappe.throw(f"Smoke check failed: Property Setter missing: {ps_name}")
			ps = frappe.get_doc("Property Setter", ps_name)
			actual = (ps.value or "").strip()
			print(ps.name, "->", actual)
			if actual != "1":
				frappe.throw(f"Smoke check failed: {ps.name} value mismatch: {actual} != 1")

		# List View Settings (ensures supplier code/name are both visible)
		if not frappe.db.exists("List View Settings", "Supplier"):
			frappe.throw("Smoke check failed: List View Settings missing: Supplier")
		lvs = frappe.get_doc("List View Settings", "Supplier")
		fields = []
		try:
			fields = json.loads(lvs.fields or "[]")
		except Exception:
			fields = []
		print("List View Settings fields:", fields)
		needed = {"name", "supplier_name", "supplier_group", "supplier_type", "on_hold", "disabled"}
		if not needed.issubset(set(fields)):
			frappe.throw(
				f"Smoke check failed: Supplier List View Settings missing fields: {sorted(needed - set(fields))}"
			)

		print("== Supplier Profile: Helper Client Script presence ==")
		profile_cs = "Supplier - CasaModerna Profile"
		if not frappe.db.exists("Client Script", profile_cs):
			frappe.throw(f"Smoke check failed: Client Script missing: {profile_cs}")
		print("Client Script:", profile_cs)

		print("== Supplier Profile: Create linked docs (Contact/Address/Bank/File) ==")
		supplier = frappe.get_doc(
			{
				"doctype": "Supplier",
				"supplier_name": f"CM Smoke Supplier {frappe.generate_hash(length=6)}",
				"supplier_type": "Company",
				"naming_series": "SUP-.YYYY.-",
			}
		)
		supplier.insert(ignore_permissions=True)
		created_docs.append(("Supplier", supplier.name))
		print("Supplier:", supplier.name)

		contact = frappe.get_doc(
			{
				"doctype": "Contact",
				"first_name": "CM Smoke",
				"last_name": "Supplier Contact",
				"links": [{"link_doctype": "Supplier", "link_name": supplier.name}],
			}
		)
		contact.insert(ignore_permissions=True)
		created_docs.append(("Contact", contact.name))
		print("Contact:", contact.name)

		country = "Ireland" if frappe.db.exists("Country", "Ireland") else None
		if not country:
			countries = frappe.get_all("Country", pluck="name", limit=1)
			country = (countries or [None])[0]
		if not country:
			frappe.throw("Smoke check failed: No Country records available")

		address = frappe.get_doc(
			{
				"doctype": "Address",
				"address_title": supplier.supplier_name,
				"address_type": "Billing",
				"address_line1": "CM Smoke Line 1",
				"city": "Dublin",
				"country": country,
				"links": [{"link_doctype": "Supplier", "link_name": supplier.name}],
			}
		)
		address.insert(ignore_permissions=True)
		created_docs.append(("Address", address.name))
		print("Address:", address.name)

		supplier.db_set("supplier_primary_contact", contact.name)
		supplier.db_set("supplier_primary_address", address.name)

		banks = frappe.get_all("Bank", pluck="name", limit=1)
		bank_name = (banks or [None])[0]
		bank_created = False
		if not bank_name:
			bank = frappe.get_doc({"doctype": "Bank", "bank_name": f"CM Smoke Bank {frappe.generate_hash(length=6)}"})
			bank.insert(ignore_permissions=True)
			created_docs.append(("Bank", bank.name))
			bank_created = True
			bank_name = bank.name
		print("Bank:", bank_name, "(created=", int(bank_created), ")")

		bank_account = frappe.get_doc(
			{
				"doctype": "Bank Account",
				"account_name": f"{supplier.supplier_name} - Supplier",
				"bank": bank_name,
				"party_type": "Supplier",
				"party": supplier.name,
			}
		)
		bank_account.insert(ignore_permissions=True)
		created_docs.append(("Bank Account", bank_account.name))
		print("Bank Account:", bank_account.name)

		file_doc = frappe.get_doc(
			{
				"doctype": "File",
				"file_name": "cm_supplier_smoke.txt",
				"attached_to_doctype": "Supplier",
				"attached_to_name": supplier.name,
				"content": "cm smoke",
				"is_private": 1,
			}
		)
		file_doc.save(ignore_permissions=True)
		created_docs.append(("File", file_doc.name))
		print("File:", file_doc.name)
	finally:
		# Cleanup: avoid polluting production.
		frappe.set_user("Administrator")
		for dt, name in reversed(created_docs):
			try:
				if frappe.db.exists(dt, name):
					frappe.delete_doc(dt, name, ignore_permissions=True, force=True)
			except Exception:
				pass
