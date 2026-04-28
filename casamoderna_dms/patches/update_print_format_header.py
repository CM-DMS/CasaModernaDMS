"""
Patch: Bring V2 PDF header to V1 parity for all customer-facing print formats.

Changes per format:
  LEFT  — salesperson name, phone, email (below company VAT line)
  RIGHT — customer code, salesperson name, Valid Until as a green badge

Delivery Note excluded (internal use).
"""
from __future__ import annotations
import frappe


# ── New CSS additions ───────────────────────────────────────────────────────
HEADER_CSS = (
    ".pf-valid-badge{display:inline-block;margin-top:6px;background:#339966;"
    "color:#fff;border-radius:12px;padding:2px 10px;font-size:8pt;font-weight:700}\n"
)

# ── Jinja2 snippet: salesperson block (inserted into pf-company left side) ─
SALESPERSON_LEFT = (
    '{%- if doc.sales_team and doc.sales_team|length > 0 -%}'
    '{%- set _sp_name = doc.sales_team[0].sales_person -%}'
    '{%- set _sp_user = frappe.db.get_value("User", {"full_name": _sp_name}, '
    '["mobile_no", "email"], as_dict=1) or {} -%}'
    '<div class="pf-salesperson">'
    '<strong>{{ _sp_name }}</strong>'
    '{%- if _sp_user.mobile_no -%}<br>Phone: {{ _sp_user.mobile_no }}{%- endif -%}'
    '{%- if _sp_user.email -%}<br>Email: {{ _sp_user.email }}{%- endif -%}'
    '</div>'
    '{%- endif -%}'
)

# ── Per-format right-side docbox replacements ───────────────────────────────
# Keyed by format name. Each value is the full new pf-docbox div string.

def _docbox(doctype_label: str, date_expr: str, extra_meta: str = '', valid_expr: str = '') -> str:
    """Build a pf-docbox div.

    date_expr   — Jinja2 expression for the main date field
    extra_meta  — optional extra pf-docmeta lines (already formatted HTML)
    valid_expr  — Jinja2 block for valid-until badge (empty string = omit)
    """
    return (
        '<div class="pf-docbox">'
        f'<div class="pf-doctype">{doctype_label}</div>'
        '<div class="pf-docno">{{ doc.name }}</div>'
        '{%- if doc.cm_v1_draft_no -%}<div class="pf-docmeta">V1 Draft: {{ doc.cm_v1_draft_no }}</div>{%- endif -%}'
        '{%- if doc.cm_v1_operational_no -%}<div class="pf-docmeta">V1 Ref: {{ doc.cm_v1_operational_no }}</div>{%- endif -%}'
        f'<div class="pf-docmeta">Date: {date_expr}</div>'
        '<div class="pf-docmeta">Customer: {{ doc.customer or doc.party_name }}</div>'
        '{%- if doc.sales_team and doc.sales_team|length > 0 -%}'
        '<div class="pf-docmeta">Salesperson: {{ doc.sales_team[0].sales_person }}</div>'
        '{%- endif -%}'
        + extra_meta
        + valid_expr
        + '</div>'
    )


DATE_ADAPTIVE = '{{ doc.get_formatted("transaction_date" if doc.transaction_date is defined else "posting_date") }}'
DATE_POSTING  = '{{ doc.get_formatted("posting_date") }}'
VALID_TILL    = (
    '{%- if doc.valid_till -%}'
    '<div class="pf-valid-badge">Valid until {{ doc.get_formatted("valid_till") }}</div>'
    '{%- endif -%}'
)
DELIVERY_DATE = (
    '{%- if doc.delivery_date -%}'
    '<div class="pf-docmeta">Delivery: End of {{ doc.delivery_date.strftime("%B %Y") }}</div>'
    '{%- endif -%}'
)

DOCBOXES = {
    'CasaModerna Quotation':    _docbox('Quotation',    DATE_ADAPTIVE, valid_expr=VALID_TILL),
    'CasaModerna Sales Order':  _docbox('Sales Order',  DATE_ADAPTIVE, extra_meta=DELIVERY_DATE),
    'CasaModerna Sales Invoice':_docbox('Sales Invoice',DATE_POSTING),
    'CasaModerna Proforma':     _docbox('Proforma',     DATE_ADAPTIVE, valid_expr=VALID_TILL),
    'CasaModerna POS Invoice':  _docbox('POS Invoice',  DATE_POSTING),
}


# ── HTML manipulation helpers ───────────────────────────────────────────────

def _find_div_end(html: str, start: int) -> int:
    """Return the index immediately after the closing </div> of the div starting at `start`."""
    depth = 0
    i = start
    while i < len(html):
        if html[i:i+4] == '<div':
            depth += 1
            i += 4
        elif html[i:i+6] == '</div>':
            depth -= 1
            i += 6
            if depth == 0:
                return i
        else:
            i += 1
    return -1


def _replace_div_class(html: str, class_name: str, new_div: str) -> str:
    """Replace the first <div class="class_name">...</div> with new_div."""
    marker = f'<div class="{class_name}">'
    start = html.find(marker)
    if start == -1:
        return html
    end = _find_div_end(html, start)
    if end == -1:
        return html
    return html[:start] + new_div + html[end:]


def _inject_salesperson_left(html: str) -> str:
    """Insert the salesperson Jinja2 block just before the closing of the inner
    company info div (after the VAT line)."""
    needle = '<div class="pf-company-vat">VAT Reg No: MT29516422</div>'
    if needle not in html:
        return html
    # Insert SALESPERSON_LEFT between the VAT line and its two closing </div> tags
    return html.replace(
        needle + '</div></div>',
        needle + SALESPERSON_LEFT + '</div></div>',
        1,
    )


def _patch_html(html: str, new_docbox: str) -> str | None:
    changed = False

    # 1. CSS
    if '.pf-valid-badge{' not in html:
        html = html.replace('</style>', HEADER_CSS + '</style>', 1)
        changed = True

    # 2. Salesperson contact on left side
    if 'pf-salesperson' not in html or '_sp_user' not in html:
        new_html = _inject_salesperson_left(html)
        if new_html != html:
            html = new_html
            changed = True

    # 3. Replace docbox (right side)
    new_html = _replace_div_class(html, 'pf-docbox', new_docbox)
    if new_html != html:
        html = new_html
        changed = True

    return html if changed else None


# ── Entry point ─────────────────────────────────────────────────────────────

def execute():
    frappe.set_user('Administrator')
    results = []

    for name, new_docbox in DOCBOXES.items():
        if not frappe.db.exists('Print Format', name):
            results.append({'name': name, 'status': 'not_found'})
            continue

        pf = frappe.get_doc('Print Format', name)
        if not pf.html:
            results.append({'name': name, 'status': 'no_html'})
            continue

        new_html = _patch_html(pf.html, new_docbox)
        if new_html is None:
            results.append({'name': name, 'status': 'no_change'})
        else:
            pf.html = new_html
            pf.save(ignore_permissions=True)
            results.append({'name': name, 'status': 'updated'})

    frappe.db.commit()
    return results
