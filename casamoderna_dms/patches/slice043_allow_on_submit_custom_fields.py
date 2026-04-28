"""
Patch: set allow_on_submit = 1 on custom fields that must be writable on
submitted Delivery Notes.

  - Delivery Note-cm_warehouse_status  (workflow field changed after submit)
  - Delivery Note-cm_cancel_reason     (filled in just before cancellation)

Without allow_on_submit these fields raise UpdateAfterSubmitError when written
via frappe.client.set_value or doc.save().
"""
import frappe

_FIELDS = [
    "Delivery Note-cm_warehouse_status",
    "Delivery Note-cm_cancel_reason",
]


def execute():
    for field_id in _FIELDS:
        if not frappe.db.exists("Custom Field", field_id):
            continue
        frappe.db.set_value("Custom Field", field_id, "allow_on_submit", 1)
    frappe.db.commit()
