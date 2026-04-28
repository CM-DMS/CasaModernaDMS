import frappe


def _pick_first(doctype: str) -> str | None:
	rows = frappe.get_all(doctype, fields=["name"], limit=1, order_by="modified desc")
	return rows[0].name if rows else None


def _make_min_customer(*, suffix: str):
	meta = frappe.get_meta("Customer")
	reqd = [f.fieldname for f in meta.fields if getattr(f, "reqd", 0) and f.fieldname]

	customer = frappe.new_doc("Customer")
	customer.customer_name = f"SMOKE V1 LAYOUT {suffix}"[:140]
	if meta.get_field("cm_mobile"):
		customer.cm_mobile = "+356 9999 0000"

	if "customer_type" in reqd and not getattr(customer, "customer_type", None):
		options = [o.strip() for o in (meta.get_field("customer_type").options or "").split("\n") if o.strip()]
		customer.customer_type = "Individual" if "Individual" in options else (options[0] if options else "Individual")

	for df in meta.fields:
		if not getattr(df, "reqd", 0) or not df.fieldname:
			continue
		if df.fieldname in ("customer_name", "cm_mobile", "customer_type"):
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
	return customer


def run(site: str | None = None):
	if site:
		frappe.init(site=site)
		frappe.connect()

	try:
		meta = frappe.get_meta("Customer")
		for f in [
			"cm_contact_persons_panel",
			"cm_financial_section",
			"cm_financial_column_break",
			"cm_transactions_ledger_panel",
		]:
			assert meta.has_field(f), f"Expected Customer.{f} to exist"

		for header_fieldname in ("cm_bill_capture_header", "cm_delivery_capture_header"):
			df_header = meta.get_field(header_fieldname)
			assert df_header, f"Expected Customer.{header_fieldname} to exist"
			assert df_header.fieldtype == "HTML", f"Expected {header_fieldname} to be HTML"

		helper_name = "Customer - CasaModerna Capture Helpers"
		assert frappe.db.exists("Client Script", helper_name), f"Expected {helper_name} client script to exist"
		helper = frappe.get_doc("Client Script", helper_name)
		assert int(getattr(helper, "enabled", 0) or 0) == 1, f"Expected {helper_name} to be enabled"
		script = helper.script or ""
		for token in [
			"CM_UNINDENT_HTML_FIELD",
			"CM_UNINDENT_HTML_FIELD(frm,'cm_bill_capture_header')",
			"CM_UNINDENT_HTML_FIELD(frm,'cm_delivery_capture_header')",
		]:
			assert token in script, f"Expected capture helper client script to include token: {token}"

		df = meta.get_field("cm_delivery_capture_section")
		assert df, "Expected Customer.cm_delivery_capture_section to exist"
		assert df.fieldtype == "Column Break", "Expected cm_delivery_capture_section to be a Column Break"

		cs_name = "Customer - CasaModerna V1 Panels"
		assert frappe.db.exists("Client Script", cs_name), "Expected V1 panels client script to exist"
		cs = frappe.get_doc("Client Script", cs_name)
		assert int(cs.enabled) == 1, "Expected V1 panels client script to be enabled"

		suffix = frappe.utils.now_datetime().strftime("%Y%m%d-%H%M%S")
		customer = _make_min_customer(suffix=suffix)
		customer.reload()

		contacts = frappe.call(
			"casamoderna_dms.customer_profile_panels.get_customer_contact_persons",
			customer=customer.name,
		)
		assert isinstance(contacts, dict), "Expected contacts payload to be a dict"
		assert contacts.get("customer") == customer.name
		assert isinstance(contacts.get("contacts"), list), "Expected contacts list"
		assert len(contacts.get("contacts")) >= 1, "Expected at least one linked Contact"

		ledger = frappe.call(
			"casamoderna_dms.customer_profile_panels.get_customer_transactions_ledger",
			customer=customer.name,
			limit=5,
		)
		assert isinstance(ledger, dict), "Expected ledger payload to be a dict"
		assert ledger.get("customer") == customer.name
		assert isinstance(ledger.get("entries"), list), "Expected ledger entries list"

		print("SMOKE OK — CUSTOMER V1 LAYOUT")
	finally:
		if site:
			frappe.destroy()
