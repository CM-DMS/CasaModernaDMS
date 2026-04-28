"""
Patch: add payment schedule milestones section to CasaModerna Sales Order print format.

Shows Deposit on Order Confirmation / Due on Site Survey / Balance on Delivery
when any milestone amount is set on the SO.
"""
import frappe

_PF_NAME = "CasaModerna Sales Order"

_PAYMENT_SCHEDULE_SNIPPET = """\
{%- set _has_schedule = ((doc.cm_payment_on_order or 0)|float > 0) or ((doc.cm_payment_on_survey or 0)|float > 0) or ((doc.cm_payment_on_delivery or 0)|float > 0) -%}
{%- if _has_schedule -%}
<div class="pf-split">
  <h4>Payment Schedule</h4>
  <table style="width:auto;margin-left:auto">
    {%- if (doc.cm_payment_on_order or 0)|float > 0 -%}
    <tr>
      <td style="padding:3px 12px 3px 0;color:#555">Deposit on Order Confirmation</td>
      <td class="tr">{{ frappe.utils.fmt_money(doc.cm_payment_on_order, currency=doc.currency) }}</td>
    </tr>
    {%- endif -%}
    {%- if (doc.cm_payment_on_survey or 0)|float > 0 -%}
    <tr>
      <td style="padding:3px 12px 3px 0;color:#555">Due on Site Survey</td>
      <td class="tr">{{ frappe.utils.fmt_money(doc.cm_payment_on_survey, currency=doc.currency) }}</td>
    </tr>
    {%- endif -%}
    {%- if (doc.cm_payment_on_delivery or 0)|float > 0 -%}
    <tr style="font-weight:700">
      <td style="padding:3px 12px 3px 0">Balance on Delivery</td>
      <td class="tr">{{ frappe.utils.fmt_money(doc.cm_payment_on_delivery, currency=doc.currency) }}</td>
    </tr>
    {%- endif -%}
  </table>
</div>
{%- endif -%}
"""

# Insert before the customer-B split section (or before terms if no split)
_INSERT_BEFORE = '{%- if doc.cm_customer_b and'


def execute():
    if not frappe.db.exists("Print Format", _PF_NAME):
        return

    pf = frappe.get_doc("Print Format", _PF_NAME)
    html = pf.html or ""

    # Idempotency
    if "cm_payment_on_order" in html:
        return

    if _INSERT_BEFORE not in html:
        # Fallback: append before terms
        fallback = '{% if doc.terms %}'
        if fallback not in html:
            return
        pf.html = html.replace(fallback, _PAYMENT_SCHEDULE_SNIPPET + fallback, 1)
    else:
        pf.html = html.replace(_INSERT_BEFORE, _PAYMENT_SCHEDULE_SNIPPET + _INSERT_BEFORE, 1)

    pf.save(ignore_permissions=True)
    frappe.db.commit()
