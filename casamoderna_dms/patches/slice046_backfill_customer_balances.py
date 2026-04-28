"""Patch: backfill cm_balance and cm_family_balance for all existing customers.

The on_sales_invoice_change hook (added in this release) only fires for
new invoice submissions going forward. This patch does a one-time recalculation
of all customers' balance fields from the existing submitted Sales Invoices.
"""
import frappe
from casamoderna_dms.customer_credit import refresh_balances


def execute():
    frappe.set_user("Administrator")

    meta = frappe.get_meta("Customer")
    if not meta.has_field("cm_balance") or not meta.has_field("cm_family_balance"):
        return

    # Get every distinct customer that has at least one submitted Sales Invoice
    # (plus any customer already in the DB so we zero-out ones with no invoices)
    all_customers = frappe.get_all("Customer", pluck="name")

    # Track which root customers we've already processed to avoid redundant work
    refreshed_roots: set[str] = set()

    for customer_name in all_customers:
        root = (
            frappe.db.get_value("Customer", customer_name, "cm_root_customer") or customer_name
        ).strip() or customer_name

        if root in refreshed_roots:
            continue

        refresh_balances(customer_name)
        refreshed_roots.add(root)

    frappe.db.commit()
