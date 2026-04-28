import json

import frappe

from casamoderna_dms.customer_ui import inspect_customer_fields


def _get_field(meta, fieldname: str):
	return meta.get_field(fieldname)


def _assert_property_setter(doc_type: str, field_name: str, prop: str, expected_value: str):
	name = frappe.db.get_value(
		"Property Setter",
		{"doctype_or_field": "DocField", "doc_type": doc_type, "field_name": field_name, "property": prop},
	)
	assert name, f"Missing Property Setter for {doc_type}.{field_name} {prop}"
	value = frappe.db.get_value("Property Setter", name, "value")
	assert str(value) == str(expected_value), f"Property Setter mismatch for {name}: {value} != {expected_value}"
	return name


def _pick_first(doctype: str) -> str | None:
	rows = frappe.get_all(doctype, fields=["name"], limit=1, order_by="modified desc")
	return rows[0].name if rows else None


def run(site: str | None = None):
	if site:
		frappe.init(site=site)
		frappe.connect()

	try:
		meta = frappe.get_meta("Customer")
		info = inspect_customer_fields()
		canonical = info.get("canonical_phone_fieldname")
		assert canonical, "No canonical phone field found (expected one of: cm_mobile, mobile_no)"
		assert _get_field(meta, canonical), f"Canonical phone field missing on meta: {canonical}"

		print("== Customer Minimal: canonical phone field ==")
		print(json.dumps(canonical))

		print("== Customer Minimal: meta required fields ==")
		reqd = info.get("required") or [f.fieldname for f in meta.fields if getattr(f, "reqd", 0) and f.fieldname]
		print(json.dumps(reqd, indent=2, sort_keys=True))

		# Property setters are expected only for our custom capture field.
		if canonical == "cm_mobile":
			print("== Customer Minimal: property setters for cm_mobile ==")
			ps_label = _assert_property_setter("Customer", "cm_mobile", "label", "Phone/Mobile")
			ps_reqd = _assert_property_setter("Customer", "cm_mobile", "reqd", "1")
			ps_list = _assert_property_setter("Customer", "cm_mobile", "in_list_view", "1")
			print("OK property setters:", ps_label, ps_reqd, ps_list)

		print("== Customer Minimal: client script present ==")
		cs = frappe.get_doc("Client Script", "Customer - CasaModerna Minimal View")
		assert cs.enabled == 1
		assert "Sales User" in (cs.script or "")
		assert "CasaModerna Sales Console" in (cs.script or "")
		for token in [
			"territory",
			"gender",
			"lead_name",
			"opportunity_name",
			"prospect_name",
			"default_currency",
			"default_price_list",
			"default_bank_account",
			"mobile_no",
			"cm_bill_line1",
			"cm_del_line1",
		]:
			assert token in (cs.script or ""), f"Expected client script to reference {token}"
		print("OK client script enabled")

		print("== Customer Minimal: create customer with minimal fields ==")
		customer = frappe.new_doc("Customer")
		suffix = frappe.utils.now_datetime().strftime("%Y%m%d-%H%M%S")
		customer.customer_name = f"SMOKE Minimal {suffix}"
		setattr(customer, canonical, "+356 9999 0000")

		# Satisfy any required standard link/select fields deterministically.
		for df in meta.fields:
			if not getattr(df, "reqd", 0) or not df.fieldname:
				continue
			if df.fieldname in ("customer_name", canonical):
				continue
			if getattr(customer, df.fieldname, None):
				continue

			if df.fieldtype == "Link" and df.options:
				value = _pick_first(df.options)
				assert value, f"No records found for required Link {df.fieldname} -> {df.options}"
				setattr(customer, df.fieldname, value)
			elif df.fieldtype == "Select":
				options = [o.strip() for o in (df.options or "").split("\n") if o.strip()]
				assert options, f"No options for required Select {df.fieldname}"
				setattr(customer, df.fieldname, options[0])

		customer.insert(ignore_permissions=True)
		print("Created Customer:", customer.name)

		print("SMOKE OK — CUSTOMER MINIMAL")
	finally:
		if site:
			frappe.destroy()
