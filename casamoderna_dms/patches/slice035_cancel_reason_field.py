"""
Patch: add cm_cancel_reason Small Text field to sales doctypes.

Stored before cancellation so there is an audit trail of why a document was cancelled.
"""
import frappe

_DOCTYPES = ["Quotation", "Sales Order", "Delivery Note", "Sales Invoice"]


def _ensure(dt):
    field_id = f"{dt}-cm_cancel_reason"
    if frappe.db.exists("Custom Field", field_id):
        return
    frappe.set_user("Administrator")
    cf = frappe.new_doc("Custom Field")
    cf.dt = dt
    cf.fieldname = "cm_cancel_reason"
    cf.label = "Cancellation Reason"
    cf.fieldtype = "Small Text"
    cf.read_only = 0
    cf.no_copy = 1
    cf.in_list_view = 0
    cf.insert_after = "amended_from"
    cf.save()


def execute():
    for dt in _DOCTYPES:
        if not frappe.db.exists("DocType", dt):
            continue
        _ensure(dt)
    frappe.db.commit()
