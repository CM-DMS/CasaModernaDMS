"""slice051 — Grant CasaModerna Sales Console the permissions needed for
Cash Sales, Credit Notes, and Receipts.

Context
-------
contract_permissions_sales_console_access.py previously set Sales Invoice
to read-only for this role ("derived-only creation rules remain").  That
made sense for *regular* invoices that are created automatically from
Sales Orders.  However, three frontend features visible and actionable for
all canSales users require more:

  • Cash Sales  (/sales/cash-sales)   → creates Sales Invoice with is_pos=1
  • Credit Notes (/sales/credit-notes) → creates Sales Invoice with is_return=1
  • Receipts     (/sales/receipts)    → reads/creates Payment Entry

The frontend (CashSaleList, CreditNoteList, PaymentEntryList) gates the
"+ New" button on can('canSales') which includes SALES_CONSOLE.  Without
the underlying DocType permissions the API calls fail silently with a
Frappe PermissionError.

Changes
-------
Sales Invoice  : upgrade from read-only → read + write + create + submit
Payment Entry  : add read + write + create + submit (was entirely absent)

Idempotent: uses upsert on Custom DocPerm (same helper as existing patches).
"""

from __future__ import annotations

import frappe


def _upsert_custom_docperm(parent: str, role: str, permlevel: int, perms: dict) -> str:
    existing = frappe.get_all(
        "Custom DocPerm",
        filters={"parent": parent, "role": role, "permlevel": permlevel},
        fields=["name"],
        order_by="name asc",
        limit=1,
    )
    if existing:
        doc = frappe.get_doc("Custom DocPerm", existing[0]["name"])
    else:
        name = f"cm_sc_{frappe.scrub(parent)}_{permlevel}"
        if frappe.db.exists("Custom DocPerm", name):
            doc = frappe.get_doc("Custom DocPerm", name)
        else:
            doc = frappe.new_doc("Custom DocPerm")
            doc.name = name
            doc.parent = parent
            doc.parenttype = "DocType"
            doc.parentfield = "permissions"
            doc.role = role
            doc.permlevel = permlevel
            doc.if_owner = 0

    doc.select = 1
    for key in ["read", "write", "create", "delete", "submit", "cancel", "amend"]:
        setattr(doc, key, int(perms.get(key, 0) or 0))

    # Optional display flags — preserve existing values when not specified.
    for key in ["report", "export", "print", "email", "share"]:
        if key in perms:
            setattr(doc, key, int(perms[key]))

    if doc.is_new():
        doc.insert(ignore_permissions=True)
    else:
        doc.save(ignore_permissions=True)

    return doc.name


def execute():
    role = "CasaModerna Sales Console"
    if not frappe.db.exists("Role", role):
        print(f"Role '{role}' not found — skipping.")
        return

    frappe.set_user("Administrator")

    changes = []

    # Sales Invoice: upgrade to allow creating cash sales (is_pos=1) and
    # credit notes (is_return=1).  Regular invoice creation is prevented by
    # the frontend — only CashSaleEditor and CreditNoteDetail expose a save
    # action to canSales users.
    changes.append(
        _upsert_custom_docperm(
            "Sales Invoice", role, 0,
            {"read": 1, "write": 1, "create": 1, "submit": 1,
             "report": 1, "export": 1, "print": 1, "email": 1},
        )
    )

    # Payment Entry: sales console needs read + create to list and record
    # receipts via the /sales/receipts screen.
    changes.append(
        _upsert_custom_docperm(
            "Payment Entry", role, 0,
            {"read": 1, "write": 1, "create": 1, "submit": 1,
             "report": 1, "export": 1, "print": 1, "email": 1},
        )
    )

    for dt in ["Sales Invoice", "Payment Entry"]:
        try:
            frappe.clear_cache(doctype=dt)
        except Exception:
            pass

    frappe.clear_cache()

    print(f"slice051: updated Custom DocPerm rows: {changes}")
    return {"updated": changes}
