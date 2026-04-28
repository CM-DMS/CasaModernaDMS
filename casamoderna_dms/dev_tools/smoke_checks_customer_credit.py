import frappe


def _pick_first(doctype: str) -> str | None:
	rows = frappe.get_all(doctype, fields=["name"], limit=1, order_by="modified desc")
	return rows[0].name if rows else None


def _make_min_customer(*, suffix: str):
	meta = frappe.get_meta("Customer")
	reqd = [f.fieldname for f in meta.fields if getattr(f, "reqd", 0) and f.fieldname]

	customer = frappe.new_doc("Customer")
	customer.customer_name = f"SMOKE CREDIT {suffix}"[:140]
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
		for f in ["cm_credit_limit", "cm_credit_terms_days", "cm_balance", "cm_family_balance"]:
			assert meta.has_field(f), f"Expected Customer.{f} to exist"

		suffix = frappe.utils.now_datetime().strftime("%Y%m%d-%H%M%S")
		customer = _make_min_customer(suffix=suffix)
		customer.reload()

		# Reject invalid terms (e.g., 45)
		failed = False
		try:
			customer.cm_credit_terms_days = "45"
			customer.save(ignore_permissions=True)
		except Exception:
			failed = True
		assert failed, "Expected invalid credit terms (45) to be rejected"

		# Role-based enforcement: an unauthorized actor must not be able to change credit terms/limit.
		# We use the built-in Guest user to avoid creating User records (this site has Server Scripts disabled).
		original_user = frappe.session.user
		try:
			frappe.set_user("Guest")
			customer.reload()
			blocked_terms = False
			try:
				customer.cm_credit_terms_days = "30"
				customer.save(ignore_permissions=True)
			except Exception:
				blocked_terms = True
			assert blocked_terms, "Expected Sales user to be blocked from changing Credit Terms (Days)"

			customer.reload()
			blocked_limit = False
			try:
				customer.cm_credit_limit = 123
				customer.save(ignore_permissions=True)
			except Exception:
				blocked_limit = True
			assert blocked_limit, "Expected Sales user to be blocked from changing Credit Limit"
		finally:
			frappe.set_user(original_user)

		# Ensure balances are numeric and do not crash
		customer.reload()
		assert customer.cm_balance is None or isinstance(customer.cm_balance, (int, float)), "cm_balance must be numeric"
		assert customer.cm_family_balance is None or isinstance(customer.cm_family_balance, (int, float)), "cm_family_balance must be numeric"

		print("SMOKE OK — CUSTOMER CREDIT")
	finally:
		if site:
			frappe.destroy()
