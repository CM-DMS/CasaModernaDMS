import json

import frappe


def _assert_property_setter(name: str, expected: dict):
	ps = frappe.get_doc("Property Setter", name)
	for key, value in expected.items():
		actual = getattr(ps, key)
		assert str(actual) == str(value), f"{name}.{key}: {actual} != {value}"
	return name


def _pick_first(doctype: str) -> str | None:
	rows = frappe.get_all(doctype, fields=["name"], limit=1, order_by="modified desc")
	return rows[0].name if rows else None


def _get_primary_address_fieldname() -> str | None:
	meta = frappe.get_meta("Customer")
	if meta.has_field("customer_primary_address"):
		return "customer_primary_address"
	if meta.has_field("primary_address"):
		return "primary_address"
	return None


def _is_client_script_enabled(doc) -> bool:
	meta = frappe.get_meta("Client Script")
	if meta.has_field("enabled"):
		return int(getattr(doc, "enabled", 0) or 0) == 1
	if meta.has_field("is_enabled"):
		return int(getattr(doc, "is_enabled", 0) or 0) == 1
	# Defensive fallback (should not happen on standard Frappe)
	return int(getattr(doc, "enabled", 0) or getattr(doc, "is_enabled", 0) or 0) == 1


def _get_sales_roles_to_check() -> list[str]:
	base = ["Sales User", "CasaModerna Sales Console"]
	rows = frappe.get_all(
		"Role",
		filters={"name": ["like", "CasaModerna%"]},
		fields=["name"],
		order_by="name asc",
	)
	additional = [r.name for r in rows if "sales" in (r.name or "").lower()]
	roles = []
	for r in base + additional:
		if r and r not in roles:
			roles.append(r)
	return roles


def run(site: str | None = None):
	if site:
		frappe.init(site=site)
		frappe.connect()

	try:
		client_script_enabled_summary = None
		noise_fields_summary = None
		sales_roles_summary = None

		meta = frappe.get_meta("Customer")
		reqd = [f.fieldname for f in meta.fields if getattr(f, "reqd", 0) and f.fieldname]
		print("== Customer UX: meta required fields ==")
		print(json.dumps(reqd, indent=2, sort_keys=True))

		# Canonical phone is confirmed as cm_mobile in this environment.
		assert meta.get_field("cm_mobile"), "Expected Customer.cm_mobile to exist"
		assert meta.get_field("cm_locality_display"), "Expected Customer.cm_locality_display to exist"

		assert frappe.db.exists("DocType", "CM Locality"), "Expected DocType CM Locality to exist"
		address_meta = frappe.get_meta("Address")
		assert address_meta.get_field("cm_locality"), "Expected Address.cm_locality to exist"

		primary_address_field = _get_primary_address_fieldname()
		if primary_address_field:
			assert meta.has_field(primary_address_field), f"Expected Customer.{primary_address_field} to exist"
			print(f"== Customer UX: primary address field == {primary_address_field}")
		else:
			print("== Customer UX: primary address field == (none; using linked-address fallback)")

		print("== Customer UX: property setters ==")
		_assert_property_setter(
			"Customer-cm_mobile-label",
			{"doc_type": "Customer", "field_name": "cm_mobile", "property": "label", "value": "Phone/Mobile"},
		)
		_assert_property_setter(
			"Customer-cm_mobile-reqd",
			{"doc_type": "Customer", "field_name": "cm_mobile", "property": "reqd", "value": "1"},
		)
		_assert_property_setter(
			"Customer-cm_mobile-in_list_view",
			{"doc_type": "Customer", "field_name": "cm_mobile", "property": "in_list_view", "value": "1"},
		)
		_assert_property_setter(
			"Customer-cm_locality_display-in_list_view",
			{"doc_type": "Customer", "field_name": "cm_locality_display", "property": "in_list_view", "value": "1"},
		)
		_assert_property_setter(
			"Address-country-default",
			{"doc_type": "Address", "field_name": "country", "property": "default", "value": "Malta"},
		)
		print("OK property setters")

		print("== Customer UX: client script present ==")
		cs = frappe.get_doc("Client Script", "Customer - CasaModerna Minimal View")
		assert getattr(cs, "dt", None) == "Customer", "Expected Client Script dt=Customer"
		assert _is_client_script_enabled(cs), "Expected Client Script to be enabled"
		script = cs.script or ""
		assert script.strip(), "Expected Client Script to have non-empty script"

		required_noise_fields = [
			"territory",
			"lead_name",
			"opportunity_name",
			"prospect_name",
			"account_manager",
			"default_currency",
			"default_bank_account",
			"default_price_list",
		]
		missing_noise = [f for f in required_noise_fields if f not in script]
		assert not missing_noise, f"Missing noise fieldnames in client script: {missing_noise}"

		sales_roles = _get_sales_roles_to_check()
		missing_roles = [r for r in sales_roles if r not in script]
		assert not missing_roles, f"Missing Sales role gating tokens in client script: {missing_roles}"

		client_script_enabled_summary = "YES" if _is_client_script_enabled(cs) else "NO"
		noise_fields_summary = "ALL" if not missing_noise else "MISSING"
		sales_roles_summary = "YES" if not missing_roles else "NO"

		print("== Customer UX: capture helper button calls server method ==")
		helper = frappe.get_doc("Client Script", "Customer - CasaModerna Capture Helpers")
		helper_script = helper.script or ""
		assert "Copy Billing" in helper_script
		assert "frappe.call" in helper_script
		assert "casamoderna_dms.address_tools.copy_customer_billing_to_delivery" in helper_script
		print("OK capture helper")

		print("== Customer UX: Address Sales UX client script ==")
		addr_cs = frappe.get_doc("Client Script", "Address - CasaModerna Sales UX")
		assert addr_cs.enabled == 1
		addr_script = addr_cs.script or ""
		for token in ["Sales User", "CasaModerna Sales Console", "cm_locality", "reqd"]:
			assert token in addr_script, f"Expected Address client script to reference {token}"
		print("OK address script")

		print("== Customer UX: insert minimal customer ==")
		customer = frappe.new_doc("Customer")
		suffix = frappe.utils.now_datetime().strftime("%Y%m%d-%H%M%S")
		customer.customer_name = f"SMOKE UX {suffix}"
		customer.cm_mobile = "+356 9999 0000"

		# Only set customer_type when required.
		if "customer_type" in reqd and not getattr(customer, "customer_type", None):
			options = [o.strip() for o in (meta.get_field("customer_type").options or "").split("\n") if o.strip()]
			customer.customer_type = "Individual" if "Individual" in options else (options[0] if options else "Individual")

		# Satisfy any other required fields deterministically.
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
		print("Created Customer:", customer.name)

		print("== Customer UX: locality sync via primary address ==")
		suffix_loc = frappe.utils.now_datetime().strftime("%Y%m%d-%H%M%S")
		loc1 = frappe.new_doc("CM Locality")
		loc1.locality_name = f"SMOKE LOC {suffix_loc}"
		loc1.insert(ignore_permissions=True)

		addr = frappe.new_doc("Address")
		addr.address_title = f"SMOKE ADDR {suffix_loc}"[:140]
		addr.address_type = "Shipping"
		addr.address_line1 = "1 Smoke Street"
		addr.city = "Valletta"
		addr.country = "Malta"
		addr.cm_locality = loc1.name
		if address_meta.has_field("is_primary_address"):
			addr.is_primary_address = 1
		addr.append("links", {"link_doctype": "Customer", "link_name": customer.name})
		addr.insert(ignore_permissions=True)

		if primary_address_field:
			setattr(customer, primary_address_field, addr.name)
			customer.save(ignore_permissions=True)

		# Ensure the derived field is refreshed deterministically.
		from casamoderna_dms.customer_sync import sync_customer_locality_display

		sync_customer_locality_display(customer.name)
		customer.reload()
		assert customer.cm_locality_display == loc1.name, "Expected Customer.cm_locality_display to match primary Address"

		loc2 = frappe.new_doc("CM Locality")
		loc2.locality_name = f"SMOKE LOC 2 {suffix_loc}"
		loc2.insert(ignore_permissions=True)
		addr.reload()
		addr.cm_locality = loc2.name
		addr.save(ignore_permissions=True, ignore_version=True)
		sync_customer_locality_display(customer.name)
		customer.reload()
		assert customer.cm_locality_display == loc2.name, "Expected Customer.cm_locality_display to update when Address changes"
		print("OK locality sync")

		print("Client Script enabled:", client_script_enabled_summary)
		print("Noise fields covered:", noise_fields_summary)
		print("Sales roles covered:", sales_roles_summary)

		print("SMOKE OK — CUSTOMER UX")
	finally:
		if site:
			frappe.destroy()
