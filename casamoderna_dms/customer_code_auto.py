"""
customer_code_auto.py — Auto-generate XXXX000C customer codes on insert.

Format: first 2 chars of first name + first 2 chars of surname + 3-digit seq + C
Example: Brian Borg → BRBO001C, Bromley Bonnici → BRBO002C

Rules:
- Sequence is per 4-letter prefix (BRBO → 001, 002, ...)
- Codes are permanent once assigned (idempotent on before_insert)
- Single-word names use first 4 chars for the prefix
- Result is stored in cm_customer_code (read-only custom field)
"""
from __future__ import annotations

import re
import frappe
from frappe.model.naming import getseries


"""Prefixes that are considered undesirable and replaced with ZZ at positions 1-2."""
_BAD_PREFIXES = frozenset({
    "SHIT", "FUCK", "CUNT", "DICK", "PISS", "ARSE", "TURD", "TWAT",
    "SLAG", "SLUT", "CUMS", "ANUS", "COCK", "FAGS", "PEDO",
})


def _name_prefix(customer_name: str) -> str:
    """Return the 4-char prefix derived from customer_name.

    Multi-word: first 2 of first word + first 2 of last word.
    Single-word: first 4 chars.
    All uppercased, non-alpha stripped.
    """
    words = [re.sub(r"[^A-Za-z]", "", w) for w in (customer_name or "").split()]
    words = [w for w in words if w]
    if not words:
        return "UNKN"
    if len(words) == 1:
        prefix = (words[0] + "XXXX")[:4]
    else:
        prefix = (words[0] + "XX")[:2] + (words[-1] + "XX")[:2]
    prefix = prefix.upper()
    # ZZ sanitise: replace middle two characters if the 4-char combo is undesirable
    if prefix in _BAD_PREFIXES:
        prefix = prefix[0] + "ZZ" + prefix[3]
    return prefix


def _next_customer_seq(prefix: str) -> str:
    """Return next 3-digit sequence for the given 4-char prefix."""
    series_key = f"CMC-{prefix}-"
    return getseries(series_key, 3)


def assign_customer_code(doc, method=None):
    """Hook: before_insert on Customer — assign cm_customer_code if not already set."""
    # Skip if already assigned (idempotent)
    if (getattr(doc, "cm_customer_code", None) or "").strip():
        return

    # Only assign if the field exists on the doctype
    try:
        meta = frappe.get_meta("Customer")
        if not meta.get_field("cm_customer_code"):
            return
    except Exception:  # noqa: BLE001
        return

    customer_name = (getattr(doc, "customer_name", None) or getattr(doc, "name", None) or "").strip()
    if not customer_name:
        return

    prefix = _name_prefix(customer_name)
    seq = _next_customer_seq(prefix)
    doc.cm_customer_code = f"{prefix}{seq}C"


def ensure_customer_code_field():
    """Idempotent: create the cm_customer_code custom field on Customer."""
    if not frappe.db.exists("DocType", "Customer"):
        return
    field_id = "Customer-cm_customer_code"
    if frappe.db.exists("Custom Field", field_id):
        return

    frappe.set_user("Administrator")
    cf = frappe.new_doc("Custom Field")
    cf.dt = "Customer"
    cf.fieldname = "cm_customer_code"
    cf.label = "Customer Code"
    cf.fieldtype = "Data"
    cf.read_only = 1
    cf.no_copy = 1
    cf.in_list_view = 0
    cf.in_standard_filter = 1
    cf.insert_after = "customer_name"
    cf.save()
    frappe.db.commit()
