import frappe


def run(site: str | None = None):
	"""Deterministic smoke checks for the Sales Console slice."""
	if site:
		frappe.init(site=site)
		frappe.connect()

	try:
		print("== Sales Console: Workspace presence ==")
		ws = frappe.get_doc("Workspace", "Sales Console")
		print("Workspace:", ws.name, "module=", ws.module, "public=", ws.public)
		print("Shortcuts:", [s.label for s in (ws.shortcuts or [])])
		print("Quick Lists:", [q.label for q in (ws.quick_lists or [])])

		assert any(s.label == "New Quotation" for s in (ws.shortcuts or []))
		assert any(s.label == "New Sales Order" for s in (ws.shortcuts or []))
		assert any(q.label == "Draft Quotations" for q in (ws.quick_lists or []))

		print("== Sales Console: Derived-only validations ==")
		from casamoderna_dms.sales_console import (
			validate_derived_only_delivery_note,
			validate_derived_only_sales_invoice,
		)

		# Delivery Note: should block when no upstream references exist.
		dn = frappe.new_doc("Delivery Note")
		dn.items = [frappe._dict({"item_code": "_"})]
		blocked = False
		try:
			validate_derived_only_delivery_note(dn)
		except frappe.ValidationError as e:
			blocked = True
			print("Blocked DN direct create (expected):", str(e))
		assert blocked

		# Delivery Note: should allow when a reference exists.
		dn2 = frappe.new_doc("Delivery Note")
		dn2.items = [frappe._dict({"item_code": "_", "against_sales_order": "SO-TEST"})]
		validate_derived_only_delivery_note(dn2)
		print("Allowed DN derived create (expected)")

		# Sales Invoice: should block when no upstream references exist.
		si = frappe.new_doc("Sales Invoice")
		si.items = [frappe._dict({"item_code": "_"})]
		blocked = False
		try:
			validate_derived_only_sales_invoice(si)
		except frappe.ValidationError as e:
			blocked = True
			print("Blocked SI direct create (expected):", str(e))
		assert blocked

		# Sales Invoice: should allow when a Sales Order reference exists.
		si2 = frappe.new_doc("Sales Invoice")
		si2.items = [frappe._dict({"item_code": "_", "sales_order": "SO-TEST"})]
		validate_derived_only_sales_invoice(si2)
		print("Allowed SI derived create (expected)")

		# Credit Note: must have return_against.
		si3 = frappe.new_doc("Sales Invoice")
		si3.is_return = 1
		blocked = False
		try:
			validate_derived_only_sales_invoice(si3)
		except frappe.ValidationError as e:
			blocked = True
			print("Blocked Credit Note without return_against (expected):", str(e))
		assert blocked

		si4 = frappe.new_doc("Sales Invoice")
		si4.is_return = 1
		si4.return_against = "SINV-TEST"
		validate_derived_only_sales_invoice(si4)
		print("Allowed Credit Note with return_against (expected)")

		print("\nOK: Sales Console smoke checks passed")
	finally:
		if site:
			frappe.destroy()
