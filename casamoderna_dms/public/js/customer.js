/* Customer duplicate-check warning + admin disable/enable
 * Shows an inline alert when a new Customer has the same name AND phone
 * as an existing record, before the user saves.
 *
 * Also adds a "Disable Customer" / "Enable Customer" button for users
 * holding the 'CasaModerna Customer Admin' role.
 */
(function () {
	'use strict';

	// Debounce helper — returns a function that fires `fn` at most once every `wait` ms.
	function debounce(fn, wait) {
		let timer;
		return function (...args) {
			clearTimeout(timer);
			timer = setTimeout(() => fn.apply(this, args), wait);
		};
	}

	// ── Duplicate warning ──────────────────────────────────────────────────────

	function _clearWarning(frm) {
		frm.set_intro('');
	}

	function _link(m) {
		return `<a href="/app/customer/${encodeURIComponent(m.name)}" target="_blank"
			style="text-decoration:underline;">${frappe.utils.escape_html(m.customer_name)}</a>`;
	}

	function _showDuplicateErrors(frm, nameMatches, phoneMatches) {
		const lines = [];
		if (nameMatches.length) {
			lines.push(`🚫 <strong>${__('Name already exists')}</strong>: ` + nameMatches.map(_link).join(', '));
		}
		if (phoneMatches.length) {
			lines.push(`🚫 <strong>${__('Phone already registered')}</strong>: ` + phoneMatches.map(_link).join(', '));
		}
		frm.set_intro(lines.join('<br>'), 'red');
	}

	const _checkDuplicates = debounce(function (frm) {
		if (!frm.is_new()) return;

		const name  = (frm.doc.customer_name || '').trim();
		const phone = (frm.doc.cm_mobile || '').trim();

		_clearWarning(frm);

		if (!name && !phone) return;

		frappe.call({
			method: 'casamoderna_dms.customer_sync.check_duplicate_customer',
			args: { customer_name: name, mobile: phone },
			callback: function (r) {
				const msg = r && r.message;
				if (!msg) return;
				const nameMatches  = msg.name_matches  || [];
				const phoneMatches = msg.phone_matches || [];
				if (nameMatches.length || phoneMatches.length) {
					_showDuplicateErrors(frm, nameMatches, phoneMatches);
				}
			},
		});
	}, 600);

	// ── Disable / Enable button (Customer Admins only) ─────────────────────────

	function _addDisableButton(frm, canDisable) {
		if (!canDisable || frm.is_new()) return;

		const isDisabled = !!(frm.doc.disabled);
		const label  = isDisabled ? __('Enable Customer') : __('Disable Customer');
		const colour = isDisabled ? 'success' : 'danger';

		frm.add_custom_button(label, function () {
			const action = isDisabled ? __('enable') : __('disable');
			frappe.confirm(
				__('Are you sure you want to {0} customer {1}?', [
					action,
					frappe.utils.escape_html(frm.doc.customer_name || frm.doc.name),
				]),
				function () {
					frappe.call({
						method: 'casamoderna_dms.customer_disable.set_customer_disabled',
						args: { customer: frm.doc.name, disabled: isDisabled ? 0 : 1 },
						callback: function (r) {
							if (r && r.message) {
								frappe.show_alert({ message: __(r.message.message), indicator: 'green' });
								frm.reload_doc();
							}
						},
					});
				}
			);
		}).addClass('btn-' + colour);
	}

	function _setupDisableButton(frm) {
		if (frm.is_new()) return;

		frappe.call({
			method: 'casamoderna_dms.customer_disable.can_disable_customers',
			callback: function (r) {
				_addDisableButton(frm, r && r.message);
			},
		});
	}

	// ── Disabled indicator in form title ───────────────────────────────────────

	function _showDisabledIndicator(frm) {
		if (!frm.is_new() && frm.doc.disabled) {
			frm.set_intro(__('This customer is disabled.'), 'red');
		}
	}

	// ── Event handlers ─────────────────────────────────────────────────────────

	frappe.ui.form.on('Customer', {
		refresh(frm) {
			_showDisabledIndicator(frm);
			_setupDisableButton(frm);
			if (frm.is_new()) _checkDuplicates(frm);
		},
		customer_name(frm) { _checkDuplicates(frm); },
		cm_mobile(frm)     { _checkDuplicates(frm); },
	});
})();
