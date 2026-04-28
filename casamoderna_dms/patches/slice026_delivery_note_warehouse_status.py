"""
Patch: add cm_warehouse_status Select field to Delivery Note.

Values: '' (not set), 'Preparing', 'Ready', 'Dispatched'
"""
import frappe


_FIELD_ID = "Delivery Note-cm_warehouse_status"


def execute():
    if not frappe.db.exists("DocType", "Delivery Note"):
        return
    if frappe.db.exists("Custom Field", _FIELD_ID):
        return

    frappe.set_user("Administrator")
    cf = frappe.new_doc("Custom Field")
    cf.dt = "Delivery Note"
    cf.fieldname = "cm_warehouse_status"
    cf.label = "Warehouse Status"
    cf.fieldtype = "Select"
    cf.options = "\nPreparing\nReady\nDispatched"
    cf.default = ""
    cf.in_list_view = 1
    cf.in_standard_filter = 1
    cf.read_only = 0
    cf.insert_after = "posting_date"
    cf.save()
    frappe.db.commit()
