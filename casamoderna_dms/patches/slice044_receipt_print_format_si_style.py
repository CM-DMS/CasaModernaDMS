"""
Patch slice044: Rewrite CasaModerna Receipt print format to match SI visual style.

Brings the Receipt into parity with CasaModerna Sales Invoice:
- Same CSS (pf-docmeta-table, large logo at 88px, company name, etc.)
- Header: logo + company block left, metadata table right
- Content: payment purpose box, green AMOUNT RECEIVED total box,
  linked references table, clearance notice (Bank Transfer / Cheque / Revolut)
- Footer: matching SI footer with IBAN details
"""
from __future__ import annotations
import base64
import frappe


_HTML_TEMPLATE = """\
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#222;line-height:1.45;margin-top:0;padding-top:0}
.pf-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #339966;padding-bottom:3px;margin-bottom:14px}
.pf-company{display:flex;flex-direction:column;align-items:flex-start;gap:6px}
.pf-logo{height:88px;max-width:380px;object-fit:contain}
.pf-company-name{font-size:16pt;font-weight:700;color:#339966}
.pf-company-addr{font-size:8pt;color:#555;margin-top:2px}
.pf-company-vat{font-size:8pt;color:#888;margin-top:1px}
.pf-docbox{text-align:right}
.pf-doctype{font-size:16pt;font-weight:700;color:#339966;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px}
.pf-docmeta-table{font-size:8.5pt;color:#666;margin-left:auto;border-collapse:collapse;width:auto;border-spacing:0}
.pf-docmeta-table tr{height:1px}
.pf-docmeta-table td{padding:0 0 0 12px;white-space:nowrap;line-height:1.6;font-size:8.5pt}
.pf-docmeta-table .lbl{color:#999;text-align:left;padding-right:8px}
.pf-docmeta-table .val{font-weight:600;color:#222;text-align:right}
.pf-purpose{margin:16px 0;padding:10px 14px;background:#f0f9f4;border-left:4px solid #339966;border-radius:2px}
.pf-purpose-label{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#339966}
.pf-purpose-value{font-size:11pt;font-weight:700;color:#222;margin-top:2px}
table{width:100%;border-collapse:collapse}
.pf-items{margin-bottom:10px}
.pf-items th{background:#339966;color:#fff;padding:5px 7px;text-align:left;font-size:8.5pt;font-weight:700}
.pf-items td{padding:4px 7px;font-size:9pt;border-bottom:1px solid #e8e8e8;vertical-align:top}
.pf-items td.tr{white-space:nowrap}
.pf-items tr:nth-child(even) td{background:#f7f7f7}
.pf-total-box{background:#339966;color:#fff;border-radius:3px;padding:10px 14px;margin:16px 0;display:flex;justify-content:space-between;align-items:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pf-total-label{font-size:10pt;font-weight:700;letter-spacing:1px;color:#fff!important}
.pf-total-right{text-align:right}
.pf-total-amount{font-size:13pt;font-weight:700;color:#fff!important}
.pf-clearance{margin-top:14px;padding:10px 12px;border-left:3px solid #e6990a;background:#fffbe6;font-size:8.5pt;color:#555;line-height:1.5}
.pf-footer{margin-top:20px;padding-top:7px;border-top:1px solid #c8e6c9;display:flex;justify-content:space-between;font-size:7pt;color:#888;line-height:1.6}
.pf-footer-right{text-align:right}
.tr{text-align:right!important}
#toolbar,.print-toolbar{display:none!important}
</style>

<div class="pf-head">
  <div class="pf-company">
    <img src="__LOGO__" alt="Casa Moderna" class="pf-logo">
    <div>
      <div class="pf-company-name">Casa Moderna Ltd</div>
      <div class="pf-company-addr">Mdina Road, Zebbug ZBG 9014</div>
      <div class="pf-company-vat">VAT: MT29516422</div>
    </div>
  </div>
  <div class="pf-docbox">
    <div class="pf-doctype">Receipt</div>
    <table class="pf-docmeta-table">
      <tr><td class="lbl">Document No</td><td class="val">{{ doc.cm_v1_operational_no or doc.cm_v1_draft_no or doc.name }}</td></tr>
      <tr><td class="lbl">Date</td><td class="val">{{ doc.get_formatted('posting_date') }}</td></tr>
      <tr><td class="lbl">Customer</td><td class="val">{{ doc.party_name or doc.party or '' }}</td></tr>
      <tr><td class="lbl">Mode of Payment</td><td class="val">{{ doc.mode_of_payment or '' }}</td></tr>
      {%- if doc.reference_no and doc.reference_no != doc.posting_date | string -%}
      <tr><td class="lbl">Bank / Card Ref</td><td class="val">{{ doc.reference_no }}</td></tr>
      {%- endif -%}
    </table>
  </div>
</div>

{%- if doc.cm_payment_purpose %}
<div class="pf-purpose">
  <div class="pf-purpose-label">Payment Type</div>
  <div class="pf-purpose-value">{{ doc.cm_payment_purpose }}</div>
</div>
{%- endif %}

<div class="pf-total-box">
  <span class="pf-total-label">AMOUNT RECEIVED</span>
  <div class="pf-total-right">
    <div class="pf-total-amount">{{ doc.get_formatted('paid_amount') }}</div>
  </div>
</div>

{%- set linked = doc.references %}
{%- if linked %}
<table class="pf-items" style="margin-top:14px">
  <thead>
    <tr>
      <th>Linked Document</th>
      <th>Type</th>
      <th style="text-align:right">Applied Amount</th>
    </tr>
  </thead>
  <tbody>
    {%- for ref in linked %}
    <tr>
      <td><strong>{{ ref.reference_name }}</strong></td>
      <td>{{ ref.reference_doctype }}</td>
      <td class="tr">{{ frappe.utils.fmt_money(ref.allocated_amount, currency=doc.paid_to_account_currency or 'EUR') }}</td>
    </tr>
    {%- endfor %}
  </tbody>
</table>
{%- elif doc.remarks and not doc.remarks.startswith('Amount EUR') %}
<p style="margin-top:8px;font-size:9pt;color:#555"><em>{{ doc.remarks }}</em></p>
{%- endif %}

{%- if doc.mode_of_payment in ['Bank Transfer', 'Cheque', 'Revolut'] %}
<div class="pf-clearance">
  <strong style="color:#7a5c00;">&#9888; Payment Clearance Notice</strong><br>
  {{ doc.mode_of_payment }} payments are subject to clearance. This receipt is only a valid document once funds are fully cleared. Ownership of goods is only transferred once funds are fully cleared.
</div>
{%- endif %}

<div class="pf-footer">
  <div>Casa Moderna Ltd<br>Mdina Road, Zebbug, ZBG 9014<br>VAT: MT29516422</div>
  <div class="pf-footer-right">IBAN: MT21VALL22013000000050018983641<br>BIC/SWIFT: VALLMTMT<br>Payable to: Casa Moderna Ltd</div>
</div>
"""


def execute():
    frappe.set_user("Administrator")

    if not frappe.db.exists("Print Format", "CasaModerna Receipt"):
        frappe.logger().warning("slice044: CasaModerna Receipt not found — skipping")
        return

    logo_path = frappe.get_site_path("public", "files", "cm-logo-print.png")
    with open(logo_path, "rb") as fh:
        logo_data_url = "data:image/png;base64," + base64.b64encode(fh.read()).decode()

    new_html = _HTML_TEMPLATE.replace("__LOGO__", logo_data_url)

    pf = frappe.get_doc("Print Format", "CasaModerna Receipt")
    pf.html = new_html
    pf.save(ignore_permissions=True)
    frappe.db.commit()

    frappe.logger().info("slice044: CasaModerna Receipt updated to SI-style layout")
