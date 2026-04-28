"""
Patch: add payment schedule milestone fields to Quotation and Sales Order.

  cm_payment_on_order    — Deposit on Order Confirmation
  cm_payment_on_survey   — Due on Site Survey
  cm_payment_on_delivery — Balance on Delivery (stored for print, computed in UI)
"""
import frappe

_FIELDS = [
    # (fieldname, label, insert_after)
    ("cm_payment_on_order",    "Deposit on Order Confirmation", "cm_deposit_percent"),
    ("cm_payment_on_survey",   "Due on Site Survey",            "cm_payment_on_order"),
    ("cm_payment_on_delivery", "Balance on Delivery",           "cm_payment_on_survey"),
]

_DOCTYPES = ["Quotation", "Sales Order"]


def _ensure(dt, fieldname, label, insert_after):
    field_id = f"{dt}-{fieldname}"
    if frappe.db.exists("Custom Field", field_id):
        return
    frappe.set_user("Administrator")
    cf = frappe.new_doc("Custom Field")
    cf.dt = dt
    cf.fieldname = fieldname
    cf.label = label
    cf.fieldtype = "Currency"
    cf.options = "currency"
    cf.read_only = 0
    cf.no_copy = 0
    cf.in_list_view = 0
    cf.insert_after = insert_after
    cf.save()


def execute():
    for dt in _DOCTYPES:
        if not frappe.db.exists("DocType", dt):
            continue
        for fieldname, label, insert_after in _FIELDS:
            _ensure(dt, fieldname, label, insert_after)
    frappe.db.commit()
