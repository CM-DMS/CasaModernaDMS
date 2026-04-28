"""
Patch: add deposit / balance section to CasaModerna Sales Order print format.

Inserts after the grand total row:
  - Deposit Paid  (advance_paid)
  - Balance Due   (grand_total - advance_paid)

Only shown when advance_paid > 0 on the printed SO.
"""
import frappe

_GRAND_TOTAL_MARKER = '<tr class="pf-tot-grand"><td>Grand Total</td>'
_DEPOSIT_SNIPPET = """\
      <tr class="pf-tot-grand"><td>Grand Total</td><td class="tr">{{ doc.get_formatted('grand_total') }}</td></tr>
      {%- if doc.advance_paid and (doc.advance_paid|float) > 0 -%}
      <tr><td class="lbl">Deposit Paid</td><td class="tr">{{ doc.get_formatted('advance_paid') }}</td></tr>
      <tr style="font-weight:700;color:#339966"><td>Balance Due</td><td class="tr">{{ frappe.utils.fmt_money((doc.grand_total|float) - (doc.advance_paid|float), currency=doc.currency) }}</td></tr>
      {%- endif -%}"""

_PF_NAME = "CasaModerna Sales Order"

_OLD_GRAND_TOTAL_ROW = '<tr class="pf-tot-grand"><td>Grand Total</td><td class="tr">{{ doc.get_formatted(\'grand_total\') }}</td></tr>'


def execute():
    if not frappe.db.exists("Print Format", _PF_NAME):
        return

    pf = frappe.get_doc("Print Format", _PF_NAME)
    html = pf.html or ""

    # Idempotency: skip if already patched
    if "advance_paid" in html and "Balance Due" in html:
        return

    if _OLD_GRAND_TOTAL_ROW not in html:
        # Marker not found — skip rather than corrupt
        return

    pf.html = html.replace(_OLD_GRAND_TOTAL_ROW, _DEPOSIT_SNIPPET, 1)
    pf.save(ignore_permissions=True)
    frappe.db.commit()
