"""slice052 — Grant CasaModerna Sales Console permissions on Payment Entry
and CM Voucher.

Context
-------
Sales team are front-liners who receive payments (deposits, invoice
settlements, payments on account) and sell gift vouchers.  The
CasaModerna Sales Console role was missing Permission rows for both
Payment Entry and CM Voucher, blocking these workflows.

Changes
-------
Payment Entry : add read + write + create + submit
CM Voucher    : add read + write + create + submit

Sales Invoice is intentionally left as read-only (unchanged).

Idempotent: uses upsert on Custom DocPerm.
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

    # Payment Entry: sales console needs full access to record receipts,
    # deposits, invoice settlements, payments on account, and voucher purchases.
    changes.append(
        _upsert_custom_docperm(
            "Payment Entry", role, 0,
            {"read": 1, "write": 1, "create": 1, "submit": 1,
             "report": 1, "export": 1, "print": 1, "email": 1},
        )
    )

    # CM Voucher: sales console needs full access to create and manage
    # gift vouchers sold to customers.
    changes.append(
        _upsert_custom_docperm(
            "CM Voucher", role, 0,
            {"read": 1, "write": 1, "create": 1, "submit": 1,
             "report": 1, "export": 1, "print": 1, "email": 1},
        )
    )

    for dt in ["Payment Entry", "CM Voucher"]:
        try:
            frappe.clear_cache(doctype=dt)
        except Exception:
            pass

    frappe.clear_cache()

    print(f"slice052: updated Custom DocPerm rows: {changes}")
    return {"updated": changes}
