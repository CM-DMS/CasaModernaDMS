"""Patch: add cm_bill_line2 to address rendering in Quotation, Sales Order, and Sales Invoice PDFs.

Previously the get_value() calls only fetched cm_bill_line1 (skipping line 2) and the
Jinja HTML block had no rendering for cm_bill_line2, so a customer's second address line
was silently omitted from all three sales document PDFs.

This patch applies three string replacements per format:
  1. get_value field list: add 'cm_bill_line2' immediately after 'cm_bill_line1'
  2. _cv rendering block (Customer A / solo): insert cm_bill_line2 display line after line1
  3. _cb rendering block (Customer B):        insert cm_bill_line2 display line after line1
"""
import frappe


FORMATS = [
    "CasaModerna Quotation",
    "CasaModerna Sales Order",
    "CasaModerna Sales Invoice",
]


def execute():
    for pf_name in FORMATS:
        html = frappe.db.get_value("Print Format", pf_name, "html")
        if not html:
            print(f"  {pf_name}: not found or empty — skipped")
            continue

        original = html

        # 1. Expand the get_value field list to include cm_bill_line2.
        #    Both customer-A-fetch and customer-B-fetch use the same 'cm_bill_line1','cm_bill_locality' pattern.
        html = html.replace(
            "'cm_bill_line1','cm_bill_locality'",
            "'cm_bill_line1','cm_bill_line2','cm_bill_locality'",
        )

        # 2. Add rendering for _cv.cm_bill_line2 (Customer A / single-customer block).
        html = html.replace(
            "{%- if _cv.cm_bill_line1 -%}<div class=\"pf-card-line\">{{ _cv.cm_bill_line1 }}</div>{%- endif -%}",
            "{%- if _cv.cm_bill_line1 -%}<div class=\"pf-card-line\">{{ _cv.cm_bill_line1 }}</div>{%- endif -%}"
            "{%- if _cv.cm_bill_line2 -%}<div class=\"pf-card-line\">{{ _cv.cm_bill_line2 }}</div>{%- endif -%}",
        )

        # 3. Add rendering for _cb.cm_bill_line2 (Customer B block — A/B split documents).
        html = html.replace(
            "{%- if _cb.cm_bill_line1 -%}<div class=\"pf-card-line\">{{ _cb.cm_bill_line1 }}</div>{%- endif -%}",
            "{%- if _cb.cm_bill_line1 -%}<div class=\"pf-card-line\">{{ _cb.cm_bill_line1 }}</div>{%- endif -%}"
            "{%- if _cb.cm_bill_line2 -%}<div class=\"pf-card-line\">{{ _cb.cm_bill_line2 }}</div>{%- endif -%}",
        )

        if html == original:
            print(f"  {pf_name}: no changes made — patterns may have already been applied or differ from expected")
            continue

        frappe.db.set_value("Print Format", pf_name, "html", html, update_modified=False)
        frappe.db.commit()
        print(f"  {pf_name}: updated")
