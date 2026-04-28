from __future__ import annotations

import frappe


def execute():
    if not frappe.db.exists("DocType", "Supplier"):
        return

    field_id = "Supplier-cm_supplier_ref_3"
    if frappe.db.exists("Custom Field", field_id):
        return

    cf = frappe.get_doc(
        {
            "doctype": "Custom Field",
            "dt": "Supplier",
            "fieldname": "cm_supplier_ref_3",
            "label": "Supplier Ref (3)",
            "fieldtype": "Data",
            "length": 3,
            "insert_after": "supplier_name",
            "in_list_view": 1,
            "in_global_search": 1,
            "description": "Canonical 3-character supplier reference for product coding (e.g. MIL)",
        }
    )
    cf.insert(ignore_permissions=True)
