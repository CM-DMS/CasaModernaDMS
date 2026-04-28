"""
Patch: GRN redesign — add custom fields for 4-part Goods Receipt workflow.

Part 1  Goods Receipt   — adds cm_condition (Select) per item row
Part 2  Landing Costs   — adds CM Landing Charge child doctype + cm_landing_charges table
                          field + cm_distribute_by (Select) on Purchase Receipt
Part 3  Packaging & Eco — adds cm_gross_weight_kg, cm_net_weight_kg, cm_eco_rate per item
Part 4  Cost of Goods   — computed entirely in React from Parts 1-3; no DB fields needed

Note: cm_receiving_remarks already exists on Purchase Receipt Item (created previously).

Idempotent — safe to re-run.
"""
from __future__ import annotations

import frappe

MODULE = "CasaModerna Custom"


# ── Part 1: Condition field on Purchase Receipt Item ──────────────────────────

def _add_item_condition():
    field_id = "Purchase Receipt Item-cm_condition"
    if frappe.db.exists("Custom Field", field_id):
        return
    cf = frappe.get_doc({
        "doctype": "Custom Field",
        "dt": "Purchase Receipt Item",
        "fieldname": "cm_condition",
        "label": "Condition",
        "fieldtype": "Select",
        "options": "Good\nDamaged\nShort",
        "default": "Good",
        "insert_after": "qty",
        "in_list_view": 1,
        "allow_on_submit": 1,
    })
    cf.insert(ignore_permissions=True)
    print("  + Custom Field: Purchase Receipt Item-cm_condition")


# ── Part 3: Weight and eco fields on Purchase Receipt Item ────────────────────

def _add_item_weight_fields():
    weight_fields = [
        {
            "fieldname": "cm_cbm",
            "label": "CBM / Unit",
            "fieldtype": "Float",
            "insert_after": "cm_receiving_remarks",
            "precision": "4",
            "description": "Cubic metres per individual unit (used for CBM-based landing cost allocation)",
        },
        {
            "fieldname": "cm_gross_weight_kg",
            "label": "Gross Weight (kg)",
            "fieldtype": "Float",
            "insert_after": "cm_cbm",
            "precision": "3",
        },
        {
            "fieldname": "cm_net_weight_kg",
            "label": "Net Weight (kg)",
            "fieldtype": "Float",
            "insert_after": "cm_gross_weight_kg",
            "precision": "3",
        },
        {
            "fieldname": "cm_eco_rate",
            "label": "Eco Rate (€/kg)",
            "fieldtype": "Float",
            "insert_after": "cm_net_weight_kg",
            "default": "0.15",
            "precision": "3",
            "description": "Malta eco-contribution rate per kg of packaging waste",
        },
    ]
    for f in weight_fields:
        field_id = f"Purchase Receipt Item-{f['fieldname']}"
        if frappe.db.exists("Custom Field", field_id):
            continue
        cf = frappe.get_doc({
            "doctype": "Custom Field",
            "dt": "Purchase Receipt Item",
            "allow_on_submit": 1,
            "module": MODULE,
            **f,
        })
        cf.insert(ignore_permissions=True)
        print(f"  + Custom Field: {field_id}")


# ── Part 2: CM Landing Charge child doctype ───────────────────────────────────

def _create_landing_charge_doctype():
    if frappe.db.exists("DocType", "CM Landing Charge"):
        return

    dt = frappe.get_doc({
        "doctype": "DocType",
        "name": "CM Landing Charge",
        "module": MODULE,
        "custom": 1,
        "istable": 1,
        "editable_grid": 1,
        "track_changes": 0,
        "fields": [
            {
                "fieldname": "charge_type",
                "label": "Charge Type",
                "fieldtype": "Select",
                "options": "Sea Freight\nAir Freight\nImport Duty\nPort Handling\nInsurance\nOther",
                "in_list_view": 1,
                "reqd": 1,
                "columns": 3,
            },
            {
                "fieldname": "description",
                "label": "Description",
                "fieldtype": "Data",
                "in_list_view": 1,
                "columns": 4,
            },
            {
                "fieldname": "amount",
                "label": "Amount (€)",
                "fieldtype": "Currency",
                "in_list_view": 1,
                "reqd": 1,
                "columns": 3,
            },
        ],
    })
    dt.insert(ignore_permissions=True)
    print("  + DocType: CM Landing Charge")


# ── Part 2: Landing charges fields on Purchase Receipt ────────────────────────

def _add_receipt_landing_fields():
    fields = [
        {
            "fieldname": "cm_distribute_by",
            "label": "Distribute Landing Costs By",
            "fieldtype": "Select",
            "options": "Qty\nAmount\nProduct Value\nCBM",
            "default": "Qty",
            "insert_after": "lr_no",
            "description": "How landing charges are allocated across items",
        },
        {
            "fieldname": "cm_landing_charges",
            "label": "Landing Charges",
            "fieldtype": "Table",
            "options": "CM Landing Charge",
            "insert_after": "cm_distribute_by",
            "allow_on_submit": 1,
        },
    ]
    for f in fields:
        field_id = f"Purchase Receipt-{f['fieldname']}"
        if frappe.db.exists("Custom Field", field_id):
            continue
        cf = frappe.get_doc({
            "doctype": "Custom Field",
            "dt": "Purchase Receipt",
            "allow_on_submit": 1,
            "module": MODULE,
            **f,
        })
        cf.insert(ignore_permissions=True)
        print(f"  + Custom Field: {field_id}")


# ── Also set allow_on_submit on pre-existing cm_receiving_remarks ─────────────

def _fix_receiving_remarks_allow_on_submit():
    field_id = "Purchase Receipt Item-cm_receiving_remarks"
    if not frappe.db.exists("Custom Field", field_id):
        return
    current = frappe.db.get_value("Custom Field", field_id, "allow_on_submit")
    if not current:
        frappe.db.set_value("Custom Field", field_id, "allow_on_submit", 1)
        print("  ~ Updated allow_on_submit on cm_receiving_remarks")


def execute():
    frappe.set_user("Administrator")

    _create_landing_charge_doctype()
    _add_item_condition()
    _add_item_weight_fields()
    _add_receipt_landing_fields()
    _fix_receiving_remarks_allow_on_submit()

    frappe.db.commit()
    print("slice059: GRN landing/eco custom fields applied.")
