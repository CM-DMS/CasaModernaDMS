frappe.ui.form.on('CM Proforma', {
	refresh(frm) {
		if (frm.is_new()) return;
		if (frm.doc.cm_pf_issued) return;
		frm.add_custom_button(__('Issue Proforma (PF)'), () => {
			frappe.call({
				method: 'casamoderna_dms.proforma_pf.issue_proforma',
				args: { name: frm.doc.name },
				callback: () => frm.reload_doc(),
			});
		});
	}
});
