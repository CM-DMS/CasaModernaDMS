"""
Patch: Standardise item table columns in all customer-facing CasaModerna print formats.

Target column layout:
  # | Item (3-line) | Qty | UOM | Unit RRP | Disc% | Offer Price | Total

Item cell:
  - Bold:  item_name || item_code
  - Line 1 (grey small): first \n-segment of description
  - Line 2 (lighter):    second \n-segment of description

Pricing:
  - Unit RRP    = cm_rrp_inc_vat
  - Disc%       = cm_effective_discount_percent
  - Offer Price = rate  (unit price after discount)
  - Total       = amount

Delivery Note is internal-use and is intentionally excluded.
"""
from __future__ import annotations
import re
import frappe


# ── CSS additions (appended to existing <style> block) ─────────────────────
ITEMS_CSS = (
    ".pf-items th{background:#339966;color:#fff;padding:5px 7px;text-align:left;"
    "font-size:8.5pt;font-weight:700}\n"
    ".pf-items td{padding:4px 7px;font-size:9pt;border-bottom:1px solid #e8e8e8;"
    "vertical-align:top}\n"
    ".pf-items tr:nth-child(even) td{background:#f7f7f7}\n"
    ".desc1{font-size:7.5pt;color:#777;margin-top:1px}\n"
    ".desc2{font-size:7pt;color:#aaa;margin-top:1px}\n"
)

# ── New item table header ───────────────────────────────────────────────────
ITEMS_THEAD = (
    '<table class="pf-items">\n'
    '  <thead><tr>\n'
    '    <th style="width:4%">#</th>\n'
    '    <th>Item</th>\n'
    '    <th class="tr" style="width:10%">Qty</th>\n'
    '    <th class="tr" style="width:7%">UOM</th>\n'
    '    <th class="tr" style="width:10%">Unit RRP</th>\n'
    '    <th class="tr" style="width:8%">Disc%</th>\n'
    '    <th class="tr" style="width:12%">Offer Price</th>\n'
    '    <th class="tr" style="width:12%">Total</th>\n'
    '  </tr></thead>\n'
)

# ── New item row template (Jinja2) ──────────────────────────────────────────
# We replace the <tbody>...</tbody> content for the items loop.
ITEMS_TBODY = (
    '  <tbody>\n'
    '  {%- for r in doc.items -%}\n'
    '  {%- set _is_ph = (r.item_code in _ph) -%}\n'
    '  <tr>\n'
    '    <td>{{ r.idx }}</td>\n'
    '    <td>\n'
    '      {%- if _is_ph -%}\n'
    '        {{ (r.description or "")|replace("\\n","<br>")|safe }}\n'
    '      {%- else -%}\n'
    '        <strong>{{ r.item_name or r.item_code }}</strong>\n'
    '        {%- set _lines = (r.description or "").split("\\n") -%}\n'
    '        {%- if _lines|length > 0 and _lines[0].strip() -%}\n'
    '          <div class="desc1">{{ _lines[0].strip() }}</div>\n'
    '        {%- endif -%}\n'
    '        {%- if _lines|length > 1 and _lines[1].strip() -%}\n'
    '          <div class="desc2">{{ _lines[1].strip() }}</div>\n'
    '        {%- endif -%}\n'
    '      {%- endif -%}\n'
    '    </td>\n'
    '    <td class="tr">\n'
    '      {%- set _sqm = (r.cm_tile_sqm_qty if r.cm_tile_sqm_qty is not none else r.cm_display_sqm_qty) -%}\n'
    '      {%- if r.cm_pricing_rounding_mode == "tile_decimal_pricing" and _sqm is not none -%}\n'
    '        {{ "%.2f"|format(_sqm|float) }} sqm\n'
    '      {%- else -%}\n'
    '        {{ r.qty }}\n'
    '      {%- endif -%}\n'
    '    </td>\n'
    '    <td class="tr">{{ r.uom or "" }}</td>\n'
    '    <td class="tr">{{ frappe.utils.fmt_money(r.cm_rrp_inc_vat, currency=doc.currency) if r.cm_rrp_inc_vat else "&mdash;" }}</td>\n'
    '    <td class="tr">{{ frappe.utils.ceil(((r.cm_effective_discount_percent if r.cm_effective_discount_percent is not none else r.discount_percentage) or 0)|float) }}%</td>\n'
    '    <td class="tr">{{ r.get_formatted("rate", doc) }}</td>\n'
    '    <td class="tr">{{ r.get_formatted("amount", doc) }}</td>\n'
    '  </tr>\n'
    '  {%- endfor -%}\n'
    '  </tbody>\n'
    '</table>\n'
)

# Ensure _ph placeholder set is always defined before the table
_PH_SET = '{%- set _ph = ["CM-FREETEXT","CM-DELIVERY","CM-DELIVERY_GOZO","CM-LIFTER","CM-INSTALLATION"] -%}\n'

FULL_ITEMS_TABLE = _PH_SET + ITEMS_THEAD + ITEMS_TBODY


def _patch_html(html: str) -> str | None:
    """
    Replace the existing pf-items table with the new column layout.
    Returns new HTML or None if nothing changed.
    """
    # 1. Inject CSS classes if not already present
    if '.desc1{' not in html:
        html = html.replace('</style>', ITEMS_CSS + '</style>', 1)

    # 2. Replace the items table — matches both pf-items and Bootstrap table-bordered styles
    new_html = re.sub(
        r'<table class="(?:pf-items|table table-bordered)">.*?</table>',
        FULL_ITEMS_TABLE,
        html,
        count=1,
        flags=re.DOTALL,
    )

    return new_html if new_html != html else None


# Customer-facing formats only — Delivery Note excluded (internal)
TARGET_FORMATS = [
    'CasaModerna Quotation',
    'CasaModerna Sales Order',
    'CasaModerna Sales Invoice',
    'CasaModerna Proforma',
    'CasaModerna POS Invoice',
]


def execute():
    frappe.set_user('Administrator')
    results = []

    for name in TARGET_FORMATS:
        if not frappe.db.exists('Print Format', name):
            results.append({'name': name, 'status': 'not_found'})
            continue

        pf = frappe.get_doc('Print Format', name)
        if not pf.html:
            results.append({'name': name, 'status': 'no_html'})
            continue

        new_html = _patch_html(pf.html)
        if new_html is None:
            results.append({'name': name, 'status': 'no_change'})
        else:
            pf.html = new_html
            pf.save(ignore_permissions=True)
            results.append({'name': name, 'status': 'updated'})

    frappe.db.commit()
    return results
