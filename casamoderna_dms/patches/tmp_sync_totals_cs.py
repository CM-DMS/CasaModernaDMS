import json, frappe

def execute():
    frappe.set_user('Administrator')
    path = frappe.get_app_path('casamoderna_dms', 'fixtures', 'client_script.json')
    with open(path) as f:
        records = json.load(f)
    rec = next(r for r in records if r['name'] == 'Quotation - CasaModerna Totals Display')

    if frappe.db.exists('Client Script', rec['name']):
        doc = frappe.get_doc('Client Script', rec['name'])
    else:
        doc = frappe.new_doc('Client Script')
        doc.name = rec['name']

    doc.dt = rec['dt']
    doc.script = rec['script']
    doc.enabled = 1
    doc.view = 'Form'
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return 'done'
