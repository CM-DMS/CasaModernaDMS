import json

import frappe


def _pick_first(doctype: str) -> str | None:
	rows = frappe.get_all(doctype, fields=["name"], limit=1, order_by="modified desc")
	return rows[0].name if rows else None


def run(site: str | None = None):
	if site:
		frappe.init(site=site)
		frappe.connect()

	try:
		frappe.clear_cache(doctype="Customer")
		meta = frappe.get_meta("Customer")

		required_fields = [
			("cm_addresses_section", "Section Break", None),
			("cm_addr_col_left", "Column Break", None),
			("customer_primary_address", "Link", "Address"),
			("cm_bill_addr_preview", "HTML", None),
			("cm_addr_col_right", "Column Break", None),
			("shipping_address_name", "Link", "Address"),
			("cm_ship_addr_preview", "HTML", None),
			("cm_copy_billing_to_delivery", "Button", None),
		]

		# Capture dropdown localities (Customer screen)
		for fn in ("cm_bill_locality", "cm_del_locality"):
			df = meta.get_field(fn)
			assert df, f"Expected Customer.{fn} to exist"
			assert df.fieldtype == "Link", f"Expected Customer.{fn} to be Link"
			assert (df.options or "") == "CM Locality", f"Expected Customer.{fn} options=CM Locality"

		missing = []
		mismatched = []
		pos_map: dict[str, int] = {}
		for i, df in enumerate(meta.fields):
			if getattr(df, "fieldname", None):
				pos_map[df.fieldname] = i

		for fieldname, fieldtype, options in required_fields:
			df = meta.get_field(fieldname)
			if not df:
				missing.append(fieldname)
				continue
			if df.fieldtype != fieldtype:
				mismatched.append((fieldname, "fieldtype", df.fieldtype, fieldtype))
			if options is not None and (getattr(df, "options", None) or "") != options:
				mismatched.append((fieldname, "options", getattr(df, "options", None), options))

		assert not missing, f"Missing required Customer fields: {missing}"
		assert not mismatched, f"Mismatched field definitions: {mismatched}"

		ordered = [fn for fn, _, _ in required_fields]
		positions = [pos_map.get(fn, -1) for fn in ordered]
		assert all(p >= 0 for p in positions), f"Some required fields were not found in meta.fields sequence: {list(zip(ordered, positions))}"
		assert positions == sorted(positions), f"Expected left-to-right order in meta.fields; got: {list(zip(ordered, positions))}"

		# Ensure the old width-based approach is not present in DB
		width_present = bool(
			frappe.get_all(
				"Property Setter",
				filters={"doc_type": "Customer", "field_name": "cm_delivery_capture_section", "property": "width"},
				limit=1,
			)
		)
		assert not width_present, "Found disallowed Property Setter: Customer.cm_delivery_capture_section width"

		# Ensure helper script references the new button field + previews (deterministic tokens)
		helper = frappe.get_doc("Client Script", "Customer - CasaModerna Capture Helpers")
		assert int(getattr(helper, "enabled", 0) or 0) == 1, "Expected Customer - CasaModerna Capture Helpers to be enabled"
		script = helper.script or ""
		for token in [
			"cm_copy_billing_to_delivery",
			"cm_bill_addr_preview",
			"cm_ship_addr_preview",
			"Copy Billing",
			"frappe.call",
			"casamoderna_dms.address_tools.copy_customer_billing_to_delivery",
			"cm_bill_locality",
			"cm_del_locality",
			"frm.set_query('cm_bill_locality'",
			"frm.set_query('cm_del_locality'",
			"casamoderna_dms.cm_locality_query.cm_locality_link_query",
		]:
			assert token in script, f"Expected helper client script to reference: {token}"

		print("== Customer Addresses Layout: copy action updates link fields ==")
		cust = frappe.new_doc("Customer")
		suffix = frappe.utils.now_datetime().strftime("%Y%m%d-%H%M%S")
		cust.customer_name = f"SMOKE ADDR LAYOUT {suffix}"
		if meta.has_field("cm_mobile"):
			cust.cm_mobile = "+356 9999 0000"

		# Only set customer_type when required.
		reqd = [f.fieldname for f in meta.fields if getattr(f, "reqd", 0) and f.fieldname]
		if "customer_type" in reqd and not getattr(cust, "customer_type", None):
			options = [o.strip() for o in (meta.get_field("customer_type").options or "").split("\n") if o.strip()]
			cust.customer_type = "Individual" if "Individual" in options else (options[0] if options else "Individual")

		# Satisfy any other required fields deterministically.
		for df in meta.fields:
			if not getattr(df, "reqd", 0) or not df.fieldname:
				continue
			if df.fieldname in ("customer_name", "customer_type", "cm_mobile"):
				continue
			if getattr(cust, df.fieldname, None):
				continue
			if df.fieldtype == "Link" and df.options:
				value = _pick_first(df.options)
				assert value, f"No records found for required Link {df.fieldname} -> {df.options}"
				setattr(cust, df.fieldname, value)
			elif df.fieldtype == "Select":
				options = [o.strip() for o in (df.options or "").split("\n") if o.strip()]
				assert options, f"No options for required Select {df.fieldname}"
				setattr(cust, df.fieldname, options[0])

		cust.insert(ignore_permissions=True)

		billing_title = f"{cust.customer_name} - Billing"[:140]
		addr = frappe.new_doc("Address")
		addr.address_title = billing_title
		addr.address_type = "Billing"
		addr.address_line1 = "1 Smoke Street"
		addr.city = "Valletta"
		addr.pincode = "VLT 0001"
		addr.country = "Malta"
		addr.append("links", {"link_doctype": "Customer", "link_name": cust.name})
		addr.insert(ignore_permissions=True)

		from casamoderna_dms.address_tools import copy_customer_billing_to_delivery

		res = copy_customer_billing_to_delivery(cust.name)
		shipping = (res or {}).get("shipping_address")
		assert shipping, "Expected copy_customer_billing_to_delivery to return shipping_address"

		cust.reload()
		assert cust.customer_primary_address == addr.name, "Expected customer_primary_address to backfill to Billing Address"
		assert cust.shipping_address_name == shipping, "Expected shipping_address_name to be set to returned shipping_address"

		print("Copy action updates link fields: YES")

		print("== Customer Addresses Layout: summary ==")
		print("Fields present: YES")
		print("Field order (meta.fields) increasing: YES")
		print("Delivery link field: shipping_address_name (Link -> Address)")
		print("Width property setter present: NO")
		print("Preview renderer tokens present: YES")
		print("Copy button field wired: YES")
		print("SMOKE OK — CUSTOMER ADDRESSES LAYOUT")

	finally:
		pass
