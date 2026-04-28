from __future__ import annotations

import frappe


ALLOWED_TERMS_DAYS = {"0", "30", "60", "90", "180", "365"}
CREDIT_MANAGER_ROLE = "CasaModerna Credit Manager"


def _has_customer_credit_fields() -> bool:
	meta = frappe.get_meta("Customer")
	return meta.has_field("cm_credit_limit") and meta.has_field("cm_credit_terms_days")


def _can_grant_credit(user: str) -> bool:
	"""Return True if *user* is permitted to set credit limits and terms.

	Permission is granted to anyone holding the 'CasaModerna Credit Manager'
	role or the 'System Manager' role.  The frontend enforces the same rule
	through the 'canGrantCredit' permission group.
	"""
	user_roles: set[str] = set(frappe.get_roles(user) or [])
	return CREDIT_MANAGER_ROLE in user_roles or "System Manager" in user_roles


def validate_customer_credit(doc, method=None) -> None:
	"""Customer.validate hook for credit terms validation and role-based server enforcement."""
	if not _has_customer_credit_fields():
		return

	# Terms must be from the V1 evidence list.
	terms = (getattr(doc, "cm_credit_terms_days", None) or "0").strip()
	if terms and terms not in ALLOWED_TERMS_DAYS:
		frappe.throw(
			"Credit Terms (Days) must be one of: 0, 30, 60, 90, 180, 365.",
			frappe.ValidationError,
		)

	# On new docs, defer role checks until update (name may not be finalized).
	if doc.is_new() or not getattr(doc, "name", None):
		return

	user = frappe.session.user

	old_terms = (doc.get_db_value("cm_credit_terms_days") or "0").strip()
	old_limit = doc.get_db_value("cm_credit_limit")

	new_terms = (getattr(doc, "cm_credit_terms_days", None) or "0").strip()
	new_limit = getattr(doc, "cm_credit_limit", None)

	# cm_credit_terms_days and cm_credit_limit: only CasaModerna Credit Manager or System Manager
	if str(old_terms) != str(new_terms) or str(old_limit or "") != str(new_limit or ""):
		if not _can_grant_credit(user):
			frappe.throw("Not permitted to change Credit Limit or Credit Terms.", frappe.PermissionError)


def on_customer_update_credit(doc, method=None) -> None:
	"""Customer.on_update hook to refresh balances deterministically."""
	if not frappe.get_meta("Customer").has_field("cm_balance"):
		return
	if not getattr(doc, "name", None):
		return

	refresh_balances(doc.name)


def on_payment_entry_change(doc, method=None) -> None:
	"""Payment Entry on_submit / on_cancel hook — refresh the customer's balance.

	When a Payment Entry is submitted or cancelled ERPNext updates outstanding_amount
	on the linked Sales Invoices.  We must mirror that change into cm_balance /
	cm_family_balance so the customer profile stays accurate.
	"""
	if getattr(doc, "party_type", None) != "Customer":
		return
	customer = getattr(doc, "party", None)
	if not customer:
		return
	if not frappe.get_meta("Customer").has_field("cm_balance"):
		return
	refresh_balances(customer)


def on_journal_entry_change(doc, method=None) -> None:
	"""Journal Entry on_submit / on_cancel hook — refresh any affected customer's balance.

	A Journal Entry can directly debit or credit the Debtors account with a
	Customer party, so we must refresh all such customers.
	"""
	if not frappe.get_meta("Customer").has_field("cm_balance"):
		return
	customers = {
		row.party
		for row in (getattr(doc, "accounts", None) or [])
		if getattr(row, "party_type", None) == "Customer" and getattr(row, "party", None)
	}
	for customer in customers:
		refresh_balances(customer)


def on_sales_invoice_change(doc, method=None) -> None:
	"""Sales Invoice on_submit / on_cancel hook — refresh the customer's balance fields.

	Called whenever an invoice is submitted or cancelled so that cm_balance and
	cm_family_balance shown on the customer profile stay current without requiring
	the customer record itself to be re-saved.
	"""
	customer = getattr(doc, "customer", None)
	if not customer:
		return
	if not frappe.get_meta("Customer").has_field("cm_balance"):
		return
	refresh_balances(customer)


def _get_receivable_accounts() -> list[str]:
	"""Return all account names with account_type = 'Receivable' (e.g. 'Debtors - CM')."""
	return frappe.get_all("Account", filters={"account_type": "Receivable"}, pluck="name")


def _compute_gl_balances(customers: set[str]) -> dict[str, float]:
	"""Compute each customer's outstanding balance from GL entries.

	Balance = SUM(debit) - SUM(credit) against all Receivable accounts.
	A positive value means the customer owes us money.
	A negative value means we hold a credit/advance for them.

	This is the same source of truth that ERPNext's Accounts Receivable
	report uses, and it correctly captures:
	  - Unpaid Sales Invoice amounts
	  - Advance / deposit payments not yet offset by an invoice
	  - Journal entries affecting the receivable
	"""
	if not customers:
		return {}

	receivable_accounts = _get_receivable_accounts()
	if not receivable_accounts:
		return {}

	rows = frappe.db.sql(
		"""
		SELECT party, SUM(debit) - SUM(credit) AS balance
		FROM `tabGL Entry`
		WHERE party_type = 'Customer'
		  AND party IN %(customers)s
		  AND account IN %(accounts)s
		  AND is_cancelled = 0
		GROUP BY party
		""",
		{
			"customers": tuple(customers),
			"accounts": tuple(receivable_accounts),
		},
		as_dict=True,
	)
	return {r.party: float(r.balance or 0) for r in rows}


def refresh_balances(customer_name: str) -> dict:
	"""Recompute and store cm_balance and cm_family_balance from GL entries.

	- cm_balance: this customer's GL balance against all Receivable accounts
	              (positive = they owe us, negative = we hold a credit for them)
	- cm_family_balance: sum across all customers sharing the same cm_root_customer

	Using GL entries (not Sales Invoice outstanding_amount) ensures that advance
	payments, deposits, and journal entries are all reflected accurately.
	"""
	meta = frappe.get_meta("Customer")
	if not meta.has_field("cm_balance") or not meta.has_field("cm_family_balance"):
		return {"cm_balance": 0, "cm_family_balance": 0}

	row = frappe.db.get_value(
		"Customer",
		customer_name,
		["name", "cm_root_customer"],
		as_dict=True,
	)
	if not row:
		return {"cm_balance": 0, "cm_family_balance": 0}

	root = (row.cm_root_customer or "").strip() or row.name

	# Customers in family: root + all with cm_root_customer = root
	family_customers = set(
		frappe.get_all("Customer", filters={"cm_root_customer": root}, pluck="name")
	)
	family_customers.add(root)

	balances = _compute_gl_balances(family_customers)

	family_outstanding = float(sum(balances.get(c, 0.0) for c in family_customers))

	# Write balances back deterministically.
	for c in family_customers:
		frappe.db.set_value(
			"Customer",
			c,
			{
				"cm_balance": balances.get(c, 0.0),
				"cm_family_balance": family_outstanding,
			},
			update_modified=False,
		)

	return {
		"cm_balance": balances.get(customer_name, 0.0),
		"cm_family_balance": family_outstanding,
		"root": root,
	}


@frappe.whitelist()
def set_customer_credit(customer: str, credit_limit, credit_terms_days, apply_to_family: bool = False):
	"""Set credit limit and/or credit terms for a customer (and optionally their whole family).

	Access is restricted to holders of the 'CasaModerna Credit Manager' role or
	'System Manager'.  The validate hook will also enforce this on Customer save,
	but having it here too gives a clean early rejection with a clear message.

	Args:
		customer: Customer docname.
		credit_limit: New credit limit in euros (numeric string or number).
		credit_terms_days: One of "0","30","60","90","180","365".
		apply_to_family: If True, apply the same values to all customers sharing
		                 the same cm_root_customer as *customer*.
	"""
	if not _can_grant_credit(frappe.session.user):
		frappe.throw("Not permitted to set customer credit.", frappe.PermissionError)

	terms_str = str(credit_terms_days or "0").strip()
	if terms_str not in ALLOWED_TERMS_DAYS:
		frappe.throw(
			f"Credit Terms (Days) must be one of: {', '.join(sorted(ALLOWED_TERMS_DAYS, key=int))}.",
			frappe.ValidationError,
		)

	try:
		limit_val = float(credit_limit or 0)
	except (ValueError, TypeError):
		frappe.throw("Credit Limit must be a valid number.", frappe.ValidationError)

	if not frappe.db.exists("Customer", customer):
		frappe.throw(f"Customer '{customer}' not found.", frappe.DoesNotExistError)

	# Determine the set of customers to update.
	if apply_to_family:
		row = frappe.db.get_value("Customer", customer, ["name", "cm_root_customer"], as_dict=True)
		root = (row.cm_root_customer or "").strip() or row.name
		targets = set(frappe.get_all("Customer", filters={"cm_root_customer": root}, pluck="name"))
		targets.add(root)
	else:
		targets = {customer}

	for cname in targets:
		frappe.db.set_value(
			"Customer",
			cname,
			{
				"cm_credit_limit": limit_val,
				"cm_credit_terms_days": terms_str,
			},
			update_modified=True,
		)

	frappe.db.commit()

	return {
		"updated": sorted(targets),
		"credit_limit": limit_val,
		"credit_terms_days": terms_str,
	}


@frappe.whitelist()
def resync_all_balances() -> dict:
	"""Recompute cm_balance / cm_family_balance for every customer.

	Use this once to fix stale balances caused by the missing Payment Entry hook,
	then going forward the hooks keep values current automatically.

	Restricted to System Manager.
	"""
	if "System Manager" not in frappe.get_roles(frappe.session.user):
		frappe.throw("Not permitted.", frappe.PermissionError)

	all_customers = frappe.get_all("Customer", pluck="name")
	updated = 0
	for cname in all_customers:
		refresh_balances(cname)
		updated += 1

	frappe.db.commit()
	return {"updated": updated}
