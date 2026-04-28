import json

import frappe


def _field_summary(df) -> dict:
	return {
		"fieldname": df.fieldname,
		"label": df.label,
		"fieldtype": df.fieldtype,
		"reqd": int(getattr(df, "reqd", 0) or 0),
		"hidden": int(getattr(df, "hidden", 0) or 0),
		"options": getattr(df, "options", None),
	}


def inspect_customer_fields():
	"""Print the Customer DocType fieldnames we might act on.

	This is meant for deterministic, no-guessing inspection on a live site.
	"""
	meta = frappe.get_meta("Customer")
	fields = meta.fields
	all_fieldnames = [df.fieldname for df in fields if df.fieldname]

	print("== Customer Meta: Required fields ==")
	reqd = [f.fieldname for f in fields if getattr(f, "reqd", 0) and f.fieldname]
	print(json.dumps(reqd, indent=2, sort_keys=True))

	print("== Customer Meta: Phone-ish fields present ==")
	phoneish = [
		"cm_mobile",
		"mobile_no",
		"mobile",
		"phone",
		"phone_no",
		"phone_1",
		"phone_2",
		"telephone",
	]
	present_phoneish = [f.fieldname for f in fields if f.fieldname in phoneish]
	print(json.dumps(present_phoneish, indent=2, sort_keys=True))

	# Canonical phone field selection (deterministic): prefer our capture field if present.
	canonical_phone_fieldname = None
	if meta.get_field("cm_mobile"):
		canonical_phone_fieldname = "cm_mobile"
	elif meta.get_field("mobile_no"):
		canonical_phone_fieldname = "mobile_no"

	print("== Customer Meta: canonical_phone_fieldname ==")
	print(json.dumps(canonical_phone_fieldname))

	mobile_no_df = meta.get_field("mobile_no")
	if mobile_no_df:
		print("== Customer Meta: mobile_no summary ==")
		print(json.dumps(_field_summary(mobile_no_df), indent=2))

	print("== Customer Meta: Candidate noise fields present ==")
	candidates = [
		"territory",
		"gender",
		"lead_name",
		"opportunity_name",
		"prospect_name",
		"account_manager",
		"customer_group",
		"customer_type",
		"default_currency",
		"default_bank_account",
		"default_price_list",
		"default_payment_terms_template",
		"default_receivable_account",
		"default_sales_partner",
		"default_commission_rate",
	]
	# Also include our capture-only fields that Sales minimal view should hide.
	capture_noise = [
		"cm_email",
		"cm_id_card_no",
		"cm_vat_no",
		"cm_bill_line1",
		"cm_bill_line2",
		"cm_bill_locality",
		"cm_bill_postcode",
		"cm_bill_country",
		"cm_del_line1",
		"cm_del_line2",
		"cm_del_locality",
		"cm_del_postcode",
		"cm_del_country",
		"email_id",
		"first_name",
		"last_name",
	]
	noise_candidates = candidates + capture_noise
	present_noise = [f for f in noise_candidates if f in all_fieldnames]
	print(json.dumps(present_noise, indent=2, sort_keys=True))

	print("== Customer Meta: Minimal-keep candidates present ==")
	minimal = [
		"customer_name",
		"cm_mobile",
		"customer_primary_contact",
		"customer_primary_address",
		"primary_contact",
		"primary_address",
		"notes",
		"customer_notes",
		"internal_notes",
		"cm_internal_notes",
	]
	present_minimal = [f.fieldname for f in fields if f.fieldname in minimal]
	print(json.dumps(present_minimal, indent=2, sort_keys=True))

	print("== Customer Meta: Key field summaries ==")
	key_fields = [
		"customer_name",
		"customer_type",
		"cm_mobile",
		"mobile_no",
		"customer_primary_address",
		"primary_address",
		"customer_primary_contact",
		"cm_internal_notes",
	]
	key_summary = []
	for fieldname in key_fields:
		df = meta.get_field(fieldname)
		if df:
			key_summary.append(_field_summary(df))
	print(json.dumps(key_summary, indent=2))

	print("== Customer Meta: All fieldnames ==")
	print(json.dumps(all_fieldnames, indent=2))

	return {
		"canonical_phone_fieldname": canonical_phone_fieldname,
		"all_fieldnames": all_fieldnames,
		"required": reqd,
		"present_phoneish": present_phoneish,
		"present_noise": present_noise,
		"present_minimal": present_minimal,
		"field_count": len(fields),
	}
