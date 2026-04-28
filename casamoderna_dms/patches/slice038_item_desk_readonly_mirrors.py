from __future__ import annotations

"""slice038 — Mark ERPNext Item fields that are DMS-managed as read-only in Frappe Desk.

Problem:
  Several standard ERPNext Item fields overlap with CasaModerna's canonical cm_* fields:

    standard_rate   → mirror of cm_final_offer_ex_vat   (written by cm_pricing.py on every save)
    description     → mirror of cm_description_line_1/2 (written by item_display.py on every save)
    valuation_rate  → system-maintained stock cost       (not part of CM pricing pipeline)
    last_purchase_rate → system-maintained PO history    (not part of CM pricing pipeline)

  If a user edits these in the ERPNext Desk, the next Item save will overwrite their changes,
  creating a confusing loop.  Making them read-only in the Desk removes the ambiguity without
  touching the underlying data.

Policy:
  - standard_rate    → read-only; label clarifies it is DMS-managed
  - description      → read-only; label clarifies it is synced from DMS description lines
  - valuation_rate   → read-only; label clarifies it is system-maintained
  - last_purchase_rate → read-only; label clarifies it is system-maintained
"""

import frappe

DT = "Item"


def _set(fieldname: str, prop: str, prop_type: str, value) -> None:
    name = f"{DT}-{fieldname}-{prop}"
    if frappe.db.exists("Property Setter", name):
        ps = frappe.get_doc("Property Setter", name)
        ps.value = str(value)
        ps.property_type = prop_type
        ps.save(ignore_permissions=True)
        return
    ps = frappe.new_doc("Property Setter")
    ps.doctype_or_field = "DocField"
    ps.doc_type = DT
    ps.field_name = fieldname
    ps.property = prop
    ps.property_type = prop_type
    ps.value = str(value)
    ps.insert(ignore_permissions=True)


def execute():
    frappe.set_user("Administrator")
    meta = frappe.get_meta(DT)

    # (fieldname, new_label)
    mirrors = [
        ("standard_rate",      "Offer Price ex VAT — set by DMS, do not edit here"),
        ("description",        "Description — synced from DMS, do not edit here"),
        ("valuation_rate",     "Valuation Rate — system-maintained, do not edit"),
        ("last_purchase_rate", "Last Purchase Rate — system-maintained, do not edit"),
    ]

    for fieldname, label in mirrors:
        if not meta.has_field(fieldname):
            continue
        _set(fieldname, "read_only", "Check", 1)
        _set(fieldname, "label", "Data", label)

    frappe.clear_cache(doctype=DT)
