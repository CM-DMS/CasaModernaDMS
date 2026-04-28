import frappe

def execute():
    frappe.set_user('Administrator')
    if frappe.db.exists('Custom Field', 'Quotation-cm_totals_html'):
        frappe.delete_doc('Custom Field', 'Quotation-cm_totals_html', ignore_permissions=True)
    
    cf = frappe.get_doc({
        'doctype': 'Custom Field',
        'name': 'Quotation-cm_totals_html',
        'dt': 'Quotation',
        'fieldname': 'cm_totals_html',
        'fieldtype': 'HTML',
        'label': 'Totals Summary',
        'insert_after': 'grand_total',
        'read_only': 1,
    })
    cf.insert(ignore_permissions=True)
    frappe.db.commit()
    return 'created'
