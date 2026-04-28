/* CM_SALES_DOC_SHELL_V1
 * Slice 015: Unified V1-like Sales Docs screen shell (UI-only).
 * Shared initializer used by thin per-Doctype Client Script wrappers.
 */

(() => {
	function _getMeta(doctype) {
		try {
			return frappe.get_meta(doctype);
		} catch (e) {
			return null;
		}
	}

	function _hasField(meta, fieldname) {
		if (!meta || !fieldname) return false;
		return !!meta.get_field(fieldname);
	}

	function _fmt(val) {
		if (val === null || val === undefined) return '';
		if (typeof val === 'string') return val;
		return String(val);
	}

	function _safeText(val) {
		return frappe.utils.escape_html(_fmt(val));
	}

	function _firstNonEmpty(values) {
		for (const v of values) {
			const s = _fmt(v).trim();
			if (s) return s;
		}
		return '';
	}

	function _docLabel(frm, opts) {
		const base = (opts && opts.doctype_label) || frm.doctype;
		const isReturn = !!(frm.doc && frm.doc.is_return);
		if (!isReturn) return base;
		// Returns: Sales Invoice Return or POS Invoice Return behave like Credit Notes (CN in V1).
		if (frm.doctype === 'Sales Invoice' || frm.doctype === 'POS Invoice') {
			return 'Credit Note';
		}
		return base;
	}

	function _moveConvertGroupIntoBar(frm, $bar) {
		// Slice 021: Visually place the existing Slice 013 Convert group in the identity strip.
		// UI-only: we do NOT create/replace any convert logic.
		if (!frm || !frm.page || !$bar || !$bar.length) return false;
		const $slot = $bar.find('.cm-sales-shell__convert-slot');
		if (!$slot.length) return false;
		if (($slot.data('cmHasConvert') || 0) === 1) return true;

		const $wrapper = $(frm.page && frm.page.wrapper ? frm.page.wrapper : document.body);
		const $toolbar = (frm.page && frm.page.inner_toolbar) ? $(frm.page.inner_toolbar) : $wrapper.find('.page-actions, .page-head, .form-page');

		const $btn = _findToolbarButtonByText($toolbar, 'Convert') || _findToolbarButtonByText($wrapper, 'Convert');
		if (!$btn || !$btn.length) return false;

		let $group = null;
		if ($btn.hasClass('dropdown-toggle')) {
			$group = $btn.closest('.btn-group');
		} else {
			$group = $btn.closest('.btn-group, .dropdown');
		}
		if (!$group || !$group.length) {
			$group = $btn;
		}

		// If already inside our bar, consider it mounted.
		if ($group.closest('.cm-sales-shell__bar-right').length) {
			$slot.data('cmHasConvert', 1);
			return true;
		}

		try {
			$group.attr('data-cm-convert-moved', '1');
			$group.detach().appendTo($slot);
			$slot.data('cmHasConvert', 1);
			return true;
		} catch (e) {
			return false;
		}
	}

	function _findToolbarButtonByText($root, labelText) {
		if (!$root || !$root.length) return null;
		const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
		const target = norm(labelText);
		let found = null;
		$root.find('button, a').each(function () {
			if (found) return;
			const t = norm($(this).text());
			if (t === target) found = $(this);
		});
		return found;
	}

	function _clickConvertUI(frm) {
		// Slice 013 creates a "Convert" button group via frm.add_custom_button(..., __('Convert')).
		// We do not replace any logic; we just delegate to the existing UI if present.
		const $wrapper = $(frm.page && frm.page.wrapper ? frm.page.wrapper : document.body);
		const $toolbar = (frm.page && frm.page.inner_toolbar) ? frm.page.inner_toolbar : $wrapper.find('.page-actions, .page-head, .form-page');

		// Prefer exact "Convert" label.
		const $btn = _findToolbarButtonByText($toolbar, 'Convert') || _findToolbarButtonByText($wrapper, 'Convert');
		if ($btn && $btn.length) {
			$btn.trigger('click');
			return true;
		}
		return false;
	}

	function _clickPrintUI(frm) {
		if (frm && frm.doc && frm.doc.name) {
			try {
				// Standard print route; does not change formats.
				frappe.set_route('print', frm.doctype, frm.doc.name);
				return;
			} catch (e) {
				// fallthrough
			}
		}
		frappe.msgprint(__('Save the document before printing.'));
	}

	function _collectCardRows(frm, opts) {
		const meta = _getMeta(frm.doctype);

		const wantCustomerLeft = (opts && opts.customer_fields) || [
			// Quotation links to Customer via `party_name` + `quotation_to`.
			'quotation_to',
			'party_name',
			'customer',
			'customer_name',
			'contact_person',
			'contact_display',
			'customer_address',
			'address_display',
			'territory',
		];
		const wantDocInfoRight = (opts && opts.info_fields) || [
			'transaction_date',
			'posting_date',
			'delivery_date',
			'due_date',
			'valid_till',
			'po_no',
			'po_date',
			'sales_partner',
			'remarks',
			'customer_notes',
			'notes',
			'terms',
			'terms_and_conditions',
		];

		const pick = (fieldnames) => {
			const out = [];
			for (const fieldname of fieldnames) {
				if (!_hasField(meta, fieldname)) continue;
				const val = frm.doc ? frm.doc[fieldname] : null;
				const s = _fmt(val).trim();
				if (!s) continue;
				const df = meta.get_field(fieldname);
				out.push({
					fieldname,
					label: (df && df.label) ? df.label : fieldname,
					value: s,
				});
			}
			return out;
		};

		return {
			customer: pick(wantCustomerLeft),
			info: pick(wantDocInfoRight),
		};
	}

	function _collectTotalsRows(frm) {
		const meta = _getMeta(frm.doctype);
		const want = [
			{ fieldname: 'net_total', label: __('Net Excl VAT') },
			{ fieldname: 'total_taxes_and_charges', label: __('VAT') },
			{ fieldname: 'grand_total', label: __('Grand Total') },
		];
		const out = [];
		for (const it of want) {
			const f = it.fieldname;
			if (!_hasField(meta, f)) continue;
			const val = frm.doc ? frm.doc[f] : null;
			if (val === null || val === undefined || val === '') continue;
			const df = meta.get_field(f);
			out.push({
				fieldname: f,
				label: (it && it.label) ? it.label : ((df && df.label) ? df.label : f),
				value: _fmt(val),
			});
		}
		return out;
	}

	function _collectDepositRows(frm) {
		// Slice 018: Treat existing Payment Terms (payment_schedule) as the deposit area.
		// No new logic: we only surface existing doc fields.
		if (!frm || !frm.doc) return [];
		if (!(frm.doctype === 'Quotation' || frm.doctype === 'Sales Order')) return [];
		const meta = _getMeta(frm.doctype);
		if (!_hasField(meta, 'payment_schedule')) return [];

		const out = [];
		if (_hasField(meta, 'payment_terms_template')) {
			const t = _fmt(frm.doc.payment_terms_template).trim();
			if (t) out.push({ fieldname: 'payment_terms_template', label: __('Payment Terms'), value: t });
		}

		const schedule = frm.doc.payment_schedule;
		if (Array.isArray(schedule) && schedule.length) {
			const first = schedule[0] || {};
			const firstDue = _fmt(first.due_date).trim();
			const firstAmt = _fmt(first.payment_amount).trim();
			if (firstAmt) out.push({ fieldname: 'payment_schedule', label: __('First Schedule Amount'), value: firstAmt });
			if (firstDue) out.push({ fieldname: 'payment_schedule', label: __('First Due Date'), value: firstDue });
			out.push({ fieldname: 'payment_schedule', label: __('Schedule Rows'), value: String(schedule.length) });
		} else {
			out.push({ fieldname: 'payment_schedule', label: __('Schedule Rows'), value: '0' });
		}

		return out;
	}

	function _openPaymentTerms(frm) {
		try {
			// Prefer switching to the "Terms" tab by clicking it.
			const $wrapper = $(frm.page && frm.page.wrapper ? frm.page.wrapper : document.body);
			const $tabs = $wrapper.find('.form-tabs, .nav.nav-tabs');
			let $termsTab = null;
			$tabs.find('a, button').each(function () {
				if ($termsTab) return;
				const t = ($(this).text() || '').replace(/\s+/g, ' ').trim().toLowerCase();
				if (t === 'terms') $termsTab = $(this);
			});
			if ($termsTab && $termsTab.length) {
				$termsTab.trigger('click');
			}
		} catch (e) {
			// fallthrough
		}

		try {
			frm.scroll_to_field('payment_schedule');
			return;
		} catch (e) {
			// fallthrough
		}
		frappe.msgprint(__('Open the Terms tab to edit Payment Terms.'));
	}

	function _renderKeyVals(rows) {
		if (!rows || !rows.length) {
			return `<div class="cm-sales-shell__empty">${__('No details')}</div>`;
		}
		return rows
			.map((r) => {
				return `
					<div class="cm-sales-shell__kv">
						<div class="cm-sales-shell__k">${_safeText(r.label)}</div>
						<div class="cm-sales-shell__v">${_safeText(r.value)}</div>
					</div>
				`;
			})
			.join('');
	}

	function _ensureShellContainer(frm) {
		const $wrapper = $(frm.page && frm.page.wrapper ? frm.page.wrapper : document.body);
		let $existing = $wrapper.find('.cm-sales-shell');
		if ($existing && $existing.length) return $existing;

		const $formLayout = $wrapper.find('.form-layout').first();
		if (!$formLayout.length) return null;

		const $shell = $(
			`<div class="cm-sales-shell" data-cm-sales-shell="1">
				<div class="cm-sales-shell__bar"></div>
				<div class="cm-sales-shell__cards"></div>
				<div class="cm-sales-shell__middle"></div>
				<div class="cm-sales-shell__bottom"></div>
			</div>`
		);
		$shell.insertBefore($formLayout);
		return $shell;
	}

	function _renderBar(frm, opts, $bar) {
		const meta = _getMeta(frm.doctype);
		const f_operational = (opts && opts.operational_field) || 'cm_v1_operational_no';
		const f_draft = (opts && opts.draft_field) || 'cm_v1_draft_no';
		const f_fiscal = (opts && opts.fiscal_field) || 'cm_v1_fiscal_record_no';
		const f_status = (opts && opts.status_field) || 'status';
		const f_workflow = (opts && opts.workflow_field) || 'workflow_state';

		const operational = _hasField(meta, f_operational) ? (frm.doc ? frm.doc[f_operational] : '') : '';
		const draft = _hasField(meta, f_draft) ? (frm.doc ? frm.doc[f_draft] : '') : '';
		const fiscal = _hasField(meta, f_fiscal) ? (frm.doc ? frm.doc[f_fiscal] : '') : '';

		const v1No = _firstNonEmpty([operational, draft]);
		const status = _hasField(meta, f_status) ? (frm.doc ? frm.doc[f_status] : '') : '';
		const workflow = _hasField(meta, f_workflow) ? (frm.doc ? frm.doc[f_workflow] : '') : '';

		const label = _docLabel(frm, opts);
		const isReturn = !!(frm.doc && frm.doc.is_return);

		const pills = [];
		if (v1No) pills.push({ label: __('V1 No'), value: v1No });
		if (fiscal) pills.push({ label: __('Fiscal'), value: fiscal });
		// Slice 021: State display rules.
		if (frm.doctype === 'Sales Order') {
			if (workflow) pills.push({ label: __('State'), value: workflow });
		} else {
			if (status) pills.push({ label: __('Status'), value: status });
		}
		if (isReturn && (frm.doctype === 'Sales Invoice' || frm.doctype === 'POS Invoice')) {
			pills.push({ label: __('Type'), value: __('Credit Note') });
		}

		const pillsHtml = pills
			.map((p) => `
				<div class="cm-sales-shell__pill">
					<span class="cm-sales-shell__pill-k">${_safeText(p.label)}</span>
					<span class="cm-sales-shell__pill-v">${_safeText(p.value)}</span>
				</div>
			`)
			.join('');

		const canPrint = !!(frm.doc && frm.doc.name);

		$bar.html(
			`<div class="cm-sales-shell__bar-left">
				<div class="cm-sales-shell__doctype">${_safeText(label)}</div>
				<div class="cm-sales-shell__pills">${pillsHtml}</div>
			</div>
			<div class="cm-sales-shell__bar-right">
				<button class="btn btn-default btn-sm cm-sales-shell__btn-print" ${canPrint ? '' : 'disabled'}>${__('View PDF')}</button>
				<span class="cm-sales-shell__convert-slot"></span>
				<button class="btn btn-default btn-sm cm-sales-shell__btn-convert-fallback">${__('Convert')}</button>
			</div>`
		);

		$bar.find('.cm-sales-shell__btn-print').on('click', () => _clickPrintUI(frm));

		const $fallback = $bar.find('.cm-sales-shell__btn-convert-fallback');
		const tryMount = () => {
			const ok = _moveConvertGroupIntoBar(frm, $bar);
			if (ok) {
				$fallback.addClass('hide');
			}
			return ok;
		};

		const mounted = tryMount();
		if (!mounted) {
			$fallback.on('click', () => {
				const ok = _clickConvertUI(frm);
				if (!ok) {
					frappe.msgprint(__('No Convert actions available for this document.'));
				}
			});
			// Retry shortly in case Slice 013 scripts add the Convert group later in this refresh cycle.
			setTimeout(() => tryMount(), 300);
		}
	}

	function _renderCards(frm, opts, $cards) {
		const rows = _collectCardRows(frm, opts);
		$cards.html(
			`<div class="cm-sales-shell__card">
				<div class="cm-sales-shell__card-h">${__('Customer')}</div>
				<div class="cm-sales-shell__card-b">${_renderKeyVals(rows.customer)}</div>
			</div>
			<div class="cm-sales-shell__card">
				<div class="cm-sales-shell__card-h">${__('Document Info / Notes')}</div>
				<div class="cm-sales-shell__card-b">${_renderKeyVals(rows.info)}</div>
			</div>`
		);
	}

	function _renderMiddle(frm, $middle) {
		// Products title and anchoring near the items table (common across QT/SO/DN/SI/POS/PF).
		const itemsField = frm.fields_dict && frm.fields_dict.items ? frm.fields_dict.items : null;
		const gridWrapper = itemsField && itemsField.grid ? $(itemsField.grid.wrapper) : null;
		if (gridWrapper && gridWrapper.length) {
			if (!$middle.find('.cm-sales-shell__products').length) {
				$middle.html(`<div class="cm-sales-shell__products">${__('Products')}</div>`);
			}
			// Ensure the title stays visually close to the items grid.
			const $products = $middle.find('.cm-sales-shell__products');
			if ($products.length && !$products.data('cmInserted')) {
				$products.data('cmInserted', 1);
				$products.insertBefore(gridWrapper);
			}
		} else {
			$middle.empty();
		}
	}

	function _renderBottom(frm, $bottom) {
		const totals = _collectTotalsRows(frm);
		const deposit = _collectDepositRows(frm);
		const showDeposit = !!(deposit && deposit.length);
		$bottom.html(
			`<div class="cm-sales-shell__bottom-left">
				<div class="cm-sales-shell__card">
					<div class="cm-sales-shell__card-h">${__('Attachments')}</div>
					<div class="cm-sales-shell__card-b">
						<div class="cm-sales-shell__attachments">
							<button class="btn btn-default btn-sm cm-sales-shell__btn-attachments">${__('Open Attachments')}</button>
						</div>
					</div>
				</div>
			</div>
			<div class="cm-sales-shell__bottom-right">
				<div class="cm-sales-shell__card">
					<div class="cm-sales-shell__card-h">${__('Totals')}</div>
					<div class="cm-sales-shell__card-b">${_renderKeyVals(totals)}</div>
				</div>
				${showDeposit ? `
				<div class="cm-sales-shell__card">
					<div class="cm-sales-shell__card-h">${__('Deposit / Payment Terms')}</div>
					<div class="cm-sales-shell__card-b">
						${_renderKeyVals(deposit)}
						<div style="margin-top: var(--margin-sm);">
							<button class="btn btn-default btn-sm cm-sales-shell__btn-payment-terms">${__('Edit Payment Terms')}</button>
						</div>
					</div>
				</div>
				` : ''}
			</div>`
		);

		$bottom.find('.cm-sales-shell__btn-attachments').on('click', () => {
			const $wrapper = $(frm.page && frm.page.wrapper ? frm.page.wrapper : document.body);
			const $attach = $wrapper.find('[data-label="Attach"], .form-attachments-btn, .attachment-btn').first();
			if ($attach && $attach.length) {
				$attach.trigger('click');
				return;
			}
			frappe.msgprint(__('Use the sidebar to manage attachments.'));
		});

		$bottom.find('.cm-sales-shell__btn-payment-terms').on('click', () => _openPaymentTerms(frm));
	}

	function init(frm, opts) {
		if (!frm || !frm.page) return;
		const $shell = _ensureShellContainer(frm);
		if (!$shell) return;

		$shell.attr('data-cm-doctype', frm.doctype);

		_renderBar(frm, opts, $shell.find('.cm-sales-shell__bar'));
		_renderCards(frm, opts, $shell.find('.cm-sales-shell__cards'));
		_renderMiddle(frm, $shell.find('.cm-sales-shell__middle'));
		_renderBottom(frm, $shell.find('.cm-sales-shell__bottom'));

		// Deterministic marker (used by stabilisation gate via script token checks).
		window.cm_sales_doc_shell_last_init = {
			doctype: frm.doctype,
			docname: frm.doc ? frm.doc.name : null,
			ts: Date.now(),
		};
	}

	window.cm_sales_doc_shell = {
		init,
	};
})();
