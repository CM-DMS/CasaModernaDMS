"""slice054 — Restore read access to CM Locality for Sales User / Accounts User.

Root cause
----------
When any Custom DocPerm row exists for a DocType, Frappe uses *only* those
custom rows and ignores the standard DocPerm fixture entirely.

A previous migration added a Custom DocPerm for "CM Super Admin" on
tabCM Locality.  That single row silently shadowed the fixture rows that
granted read to "Sales User" and "Accounts User", making the locality
dropdown on the Customer form appear empty for every non-super-admin user.

Fix
---
Upsert Custom DocPerm read-only rows for the roles that need it so the
effective permission set is complete again.  Idempotent.
"""

from __future__ import annotations

import frappe

_ROLES = [
    "Sales User",
    "Accounts User",
    "CasaModerna Sales Console",
]


def _upsert_read_perm(parent: str, role: str) -> None:
    existing = frappe.get_all(
        "Custom DocPerm",
        filters={"parent": parent, "role": role, "permlevel": 0},
        fields=["name"],
        limit=1,
    )
    if existing:
        doc = frappe.get_doc("Custom DocPerm", existing[0]["name"])
    else:
        doc = frappe.new_doc("Custom DocPerm")
        doc.parent = parent
        doc.parenttype = "DocType"
        doc.parentfield = "permissions"
        doc.role = role
        doc.permlevel = 0
        doc.if_owner = 0

    doc.read = 1
    doc.select = 1
    # Ensure these remain read-only
    doc.write = 0
    doc.create = 0
    doc.delete = 0
    doc.submit = 0
    doc.cancel = 0
    doc.amend = 0

    if doc.is_new():
        doc.insert(ignore_permissions=True)
    else:
        doc.save(ignore_permissions=True)


def execute():
    frappe.set_user("Administrator")

    for role in _ROLES:
        if not frappe.db.exists("Role", role):
            print(f"Role '{role}' not found — skipping.")
            continue
        _upsert_read_perm("CM Locality", role)
        print(f"CM Locality: ensured read for '{role}'")

    frappe.db.commit()
