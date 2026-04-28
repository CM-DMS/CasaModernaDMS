"""Patch: add cm_site_survey_required checkbox to Sales Order and Delivery Note,
and add a Delivery section to the CasaModerna Sales Order print format.

The Delivery section shows:
  - Delivery Month (cm_need_by_month)
  - Route (cm_route)
  - Delivery Instructions (cm_delivery_instructions)
  - Flags row: Lift Required · Pickup from Showroom · Site Survey Required
    (only the checked ones are shown)
"""
import frappe

_PF_NAME = "CasaModerna Sales Order"

_DELIVERY_SNIPPET = """\
{%- set _has_delivery = doc.cm_need_by_month or doc.cm_route or doc.cm_delivery_instructions or doc.cm_lift_required or doc.cm_pickup_from_showroom or doc.cm_site_survey_required -%}
{%- if _has_delivery -%}
<div class="pf-split">
  <h4>Delivery</h4>
  <table style="width:100%">
    {%- if doc.cm_need_by_month %}<tr><td class="lbl">Delivery Month</td><td>{{ doc.cm_need_by_month }}</td></tr>{%- endif -%}
    {%- if doc.cm_route %}<tr><td class="lbl">Route</td><td>{{ doc.cm_route }}</td></tr>{%- endif -%}
    {%- if doc.cm_delivery_instructions %}<tr><td class="lbl">Instructions</td><td style="white-space:pre-wrap">{{ doc.cm_delivery_instructions }}</td></tr>{%- endif -%}
    {%- set _flags = [] -%}
    {%- if doc.cm_lift_required -%}{%- set _flags = _flags + ['Lift Required'] -%}{%- endif -%}
    {%- if doc.cm_pickup_from_showroom -%}{%- set _flags = _flags + ['Pickup from Showroom'] -%}{%- endif -%}
    {%- if doc.cm_site_survey_required -%}{%- set _flags = _flags + ['Site Survey Required'] -%}{%- endif -%}
    {%- if _flags %}<tr><td class="lbl" style="white-space:nowrap">Delivery Notes</td><td>{{ _flags | join(' · ') }}</td></tr>{%- endif -%}
  </table>
</div>
{%- endif -%}
"""

_INSERT_BEFORE = '{%- set _has_schedule ='


def _ensure_check_field(dt: str, fieldname: str, label: str, insert_after: str) -> None:
    name = f"{dt}-{fieldname}"
    if frappe.db.exists("Custom Field", name):
        return
    cf = frappe.get_doc({
        "doctype": "Custom Field",
        "dt": dt,
        "fieldname": fieldname,
        "label": label,
        "fieldtype": "Check",
        "insert_after": insert_after,
    })
    cf.insert(ignore_permissions=True)


def execute():
    frappe.set_user("Administrator")

    # 1. Create cm_site_survey_required on Sales Order and Delivery Note
    for dt in ("Sales Order", "Delivery Note"):
        _ensure_check_field(
            dt,
            "cm_site_survey_required",
            "Site Survey Required",
            "cm_pickup_from_showroom",
        )

    frappe.db.commit()
    frappe.clear_cache(doctype="Sales Order")
    frappe.clear_cache(doctype="Delivery Note")

    # 2. Update the Sales Order print format
    if not frappe.db.exists("Print Format", _PF_NAME):
        return

    pf = frappe.get_doc("Print Format", _PF_NAME)
    html = pf.html or ""

    # Idempotency: skip if already applied
    if "cm_site_survey_required" in html:
        return

    if _INSERT_BEFORE not in html:
        return

    pf.html = html.replace(_INSERT_BEFORE, _DELIVERY_SNIPPET + _INSERT_BEFORE, 1)
    pf.save(ignore_permissions=True)
    frappe.db.commit()
