"""
slice050 — Add 'Voucher Purchase' to the cm_payment_purpose Custom Field options.

The cm_payment_purpose Select field on Payment Entry previously allowed only:
  Deposit / Invoice Settlement / Payment on Account

This patch adds 'Voucher Purchase' so receipts for gift voucher sales can be
posted with the correct purpose and automatically routed to the VoucherEditor.
"""
import frappe


def execute():
    cf_name = "Payment Entry-cm_payment_purpose"
    if not frappe.db.exists("Custom Field", cf_name):
        return

    current = frappe.db.get_value("Custom Field", cf_name, "options") or ""
    options = [o.strip() for o in current.splitlines() if o.strip()]

    if "Voucher Purchase" not in options:
        options.append("Voucher Purchase")
        frappe.db.set_value("Custom Field", cf_name, "options", "\n".join(options))
        frappe.db.commit()
