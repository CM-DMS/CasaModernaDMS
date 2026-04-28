"""
Patch: Sales Invoice print format improvements.

1. Add cm_payment_on_order and cm_payment_on_delivery currency fields to Sales Invoice
   so deposit/balance amounts can be stored and printed on the invoice.

2. Update CasaModerna Sales Invoice print format:
   - Change title from "Tax Invoice" -> "Invoice"
   - Add "Deposit Paid" row and "Balance Due" highlighted box below the TOTAL box
     whenever a deposit amount (cm_payment_on_order) is set.
"""
import frappe

_FIELDS = [
    # (fieldname, label, insert_after)
    ("cm_payment_on_order",    "Deposit on Order Confirmation", "cm_sales_person"),
    ("cm_payment_on_delivery", "Balance Due on Delivery",       "cm_payment_on_order"),
]

_PF_NAME = "CasaModerna Sales Invoice"

# ── Balance Due snippet (inserted inside pf-totals-right, after pf-total-box) ──
_BALANCE_DUE_SNIPPET = """\
{%- set _dep = (doc.cm_payment_on_order or 0)|float -%}
{%- if _dep > 0 -%}
<table class="pf-subtotals" style="margin-top:4px">
  <tr>
    <td class="lbl" style="font-weight:600">Deposit Paid on Order</td>
    <td class="tr" style="font-weight:600">&minus; {{ frappe.utils.fmt_money(doc.cm_payment_on_order, currency=doc.currency) }}</td>
  </tr>
</table>
<div style="background:#1b5e20;color:#fff;border-radius:3px;padding:7px 12px;margin-top:6px;display:flex;justify-content:space-between;align-items:center;-webkit-print-color-adjust:exact;print-color-adjust:exact">
  <span style="font-size:10pt;font-weight:700;letter-spacing:1px;color:#fff">BALANCE DUE</span>
  <div style="text-align:right">
    <div style="font-size:13pt;font-weight:700;color:#fff">{{ frappe.utils.fmt_money(doc.grand_total - _dep, currency=doc.currency) }}</div>
    <div style="font-size:7pt;opacity:.85;color:#fff">On Delivery</div>
  </div>
</div>
{%- endif -%}"""

# Anchor: closing of pf-total-box then pf-totals-right then pf-totals-area,
# immediately before the customer-B split section.
_ANCHOR = '    </div>\n  </div>\n</div>\n{%- if doc.cm_customer_b and'
_ANCHOR_REPLACEMENT = (
    '    </div>\n'
    + _BALANCE_DUE_SNIPPET
    + '\n  </div>\n</div>\n{%- if doc.cm_customer_b and'
)


def _ensure_custom_field(dt, fieldname, label, insert_after):
    field_id = f"{dt}-{fieldname}"
    if frappe.db.exists("Custom Field", field_id):
        return
    frappe.set_user("Administrator")
    cf = frappe.new_doc("Custom Field")
    cf.dt = dt
    cf.fieldname = fieldname
    cf.label = label
    cf.fieldtype = "Currency"
    cf.options = "currency"
    cf.read_only = 0
    cf.no_copy = 0
    cf.in_list_view = 0
    cf.insert_after = insert_after
    cf.save()


def execute():
    # 1. Add custom fields to Sales Invoice
    if frappe.db.exists("DocType", "Sales Invoice"):
        for fieldname, label, insert_after in _FIELDS:
            _ensure_custom_field("Sales Invoice", fieldname, label, insert_after)

    # 2. Update the print format
    if not frappe.db.exists("Print Format", _PF_NAME):
        frappe.db.commit()
        return

    pf = frappe.get_doc("Print Format", _PF_NAME)
    html = pf.html or ""
    changed = False

    # 2a. "Tax Invoice" → "Invoice"
    old_title = '<div class="pf-doctype">Tax Invoice</div>'
    new_title = '<div class="pf-doctype">Invoice</div>'
    if old_title in html:
        html = html.replace(old_title, new_title, 1)
        changed = True

    # 2b. Balance Due section (idempotency: skip if already present)
    if "BALANCE DUE" not in html and _ANCHOR in html:
        html = html.replace(_ANCHOR, _ANCHOR_REPLACEMENT, 1)
        changed = True

    if changed:
        pf.html = html
        pf.save(ignore_permissions=True)

    frappe.db.commit()
