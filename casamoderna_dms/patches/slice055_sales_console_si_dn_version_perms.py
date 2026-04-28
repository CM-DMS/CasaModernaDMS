"""slice055 — Fix three Sales Console permission gaps causing 403 errors.

Issues
------
1. frappe.client.get_list 403 × 3
   The DocumentHistory component queries the `Version` doctype for every
   saved sales document page.  `Version` has no Custom DocPerm for Sales
   Console, so the call returns 403 and the history panel stays blank.

2. submit_delivery_note 403
   delivery_pickup_api.submit_delivery_note explicitly checks
   has_permission("Delivery Note", "submit") before submitting.
   The Sales Console role has read+write+create on Delivery Note but
   submit=0, so this always fails.

3. make_sales_invoice 403
   erpnext.selling.doctype.sales_order.sales_order.make_sales_invoice
   (and the equivalent DN→SI mapper) requires create+write on Sales
   Invoice.  Sales Console was left at read=1 only by an earlier patch
   (fix_sales_console_submit_permissions) and slice051 was never
   registered in patches.txt, so the upgrade never ran.

Fixes
-----
Version       : add read=1  (no write/create — audit log must stay immutable)
Delivery Note : add submit=1 (write+create already exist)
Sales Invoice : upgrade to read+write+create+submit

Idempotent — safe to re-run.
"""

from __future__ import annotations

import frappe

_ROLE = "CasaModerna Sales Console"


def _upsert_custom_docperm(parent: str, role: str, perms: dict) -> str:
    existing = frappe.get_all(
        "Custom DocPerm",
        filters={"parent": parent, "role": role, "permlevel": 0},
        fields=["name"],
        order_by="name asc",
        limit=1,
    )
    if existing:
        doc = frappe.get_doc("Custom DocPerm", existing[0]["name"])
    else:
        name = f"cm_sc_{frappe.scrub(parent)}_0"
        if frappe.db.exists("Custom DocPerm", name):
            doc = frappe.get_doc("Custom DocPerm", name)
        else:
            doc = frappe.new_doc("Custom DocPerm")
            doc.name = name
            doc.parent = parent
            doc.parenttype = "DocType"
            doc.parentfield = "permissions"
            doc.role = role
            doc.permlevel = 0
            doc.if_owner = 0

    doc.select = 1
    for key in ["read", "write", "create", "delete", "submit", "cancel", "amend"]:
        setattr(doc, key, int(perms.get(key, 0) or 0))

    for key in ["report", "export", "print", "email", "share"]:
        if key in perms:
            setattr(doc, key, int(perms[key]))

    if doc.is_new():
        doc.insert(ignore_permissions=True)
    else:
        doc.save(ignore_permissions=True)

    return doc.name


def execute():
    if not frappe.db.exists("Role", _ROLE):
        print(f"Role '{_ROLE}' not found — skipping.")
        return

    frappe.set_user("Administrator")

    # 1. Version — read-only so DocumentHistory can display audit log
    _upsert_custom_docperm("Version", _ROLE, {"read": 1})
    print("Version: read granted")

    # 2. Delivery Note — add submit so submit_delivery_note API works
    _upsert_custom_docperm(
        "Delivery Note", _ROLE,
        {"read": 1, "write": 1, "create": 1, "submit": 1,
         "report": 1, "export": 1, "print": 1, "email": 1},
    )
    print("Delivery Note: submit granted")

    # 3. Sales Invoice — upgrade to write+create+submit so SO/DN→SI conversion works
    _upsert_custom_docperm(
        "Sales Invoice", _ROLE,
        {"read": 1, "write": 1, "create": 1, "submit": 1,
         "report": 1, "export": 1, "print": 1, "email": 1},
    )
    print("Sales Invoice: write+create+submit granted")

    # 4. Delivery Note — ensure Stock User and Delivery Manager also have submit=1
    # When Custom DocPerm rows exist, standard DocPerm is ignored entirely by Frappe.
    # Stock User was previously submit=0 in Custom DocPerm; Delivery Manager had no row.
    for role, perms in [
        ("Stock User",       {"read": 1, "write": 1, "create": 1, "submit": 1, "report": 1, "export": 1, "print": 1, "email": 1}),
        ("Delivery Manager", {"read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "report": 1, "export": 1, "print": 1, "email": 1}),
    ]:
        _upsert_custom_docperm("Delivery Note", role, perms)
        print(f"Delivery Note: {role} submit fixed")

    frappe.db.commit()
