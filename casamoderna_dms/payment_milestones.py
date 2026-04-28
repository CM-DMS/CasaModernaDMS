"""
payment_milestones.py — Recompute cm_payment_on_delivery on every validate.

Rule: cm_payment_on_delivery = max(0, grand_total − cm_payment_on_order − cm_payment_on_survey)

This runs server-side so the stored value is always consistent with the order
total, even when items are added/removed after the milestones were first entered.
"""
from __future__ import annotations

import frappe


def clear_payment_schedule(doc, method=None):
    """before_validate hook — wipe the standard payment_schedule child table.

    ERPNext's validate_payment_schedule_amount checks that payment_schedule
    rows sum to grand_total.  Because we store payment milestones in custom
    cm_payment_on_* fields (not in payment_schedule), any stale rows from a
    previous save cause a mismatch when the total changes.  Clearing here
    forces set_payment_schedule() to rebuild a single 100% row that always
    matches the current grand_total.
    """
    doc.payment_schedule = []


def recompute_payment_milestones(doc, method=None):
    """Validate hook for Quotation and Sales Order."""
    grand_total  = float(getattr(doc, "grand_total", 0) or 0)
    on_order     = float(getattr(doc, "cm_payment_on_order", 0) or 0)
    on_survey    = float(getattr(doc, "cm_payment_on_survey", 0) or 0)

    # Only touch the field when any milestone is set — avoids overwriting null
    # on docs that predate the payment schedule feature.
    if on_order == 0 and on_survey == 0:
        return

    balance = max(0.0, grand_total - on_order - on_survey)
    doc.cm_payment_on_delivery = balance
