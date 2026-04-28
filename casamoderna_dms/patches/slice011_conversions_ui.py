from __future__ import annotations

import frappe


def _ensure_client_script(name: str, dt: str, script: str):
	frappe.set_user("Administrator")
	if frappe.db.exists("Client Script", name):
		doc = frappe.get_doc("Client Script", name)
		changed = False
		if doc.dt != dt:
			doc.dt = dt
			changed = True
		if (doc.script or "") != script:
			doc.script = script
			changed = True
		if int(doc.enabled or 0) != 1:
			doc.enabled = 1
			changed = True
		if (doc.view or "") != "Form":
			doc.view = "Form"
			changed = True
		if changed:
			doc.save()
		return

	doc = frappe.new_doc("Client Script")
	doc.name = name
	doc.dt = dt
	doc.view = "Form"
	doc.module = "Selling"
	doc.enabled = 1
	doc.script = script
	doc.insert(ignore_permissions=True)


def _disable_client_script(name: str):
	frappe.set_user("Administrator")
	if not frappe.db.exists("Client Script", name):
		return
	doc = frappe.get_doc("Client Script", name)
	if int(doc.enabled or 0) == 0:
		return
	doc.enabled = 0
	doc.save()


def _ensure_custom_field(dt: str, fieldname: str, props: dict):
	frappe.set_user("Administrator")
	name = frappe.db.get_value("Custom Field", {"dt": dt, "fieldname": fieldname}, "name")
	if name:
		# Keep existing field; only set key props if missing.
		for key, val in props.items():
			current = frappe.db.get_value("Custom Field", name, key)
			if str(current) != str(val):
				frappe.db.set_value("Custom Field", name, key, val, update_modified=False)
		return

	cf = frappe.new_doc("Custom Field")
	cf.dt = dt
	cf.fieldname = fieldname
	for key, val in props.items():
		setattr(cf, key, val)
	cf.insert(ignore_permissions=True)


def execute():
	"""Slice 011: V1-like conversions UI buttons + linkage fields.

	- Adds one "Convert" button group per source doctype via Client Script records.
	- Adds hidden POS Invoice linkage fields for CS idempotency.
	- Disables the older PF-only client scripts to avoid duplicate PF buttons.
	"""
	frappe.set_user("Administrator")

	# POS Invoice linkage fields (hidden/UI-neutral) for idempotency.
	if frappe.db.exists("DocType", "POS Invoice"):
		_ensure_custom_field(
			"POS Invoice",
			"cm_source_doctype",
			{
				"label": "CM Source DocType",
				"fieldtype": "Link",
				"options": "DocType",
				"insert_after": "source",
				"hidden": 1,
				"print_hide": 1,
				"no_copy": 1,
				"read_only": 1,
			},
		)
		_ensure_custom_field(
			"POS Invoice",
			"cm_source_name",
			{
				"label": "CM Source Name",
				"fieldtype": "Dynamic Link",
				"options": "cm_source_doctype",
				"insert_after": "cm_source_doctype",
				"hidden": 1,
				"print_hide": 1,
				"no_copy": 1,
				"read_only": 1,
			},
		)

	# Consolidated conversions UI scripts.
	_ensure_client_script(
		"Quotation - CasaModerna Conversions",
		"Quotation",
		"""frappe.ui.form.on('Quotation',{refresh(frm){if(frm.is_new()||!frm.doc||!frm.doc.name)return;if(frm.doc.docstatus!==1)return;const go=(r)=>{const m=r&&r.message?r.message:null;if(m&&m.doctype&&m.name){frappe.set_route('Form',m.doctype,m.name);}else if(m&&m.name){frappe.set_route('Form','Sales Order',m.name);}};frm.add_custom_button(__('Create Sales Order (SO)'),()=>{frappe.call({method:'casamoderna_dms.sales_doc_conversions.create_so_from_qt',args:{quotation:frm.doc.name},callback:go});},__('Convert'));frm.add_custom_button(__('Create Proforma (PF)'),()=>{frappe.call({method:'casamoderna_dms.sales_doc_conversions.create_pf_from_qt',args:{quotation:frm.doc.name},callback:go});},__('Convert'));frm.add_custom_button(__('Create Cash Sale (CS)'),()=>{frappe.call({method:'casamoderna_dms.sales_doc_conversions.create_cs_from_qt',args:{quotation:frm.doc.name},callback:go});},__('Convert'));}});""",
	)

	_ensure_client_script(
		"Sales Order - CasaModerna Conversions",
		"Sales Order",
		"""frappe.ui.form.on('Sales Order',{refresh(frm){if(frm.is_new()||!frm.doc||!frm.doc.name)return;if(frm.doc.docstatus!==1)return;const go=(r)=>{const m=r&&r.message?r.message:null;if(m&&m.doctype&&m.name){frappe.set_route('Form',m.doctype,m.name);}else if(m&&m.name){frappe.set_route('Form','Sales Invoice',m.name);}};frm.add_custom_button(__('Create Delivery Note (DN)'),()=>{frappe.call({method:'casamoderna_dms.sales_doc_conversions.create_dn_from_so',args:{sales_order:frm.doc.name},callback:go});},__('Convert'));frm.add_custom_button(__('Create Invoice (IN)'),()=>{frappe.call({method:'casamoderna_dms.sales_doc_conversions.create_in_from_so',args:{sales_order:frm.doc.name},callback:go});},__('Convert'));frm.add_custom_button(__('Create Proforma (PF)'),()=>{frappe.call({method:'casamoderna_dms.sales_doc_conversions.create_pf_from_so',args:{sales_order:frm.doc.name},callback:go});},__('Convert'));frm.add_custom_button(__('Create Cash Sale (CS)'),()=>{frappe.call({method:'casamoderna_dms.sales_doc_conversions.create_cs_from_so',args:{sales_order:frm.doc.name},callback:go});},__('Convert'));}});""",
	)

	_ensure_client_script(
		"Delivery Note - CasaModerna Conversions",
		"Delivery Note",
		"""frappe.ui.form.on('Delivery Note',{refresh(frm){if(frm.is_new()||!frm.doc||!frm.doc.name)return;if(frm.doc.docstatus!==1)return;const go=(r)=>{const m=r&&r.message?r.message:null;if(m&&m.doctype&&m.name){frappe.set_route('Form',m.doctype,m.name);}else if(m&&m.name){frappe.set_route('Form','Sales Invoice',m.name);}};frm.add_custom_button(__('Create Invoice (IN)'),()=>{frappe.call({method:'casamoderna_dms.sales_doc_conversions.create_in_from_dn',args:{delivery_note:frm.doc.name},callback:go});},__('Convert'));}});""",
	)

	# Disable PF-only scripts from Slice 010 (we now provide PF via the Convert group).
	_disable_client_script("Quotation - CasaModerna Proforma (PF)")
	_disable_client_script("Sales Order - CasaModerna Proforma (PF)")

	frappe.clear_cache()
	frappe.logger("casamoderna_dms").info({"slice": "011", "patch": __name__})
