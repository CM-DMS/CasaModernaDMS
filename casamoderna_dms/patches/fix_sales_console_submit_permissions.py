"""fix_sales_console_submit_permissions.py

Grant CasaModerna Sales Console the ability to submit core sales documents:
  - Quotation        (submit a formal quote)
  - Sales Order      (confirm an order)
  - POS Invoice      (cash-sale checkout)

Delivery Note and Sales Invoice remain read-only / derived-only for this role.
Cancel and amend remain restricted to manager roles.

The patch handles both environments:
  • Sites where Custom DocPerm rows are still in effect (pre-contract17).
  • Sites where contract17 cleaned up to standard DocPerm rows.
"""

from __future__ import annotations

import frappe

_ROLE = "CasaModerna Sales Console"
_SUBMIT_DOCTYPES = ["Quotation", "Sales Order", "POS Invoice"]


def _set_submit_on_custom_docperm(doctype: str) -> str | None:
    rows = frappe.get_all(
        "Custom DocPerm",
        filters={"parent": doctype, "role": _ROLE},
        fields=["name", "submit"],
        limit=1,
    )
    if not rows:
        return None
    name = rows[0]["name"]
    if not rows[0].get("submit"):
        frappe.db.set_value("Custom DocPerm", name, "submit", 1, update_modified=False)
    return name


def _set_submit_on_docperm(doctype: str) -> str | None:
    name = frappe.db.get_value(
        "DocPerm",
        {"parent": doctype, "role": _ROLE, "permlevel": 0},
        "name",
    )
    if not name:
        return None
    frappe.db.set_value("DocPerm", name, "submit", 1, update_modified=False)
    return name


def execute():
    if not frappe.db.exists("Role", _ROLE):
        return

    frappe.set_user("Administrator")

    updated = []
    for doctype in _SUBMIT_DOCTYPES:
        if not frappe.db.exists("DocType", doctype):
            continue
        # Custom DocPerm takes precedence over standard DocPerm when present.
        result = _set_submit_on_custom_docperm(doctype)
        if result is None:
            result = _set_submit_on_docperm(doctype)
        if result:
            updated.append(f"{doctype}:{result}")
        frappe.clear_cache(doctype=doctype)

    frappe.db.commit()
    frappe.clear_cache()

    return {"updated": updated}
