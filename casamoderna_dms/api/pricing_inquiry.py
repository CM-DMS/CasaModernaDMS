"""
Pricing Inquiry API — confirm pricing on a submitted Stage 1 Purchase Order.

Flow:
1. PO created as "Pricing Inquiry" (no pricing) → submitted → sent to supplier
2. Supplier returns with pricing → user enters rates via DMS
3. This endpoint updates rates on the submitted PO and sets stage to "Confirmed"
"""
import frappe
from frappe import _
from frappe.utils import now


@frappe.whitelist()
def confirm_pricing(po_name, items_with_rates):
    """
    Confirm pricing on a submitted Pricing Inquiry PO.

    Updates item rates on a submitted PO (using update_after_submit),
    then transitions cm_po_stage from "Pricing Inquiry" to "Confirmed".
    """
    import json
    if isinstance(items_with_rates, str):
        items_with_rates = json.loads(items_with_rates)

    po = frappe.get_doc("Purchase Order", po_name)

    if po.cm_po_stage != "Pricing Inquiry":
        frappe.throw(_("This Purchase Order is already confirmed."))

    if po.docstatus != 1:
        frappe.throw(_("Only submitted Purchase Orders can have pricing confirmed."))

    # Build a lookup: PO Item row name -> rate
    rate_map = {r["name"]: float(r["rate"]) for r in items_with_rates}

    # Update rates on each item (bypass submit lock)
    for item in po.items:
        if item.name in rate_map:
            item.rate = rate_map[item.name]
            item.amount = item.rate * item.qty

    po.cm_po_stage = "Confirmed"
    po.cm_pricing_confirmed_at = now()

    # Allow updating a submitted document
    po.flags.ignore_validate_update_after_submit = True
    po.save(ignore_permissions=False)

    # Recalculate totals
    po.calculate_taxes_and_totals()
    po.flags.ignore_validate_update_after_submit = True
    po.save(ignore_permissions=False)

    return po.as_dict()
