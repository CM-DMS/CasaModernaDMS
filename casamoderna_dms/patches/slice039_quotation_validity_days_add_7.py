"""
Patch: add 7 to the cm_validity_days Select options on the Quotation doctype.

The original field was created with options: (blank), 14, 30, 60, 90.
7-day quotations are a common short-validity scenario; this patch inserts 7
at the top of the list so the V2 frontend validity dropdown can offer it.
"""
import frappe

_FIELD_ID = "Quotation-cm_validity_days"
_OPTIONS   = "\n7\n14\n30"


def execute():
    if not frappe.db.exists("Custom Field", _FIELD_ID):
        return

    current = frappe.db.get_value("Custom Field", _FIELD_ID, "options") or ""
    if "7" in current.split("\n"):
        return  # Already present — idempotent

    frappe.db.set_value("Custom Field", _FIELD_ID, "options", _OPTIONS)
    frappe.db.commit()
