from __future__ import annotations

import frappe


FINAL_HTML = """<style>
body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #222; }
.pf-brand { background: #1f5a41; color: #fff; padding: 12px 14px; margin-bottom: 12px; }
.pf-brand-title { font-size: 16pt; font-weight: 700; letter-spacing: 0.05em; }
.pf-brand-sub { font-size: 9pt; opacity: 0.95; margin-top: 2px; }
.pf-head { display: table; width: 100%; margin-bottom: 16px; border-bottom: 2px solid #222; padding-bottom: 8px; }
.pf-left, .pf-right { display: table-cell; vertical-align: top; }
.pf-right { text-align: right; }
.pf-title { font-size: 17pt; font-weight: 700; letter-spacing: 0.03em; }
.pf-sub { font-size: 8.5pt; color: #666; margin-top: 2px; }
.pf-block { margin: 12px 0; }
.pf-label { font-size: 8pt; text-transform: uppercase; color: #666; margin-bottom: 3px; font-weight: 700; }
.pf-value { font-size: 10pt; }
.pf-grid { display: table; width: 100%; margin-bottom: 16px; }
.pf-col { display: table-cell; vertical-align: top; width: 50%; padding-right: 16px; }
.pf-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
.pf-table th { border-bottom: 1.5px solid #222; padding: 7px 6px; font-size: 8.5pt; text-transform: uppercase; text-align: left; }
.pf-table td { border-bottom: 1px solid #ddd; padding: 7px 6px; vertical-align: top; font-size: 9pt; }
.tr { text-align: right; white-space: nowrap; }
.pf-muted { color: #666; }
.pf-totals { width: 320px; margin-left: auto; margin-top: 14px; border-collapse: collapse; }
.pf-totals td { padding: 6px 8px; border-bottom: 1px solid #ddd; }
.pf-grand td { font-weight: 700; border-top: 1.5px solid #222; border-bottom: 1.5px solid #222; }
</style>

{% set company_address = frappe.db.get_value('Address', doc.company_address, 'display') if doc.company_address else '' %}

<div class='pf-brand'>
  <div class='pf-brand-title'>CASA MODERNA LIMITED</div>
  <div class='pf-brand-sub'>Mdina Road, Zebbug ZBG 9014, Malta</div>
</div>

<div class='pf-head'>
  <div class='pf-left'>
    <div class='pf-title'>PURCHASE ORDER</div>
    <div class='pf-sub'>{{ doc.name }}</div>
  </div>
  <div class='pf-right'>
    <div class='pf-sub'>Date: {{ doc.get_formatted('transaction_date') }}</div>
    {% if doc.schedule_date %}<div class='pf-sub'>Required By: {{ doc.get_formatted('schedule_date') }}</div>{% endif %}
  </div>
</div>

<div class='pf-grid'>
  <div class='pf-col'>
    <div class='pf-block'>
      <div class='pf-label'>Supplier</div>
      <div class='pf-value'>{{ doc.supplier_name or doc.supplier or '' }}</div>
      {% if doc.address_display %}<div class='pf-value pf-muted'>{{ doc.address_display }}</div>{% endif %}
      {% if doc.contact_display %}<div class='pf-value pf-muted'>{{ doc.contact_display }}</div>{% endif %}
    </div>
  </div>
  <div class='pf-col'>
    {% if doc.company %}
    <div class='pf-block'>
      <div class='pf-label'>Company</div>
      <div class='pf-value'>{{ doc.company }}</div>
      {% if company_address %}<div class='pf-value pf-muted'>{{ company_address }}</div>{% endif %}
    </div>
    {% endif %}
  </div>
</div>

<table class='pf-table'>
  <thead>
    <tr>
      <th style='width:4%'>#</th>
      <th style='width:16%'>Product Code</th>
      <th style='width:24%'>Item</th>
      <th>Description</th>
      <th class='tr' style='width:9%'>Qty</th>
      <th class='tr' style='width:10%'>UOM</th>
      <th class='tr' style='width:12%'>Rate</th>
      <th class='tr' style='width:12%'>Amount</th>
    </tr>
  </thead>
  <tbody>
    {% for row in doc.items %}
    <tr>
      <td>{{ row.idx }}</td>
      <td>{{ row.item_code or '' }}</td>
      <td>{{ row.item_name or '' }}</td>
      <td>{{ frappe.utils.strip_html(row.description or '') }}</td>
      <td class='tr'>{{ row.qty }}</td>
      <td class='tr'>{{ row.uom or row.stock_uom or '' }}</td>
      <td class='tr'>{{ row.get_formatted('rate', doc) }}</td>
      <td class='tr'>{{ row.get_formatted('amount', doc) }}</td>
    </tr>
    {% endfor %}
  </tbody>
</table>

<table class='pf-totals'>
  <tr><td>Total Qty</td><td class='tr'>{{ doc.total_qty }}</td></tr>
  <tr class='pf-grand'><td>Grand Total</td><td class='tr'>{{ doc.get_formatted('grand_total') }}</td></tr>
</table>

{% if doc.notes %}
<div class='pf-block'>
  <div class='pf-label'>Notes</div>
  <div class='pf-value'>{{ frappe.utils.strip_html(doc.notes) }}</div>
</div>
{% endif %}
"""


INQUIRY_HTML = """<style>
body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #222; }
.pf-brand { background: #1f5a41; color: #fff; padding: 12px 14px; margin-bottom: 12px; }
.pf-brand-title { font-size: 16pt; font-weight: 700; letter-spacing: 0.05em; }
.pf-brand-sub { font-size: 9pt; opacity: 0.95; margin-top: 2px; }
.pf-head { display: table; width: 100%; margin-bottom: 16px; border-bottom: 2px solid #222; padding-bottom: 8px; }
.pf-left, .pf-right { display: table-cell; vertical-align: top; }
.pf-right { text-align: right; }
.pf-title { font-size: 17pt; font-weight: 700; letter-spacing: 0.03em; }
.pf-sub { font-size: 8.5pt; color: #666; margin-top: 2px; }
.pf-block { margin: 12px 0; }
.pf-label { font-size: 8pt; text-transform: uppercase; color: #666; margin-bottom: 3px; font-weight: 700; }
.pf-value { font-size: 10pt; }
.pf-grid { display: table; width: 100%; margin-bottom: 16px; }
.pf-col { display: table-cell; vertical-align: top; width: 50%; padding-right: 16px; }
.pf-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
.pf-table th { border-bottom: 1.5px solid #222; padding: 7px 6px; font-size: 8.5pt; text-transform: uppercase; text-align: left; }
.pf-table td { border-bottom: 1px solid #ddd; padding: 7px 6px; vertical-align: top; font-size: 9pt; }
.tr { text-align: right; white-space: nowrap; }
.pf-muted { color: #666; }
</style>

{% set company_address = frappe.db.get_value('Address', doc.company_address, 'display') if doc.company_address else '' %}

<div class='pf-brand'>
  <div class='pf-brand-title'>CASA MODERNA LIMITED</div>
  <div class='pf-brand-sub'>Mdina Road, Zebbug ZBG 9014, Malta</div>
</div>

<div class='pf-head'>
  <div class='pf-left'>
    <div class='pf-title'>PURCHASE INQUIRY</div>
    <div class='pf-sub'>{{ doc.name }}</div>
  </div>
  <div class='pf-right'>
    <div class='pf-sub'>Date: {{ doc.get_formatted('transaction_date') }}</div>
    {% if doc.schedule_date %}<div class='pf-sub'>Required By: {{ doc.get_formatted('schedule_date') }}</div>{% endif %}
  </div>
</div>

<div class='pf-grid'>
  <div class='pf-col'>
    <div class='pf-block'>
      <div class='pf-label'>Supplier</div>
      <div class='pf-value'>{{ doc.supplier_name or doc.supplier or '' }}</div>
      {% if doc.address_display %}<div class='pf-value pf-muted'>{{ doc.address_display }}</div>{% endif %}
      {% if doc.contact_display %}<div class='pf-value pf-muted'>{{ doc.contact_display }}</div>{% endif %}
    </div>
  </div>
  <div class='pf-col'>
    {% if doc.company %}
    <div class='pf-block'>
      <div class='pf-label'>Company</div>
      <div class='pf-value'>{{ doc.company }}</div>
      {% if company_address %}<div class='pf-value pf-muted'>{{ company_address }}</div>{% endif %}
    </div>
    {% endif %}
  </div>
</div>

<table class='pf-table'>
  <thead>
    <tr>
      <th style='width:4%'>#</th>
      <th style='width:18%'>Product Code</th>
      <th style='width:26%'>Item</th>
      <th>Description</th>
      <th class='tr' style='width:10%'>Qty</th>
      <th class='tr' style='width:11%'>UOM</th>
    </tr>
  </thead>
  <tbody>
    {% for row in doc.items %}
    <tr>
      <td>{{ row.idx }}</td>
      <td>{{ row.item_code or '' }}</td>
      <td>{{ row.item_name or '' }}</td>
      <td>{{ frappe.utils.strip_html(row.description or '') }}</td>
      <td class='tr'>{{ row.qty }}</td>
      <td class='tr'>{{ row.uom or row.stock_uom or '' }}</td>
    </tr>
    {% endfor %}
  </tbody>
</table>

{% if doc.notes %}
<div class='pf-block'>
  <div class='pf-label'>Notes</div>
  <div class='pf-value'>{{ frappe.utils.strip_html(doc.notes) }}</div>
</div>
{% endif %}
"""


def _upsert_print_format(name: str, html: str):
    values = {
        "doctype": "Print Format",
        "name": name,
        "doc_type": "Purchase Order",
        "module": "Buying",
        "custom_format": 1,
        "disabled": 0,
        "print_format_type": "Jinja",
        "print_format_builder": 0,
        "print_format_builder_beta": 0,
        "print_format_for": "DocType",
        "raw_printing": 0,
        "show_section_headings": 0,
        "line_breaks": 0,
        "absolute_value": 0,
        "align_labels_right": 0,
        "font_size": 0,
        "page_number": "Hide",
        "pdf_generator": "wkhtmltopdf",
        "standard": "No",
        "html": html,
    }

    if frappe.db.exists("Print Format", name):
        doc = frappe.get_doc("Print Format", name)
        for key, value in values.items():
            setattr(doc, key, value)
        doc.save(ignore_permissions=True)
    else:
        doc = frappe.get_doc(values)
        doc.insert(ignore_permissions=True)


def execute():
    _upsert_print_format("CasaModerna Purchase Order", FINAL_HTML)
    _upsert_print_format("CasaModerna Purchase Order Inquiry", INQUIRY_HTML)
    frappe.db.set_value("DocType", "Purchase Order", "default_print_format", "CasaModerna Purchase Order")
    frappe.clear_cache(doctype="Print Format")
    frappe.clear_cache(doctype="DocType")
