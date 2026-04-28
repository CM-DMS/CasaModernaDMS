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
	"""Slice 018: Sales Docs Totals + Bottom Panel V1-Parity (Pass 1).

	Scope (UI/meta only):
	- Ensure core totals fields remain visible: net_total, total_taxes_and_charges, grand_total.
	- Hide remaining noisy totals surfaces where present (tax breakup inputs + additional discount inputs
	  + duplicate computed totals fields).
	
	Forbidden (explicitly not done):
	- No changes to calculation logic, VAT logic, deposit logic, workflows, numbering, print formats, or permissions.
	"""
	frappe.set_user("Administrator")

	ensure_visible = ["net_total", "total_taxes_and_charges", "grand_total"]

	# Hide advanced/noisy UI blocks (keep backend correctness).
	# These are safe to keep invisible for day-to-day sales entry in CasaModerna flow.
	hide_fields = [
		# Tax breakup inputs (VAT is surfaced via total_taxes_and_charges)
		"taxes_and_charges",
		"taxes",
		# Duplicate totals/computed fields not needed on the working surface
		"total",
		# Additional discount inputs (keep pricing engine + CM logic unchanged)
		"apply_discount_on",
		"additional_discount_percentage",
		"discount_amount",
		"coupon_code",
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

		for fn in hide_fields:
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
	frappe.logger("casamoderna_dms").info({"slice": "018", "patch": __name__, "results": results})
