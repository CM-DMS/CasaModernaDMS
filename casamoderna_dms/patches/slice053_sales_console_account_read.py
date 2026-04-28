"""slice053 — Grant CasaModerna Sales Console read access on the Account
DocType.

Context
-------
ERPNext's Payment Entry controller calls frappe.get_list("Account", ...,
reference_doctype="Payment Entry") inside validate() → set_missing_values()
→ get_account_details() (payment_entry.py line 2719).  That call is
permission-checked: Frappe raises PermissionError if the requesting user's
role has no read permission on Account.

The Sales Console role had Payment Entry create/submit (added in slice052)
but lacked any Account permission row, causing every POST to
/api/resource/Payment Entry to return 403.

Fix
---
Add a read-only Custom DocPerm row for Account so the validator can look up
account types without exposing write access to the chart of accounts.

Idempotent: uses the same upsert pattern as all other slice patches.
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

    # Account: read-only so that payment_entry.py's get_account_details()
    # can call frappe.get_list("Account", ..., reference_doctype="Payment Entry")
    # without raising PermissionError.  No write/create access is granted —
    # the chart of accounts remains off-limits for this role.
    changes.append(
        _upsert_custom_docperm(
            "Account", role, 0,
            {"read": 1, "report": 1},
        )
    )

    try:
        frappe.clear_cache(doctype="Account")
    except Exception:
        pass

    frappe.clear_cache()

    print(f"slice053: updated Custom DocPerm rows: {changes}")
    return {"updated": changes}
