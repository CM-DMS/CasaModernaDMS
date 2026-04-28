// CM Voucher — Frappe desk form controller.
// The primary UI lives in the React DMS frontend; this controller only adds
// convenience action buttons when the voucher is opened directly in the
// Frappe desk (e.g. by admins via /app/cm-voucher).

frappe.ui.form.on('CM Voucher', {
	refresh(frm) {
		if (frm.is_new()) return;

		const status = frm.doc.status;
		const user   = frappe.session.user;

		if (status === 'Draft') {
			frm.add_custom_button(__('Submit for Authorization'), () => {
				frappe.call({
					method: 'casamoderna_dms.voucher_api.submit_for_authorization',
					args: { voucher_name: frm.doc.name },
					callback: () => frm.reload_doc(),
				});
			}, __('Actions'));
		}

		if (status === 'Pending Authorization') {
			const isAuthorizer = frappe.user_roles.includes('Voucher Authorizer');
			if (isAuthorizer) {
				frm.add_custom_button(__('Approve'), () => {
					frappe.call({
						method: 'casamoderna_dms.voucher_api.authorize_voucher',
						args: { voucher_name: frm.doc.name },
						callback: () => frm.reload_doc(),
					});
				}, __('Actions'));

				frm.add_custom_button(__('Reject'), () => {
					frappe.prompt(
						{ fieldtype: 'Small Text', fieldname: 'reason', label: 'Reason (optional)' },
						({ reason }) => {
							frappe.call({
								method: 'casamoderna_dms.voucher_api.reject_voucher',
								args: { voucher_name: frm.doc.name, reason: reason || '' },
								callback: () => frm.reload_doc(),
							});
						},
						__('Reject Voucher'),
					);
				}, __('Actions'));
			}
		}

		if (status === 'Authorized') {
			frm.add_custom_button(__('Mark as Redeemed'), () => {
				frappe.prompt(
					[
						{ fieldtype: 'Link',     options: 'Sales Order', fieldname: 'so_name',  label: 'Sales Order', reqd: 1 },
						{ fieldtype: 'Currency', fieldname: 'amount',    label: 'Amount',       reqd: 1 },
					],
					({ so_name, amount }) => {
						frappe.call({
							method: 'casamoderna_dms.voucher_api.redeem_voucher',
							args: { voucher_name: frm.doc.name, so_name, amount },
							callback: () => frm.reload_doc(),
						});
					},
					__('Redeem Voucher'),
				);
			}, __('Actions'));
		}
	},
});
