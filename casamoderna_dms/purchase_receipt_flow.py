"""
purchase_receipt_flow.py — Server-side helpers for the GRN (Purchase Receipt) screen.

Provides a safe submit endpoint that loads the document from DB before submitting,
avoiding the frappe.client.submit TimestampMismatchError that occurs when the doc
dict passed to the generic endpoint does not carry a `modified` value.
"""
from __future__ import annotations

import frappe


@frappe.whitelist()
def submit_grn(name: str):
    """Submit a Purchase Receipt by loading it fresh from DB.

    frappe.client.submit initialises the Document from the dict you pass;
    if `modified` is absent the in-memory value is None, which causes
    TimestampMismatchError even when the caller is the only writer.

    This endpoint sidesteps that by always loading from DB first.
    """
    doc = frappe.get_doc("Purchase Receipt", name)
    doc.submit()
    return doc.as_dict()


@frappe.whitelist()
def cancel_grn(name: str):
    """Cancel a Purchase Receipt by loading it fresh from DB.

    Same reasoning as submit_grn: frappe.client.cancel initialises the Document
    from the dict you pass; if `modified` is absent the in-memory value is None,
    causing TimestampMismatchError before any cancel logic runs.
    """
    doc = frappe.get_doc("Purchase Receipt", name)
    doc.cancel()
    return doc.as_dict()
