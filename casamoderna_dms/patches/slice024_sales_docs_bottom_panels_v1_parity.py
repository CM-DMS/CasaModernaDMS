from __future__ import annotations

import frappe


TARGET_DOCTYPES = [
	"Quotation",
	"Sales Order",
	"Delivery Note",
	"Sales Invoice",
	"POS Invoice",
	"CM Proforma",
]


def _upsert_docfield_prop(dt: str, fieldname: str, prop: str, prop_type: str, value) -> None:
	name = f"{dt}-{fieldname}-{prop}"
	if frappe.db.exists("Property Setter", name):
		ps = frappe.get_doc("Property Setter", name)
		ps.value = str(value)
		ps.property_type = prop_type
		ps.save(ignore_permissions=True)
		return

	ps = frappe.new_doc("Property Setter")
	ps.doctype_or_field = "DocField"
	ps.doc_type = dt
	ps.field_name = fieldname
	ps.property = prop
	ps.property_type = prop_type
	ps.value = str(value)
	ps.insert(ignore_permissions=True)


def execute() -> None:
	"""Slice 024: Bottom Panels V1-Parity (Attachments left, Totals right, Deposit where applicable).

	Context:
	- The visual bottom panel composition is rendered by the shared Sales Docs shell
	  (`/assets/casamoderna_dms/js/cm_sales_doc_shell.js`).
	- Slice 018 already enforced the compact totals stack (net_total / VAT / grand_total)
	  and the QT/SO deposit/payment-terms area.

	This slice is a strict UI/meta refinement:
	- Hide remaining duplicate/noisy totals fields still visible in the default working surface
	  (based on deterministic meta audit), without changing any backend calculations.

	Forbidden (explicitly not done):
	- No pricing/tax/VAT/rounding/deposit math changes.
	- No conversions/workflow/numbering/print format changes.
	- No permissions/DocPerm changes.
	"""
	frappe.set_user("Administrator")

	# Keep the user-facing totals fields visible (the shell reads these).
	ensure_visible = ["net_total", "total_taxes_and_charges", "grand_total"]

	# Remaining clutter to remove from the default UI surface.
	# - rounded_total is not part of the preferred V1 stack.
	# - base_* totals are multi-currency duplicates; keep for backend correctness but hide on working surface.
	hide_fields_common = [
		"rounded_total",
		"base_net_total",
		"base_total_taxes_and_charges",
		"base_grand_total",
		"base_rounded_total",
	]

	results = []
	for dt in TARGET_DOCTYPES:
		meta = frappe.get_meta(dt)
		changed = []

		for fn in ensure_visible:
			if not meta.has_field(fn):
				continue
			df = meta.get_field(fn)
			if int(getattr(df, "hidden", 0) or 0) != 0:
				_upsert_docfield_prop(dt, fn, "hidden", "Check", 0)
				changed.append({"fieldname": fn, "property": "hidden", "value": 0})

		for fn in hide_fields_common:
			if not meta.has_field(fn):
				continue
			if fn.startswith("cm_"):
				continue
			df = meta.get_field(fn)
			if int(getattr(df, "hidden", 0) or 0) != 1:
				_upsert_docfield_prop(dt, fn, "hidden", "Check", 1)
				changed.append({"fieldname": fn, "property": "hidden", "value": 1})

		results.append({"doctype": dt, "changed": changed})

	frappe.clear_cache()
	frappe.logger("casamoderna_dms").info({"slice": "024", "patch": __name__, "results": results})
