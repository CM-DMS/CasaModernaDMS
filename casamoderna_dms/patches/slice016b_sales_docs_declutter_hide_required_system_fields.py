from __future__ import annotations

import frappe


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


def _hide_if_present(dt: str, fieldname: str) -> None:
	meta = frappe.get_meta(dt)
	if not meta.get_field(fieldname):
		return
	_upsert_docfield_prop(dt, fieldname, "hidden", "Check", 1)


def execute():
	"""Slice 016b: Declutter follow-up — hide required-but-system fields.

	Slice 016 intentionally skipped hiding `reqd=1` fields to avoid breaking docs.
	In ERPNext, some high-noise fields are marked required but are system-computed
	(or not used in CasaModerna flow) and safe to hide.

	This patch hides a small allowlist of such fields.
	"""
	frappe.set_user("Administrator")

	# Multi-currency fields are required in core, but unused in CasaModerna flow.
	for dt in ["Quotation", "Sales Order", "Delivery Note", "Sales Invoice", "POS Invoice"]:
		_hide_if_present(dt, "conversion_rate")
		_hide_if_present(dt, "plc_conversion_rate")

	# Posting time is required on Delivery Note but normally system-set.
	_hide_if_present("Delivery Note", "posting_time")

	# Base totals are required on some doctypes (read-only computed).
	_hide_if_present("Sales Invoice", "base_grand_total")
	_hide_if_present("POS Invoice", "base_grand_total")

	frappe.clear_cache()
