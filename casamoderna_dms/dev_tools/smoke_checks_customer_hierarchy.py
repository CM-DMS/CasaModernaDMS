import frappe


def _pick_first(doctype: str) -> str | None:
	rows = frappe.get_all(doctype, fields=["name"], limit=1, order_by="modified desc")
	return rows[0].name if rows else None



def _make_min_customer(*, suffix: str, parent: str | None = None):
	meta = frappe.get_meta("Customer")
	reqd = [f.fieldname for f in meta.fields if getattr(f, "reqd", 0) and f.fieldname]

	customer = frappe.new_doc("Customer")
	customer.customer_name = f"SMOKE HIER {suffix}"[:140]
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

	if parent:
		customer.cm_parent_customer = parent

	customer.insert(ignore_permissions=True)
	return customer


def run(site: str | None = None):
	if site:
		frappe.init(site=site)
		frappe.connect()

	try:
		customer_meta = frappe.get_meta("Customer")
		assert customer_meta.has_field("cm_parent_customer"), "Expected Customer.cm_parent_customer to exist"
		assert customer_meta.has_field("cm_root_customer"), "Expected Customer.cm_root_customer to exist"
		assert customer_meta.has_field("cm_is_parent"), "Expected Customer.cm_is_parent to exist"

		suffix = frappe.utils.now_datetime().strftime("%Y%m%d-%H%M%S")

		print("== Customer Hierarchy: create parent ==")
		parent = _make_min_customer(suffix=f"P-{suffix}")
		parent.reload()
		assert parent.cm_root_customer == parent.name, "Expected parent root to be itself"

		print("== Customer Hierarchy: create child ==")
		child = _make_min_customer(suffix=f"C-{suffix}", parent=parent.name)
		child.reload()
		parent.reload()

		assert child.cm_parent_customer == parent.name, "Expected child.cm_parent_customer == parent"
		assert child.cm_root_customer == parent.name, "Expected child.cm_root_customer == parent"
		assert int(parent.cm_is_parent or 0) == 1, "Expected parent.cm_is_parent == 1"

		print("== Customer Hierarchy: cycle prevention ==")
		failed = False
		try:
			parent.cm_parent_customer = child.name
			parent.save(ignore_permissions=True)
		except Exception:
			failed = True
		assert failed, "Expected cycle detection when setting parent to a descendant"

		print("SMOKE OK — CUSTOMER HIERARCHY")
	finally:
		if site:
			frappe.destroy()
