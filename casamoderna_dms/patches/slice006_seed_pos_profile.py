import frappe


def _pick_first(doctype, *, filters=None, fields=None, order_by=None):
	filters = filters or {}
	fields = fields or ["name"]
	row = frappe.get_all(doctype, filters=filters, fields=fields, order_by=order_by, limit=1)
	return row[0] if row else None


def ensure_minimal_pos_profile(*, commit=False):
	"""Create a minimal POS Profile for cash sales if none exist.

	Why: ERPNext POS Invoice requires POS Profile (and typically POS Opening Entry)
	to validate/submit. Slice 006 needs an ERPNext-first cash sale path without
	weakening existing Sales Invoice guardrails.

	Idempotent: if any POS Profile exists, this is a no-op.
	"""
	if frappe.get_all("POS Profile", fields=["name"], limit=1):
		return

	company = frappe.db.get_single_value("Global Defaults", "default_company")
	if not company:
		# Bench may not have global defaults, fall back to first company.
		row = _pick_first("Company", order_by="creation asc")
		company = row.name if row else None
	if not company:
		return

	currency = frappe.db.get_value("Company", company, "default_currency") or "EUR"

	warehouse_row = (
		_pick_first("Warehouse", filters={"is_group": 0, "disabled": 0}, order_by="creation asc")
		or _pick_first("Warehouse", filters={"is_group": 0}, order_by="creation asc")
	)
	warehouse = warehouse_row.name if warehouse_row else None

	cost_center_row = (
		_pick_first("Cost Center", filters={"is_group": 0, "disabled": 0, "company": company}, order_by="creation asc")
		or _pick_first("Cost Center", filters={"is_group": 0, "company": company}, order_by="creation asc")
		or _pick_first("Cost Center", filters={"is_group": 0}, order_by="creation asc")
	)
	write_off_cost_center = cost_center_row.name if cost_center_row else None

	write_off_account = (
		frappe.db.exists("Account", {"name": "Administrative Expenses - CM"})
		or frappe.db.exists("Account", {"name": "Administrative Expenses"})
		or frappe.db.exists("Account", {"name": "Expenses - CM"})
	)
	if not write_off_account:
		account_row = _pick_first(
			"Account",
			filters={"company": company, "is_group": 0, "root_type": "Expense", "disabled": 0},
			order_by="creation asc",
		)
		write_off_account = account_row.name if account_row else None

	if not (warehouse and write_off_cost_center and write_off_account):
		# Don't create a half-baked POS profile.
		return

	mode_of_payment = frappe.db.exists("Mode of Payment", "Cash")
	if not mode_of_payment:
		# Keep strict: POS cash sale requires Cash MOP.
		return

	profile = frappe.new_doc("POS Profile")
	profile.company = company
	profile.currency = currency
	profile.warehouse = warehouse
	profile.write_off_account = write_off_account
	profile.write_off_cost_center = write_off_cost_center
	profile.write_off_limit = 0
	profile.append("payments", {"mode_of_payment": "Cash", "default": 1})

	# Deterministic naming (helps proofs / future debugging)
	profile.name = "CasaModerna POS"
	profile.insert(ignore_permissions=True)

	if commit:
		frappe.db.commit()


def execute():
	ensure_minimal_pos_profile(commit=True)
