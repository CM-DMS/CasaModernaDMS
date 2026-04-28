"""Patch: add prominent Delivery Requirements section to the CasaModerna Sales Order PDF.

Inserts a visually highlighted block before the Notes section showing:
  - PICKUP FROM SHOWROOM  (blue badge)  — when cm_pickup_from_showroom is checked
  - SITE SURVEY REQUIRED  (red badge)   — when cm_site_survey_required is checked

This supersedes the delivery-section update that was intended by slice040 but
could not be applied because its insertion marker (_has_schedule) did not exist
in the live print format at the time.
"""
import frappe

_PF_NAME = "CasaModerna Sales Order"

_INSERT_BEFORE = '<div class="pf-notes-wrap">'

_DELIVERY_FLAGS_SNIPPET = (
    '{%- if doc.cm_pickup_from_showroom or doc.cm_site_survey_required -%}'
    '<div style="margin-top:14px;padding:10px 14px;border:2px solid #e65100;background:#fff8e1;'
    'border-radius:4px;-webkit-print-color-adjust:exact;print-color-adjust:exact;page-break-inside:avoid">'
    '<div style="font-size:8pt;font-weight:700;color:#bf360c;text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px">'
    '&#9888; Delivery Requirements'
    '</div>'
    '{%- if doc.cm_pickup_from_showroom -%}'
    '<div style="margin:4px 0;padding:5px 14px;background:#1565c0;color:#fff;font-weight:700;'
    'font-size:9.5pt;border-radius:3px;-webkit-print-color-adjust:exact;print-color-adjust:exact">'
    '&#9654;&nbsp; PICKUP FROM SHOWROOM'
    '</div>'
    '{%- endif -%}'
    '{%- if doc.cm_site_survey_required -%}'
    '<div style="margin:4px 0;padding:5px 14px;background:#c62828;color:#fff;font-weight:700;'
    'font-size:9.5pt;border-radius:3px;-webkit-print-color-adjust:exact;print-color-adjust:exact">'
    '&#9654;&nbsp; SITE SURVEY REQUIRED'
    '</div>'
    '{%- endif -%}'
    '</div>'
    '{%- endif -%}'
)


def execute():
    frappe.set_user("Administrator")

    if not frappe.db.exists("Print Format", _PF_NAME):
        return

    pf = frappe.get_doc("Print Format", _PF_NAME)
    html = pf.html or ""

    # Idempotency — skip if already applied
    if "cm_pickup_from_showroom_badge" in html or "PICKUP FROM SHOWROOM" in html:
        return

    if _INSERT_BEFORE not in html:
        frappe.log_error(
            f"slice045: could not find insertion point '{_INSERT_BEFORE}' in {_PF_NAME}",
            "Patch Warning",
        )
        return

    pf.html = html.replace(_INSERT_BEFORE, _DELIVERY_FLAGS_SNIPPET + _INSERT_BEFORE, 1)
    pf.save(ignore_permissions=True)
    frappe.db.commit()
