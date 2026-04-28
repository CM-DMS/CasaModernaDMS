"""
Patch: Add page-break-inside:avoid to totals and signature blocks in SI and SO print formats.
Also ensures signature panel CSS uses the avoid rule.
Idempotent.
"""
import frappe


TARGETS = ['CasaModerna Sales Invoice', 'CasaModerna Sales Order']

# Old → new substitutions (applied in order)
SUBS = [
    (
        '.pf-totals-wrap{display:flex;justify-content:flex-end;margin-top:4px}',
        '.pf-totals-wrap{display:flex;justify-content:flex-end;margin-top:4px;page-break-inside:avoid}',
    ),
    (
        '.pf-signature{margin-top:20px;padding:14px 16px;border:1px solid #c8e6c9;border-radius:4px;background:#f9fdf9}',
        '.pf-signature{margin-top:20px;padding:14px 16px;border:1px solid #c8e6c9;border-radius:4px;background:#f9fdf9;page-break-inside:avoid}',
    ),
]


def execute():
    frappe.set_user('Administrator')
    results = []

    for name in TARGETS:
        if not frappe.db.exists('Print Format', name):
            results.append({'name': name, 'status': 'not_found'})
            continue

        pf = frappe.get_doc('Print Format', name)
        if not pf.html:
            results.append({'name': name, 'status': 'no_html'})
            continue

        html = pf.html
        changed = False
        for old, new in SUBS:
            if old in html:
                html = html.replace(old, new, 1)
                changed = True

        if changed:
            pf.html = html
            pf.save(ignore_permissions=True)
            results.append({'name': name, 'status': 'updated'})
        else:
            results.append({'name': name, 'status': 'no_change'})

    frappe.db.commit()
    return results
