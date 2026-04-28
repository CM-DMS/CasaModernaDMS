"""
Patch: add cm_confirmed_by (Data) and cm_confirmed_at (Datetime) to Sales Order.

Written by confirm_pending_so() when a Pending SO is moved to Confirmed.
Both fields are read-only in the UI — they are only set programmatically.
"""
import frappe

_FIELDS = [
    # (fieldname, label, fieldtype, insert_after)
    ("cm_confirmed_by", "Confirmed By", "Data",     "workflow_state"),
    ("cm_confirmed_at", "Confirmed At", "Datetime", "cm_confirmed_by"),
]


def _ensure(fieldname, label, fieldtype, insert_after):
    field_id = f"Sales Order-{fieldname}"
    if frappe.db.exists("Custom Field", field_id):
        return
    frappe.set_user("Administrator")
    cf = frappe.new_doc("Custom Field")
    cf.dt = "Sales Order"
    cf.fieldname = fieldname
    cf.label = label
    cf.fieldtype = fieldtype
    cf.read_only = 1
    cf.no_copy = 1
    cf.in_list_view = 0
    cf.insert_after = insert_after
    cf.save()


def execute():
    if not frappe.db.exists("DocType", "Sales Order"):
        return
    for fieldname, label, fieldtype, insert_after in _FIELDS:
        _ensure(fieldname, label, fieldtype, insert_after)
    frappe.db.commit()
