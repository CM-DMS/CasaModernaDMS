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


def execute():
	"""Slice 013: Update V1-like conversions Convert groups with SO Pending/Confirmed gating.

	- Quotation: QT→SO/PF/CS always available (on submitted QT)
	- Sales Order:
	  - Pending: allow PF/CS, allow Confirm button for CM Super Admin only
	  - Confirmed: allow DN, allow IN only when DN exists (otherwise deterministic message)
	  - PF/CS allowed in both Pending/Confirmed
	- Delivery Note: DN→IN
	
	Also disables the older standalone SO confirm action client script (Slice 012) to avoid duplicate buttons.
	"""
	frappe.set_user("Administrator")

	_ensure_client_script(
		"Quotation - CasaModerna Conversions",
		"Quotation",
		"""frappe.ui.form.on('Quotation',{refresh(frm){if(frm.is_new()||!frm.doc||!frm.doc.name)return;if(frm.doc.docstatus!==1)return;const go=(r)=>{const m=r&&r.message?r.message:null;if(m&&m.doctype&&m.name){frappe.set_route('Form',m.doctype,m.name);}else if(m&&m.name){frappe.set_route('Form','Sales Order',m.name);}};frm.add_custom_button(__('Create Sales Order (SO)'),()=>{frappe.call({method:'casamoderna_dms.sales_doc_conversions.qt_create_so',args:{qt_name:frm.doc.name},callback:go});},__('Convert'));frm.add_custom_button(__('Create Proforma (PF)'),()=>{frappe.call({method:'casamoderna_dms.sales_doc_conversions.qt_create_pf',args:{qt_name:frm.doc.name},callback:go});},__('Convert'));frm.add_custom_button(__('Create Cash Sale (CS)'),()=>{frappe.call({method:'casamoderna_dms.sales_doc_conversions.qt_create_cs',args:{qt_name:frm.doc.name},callback:go});},__('Convert'));}});""",
	)

	_ensure_client_script(
		"Sales Order - CasaModerna Conversions",
		"Sales Order",
		"""frappe.ui.form.on('Sales Order',{refresh(frm){if(frm.is_new()||!frm.doc||!frm.doc.name)return;if(frm.doc.docstatus!==1)return;const go=(r)=>{const m=r&&r.message?r.message:null;if(m&&m.doctype&&m.name){frappe.set_route('Form',m.doctype,m.name);}else if(m&&m.name){frappe.set_route('Form','Sales Order',m.name);}};const state=(frm.doc.workflow_state||'');const roles=(frappe.user_roles||[]);const isAdmin=(frappe.session.user==='Administrator'||roles.includes('CM Super Admin'));if(state==='Pending'&&isAdmin){frm.add_custom_button(__('Create SO Confirmed'),()=>{frappe.call({method:'casamoderna_dms.sales_doc_conversions.so_create_confirmed',args:{so_name:frm.doc.name},callback:go});},__('Convert'));}frm.add_custom_button(__('Create Proforma (PF)'),()=>{frappe.call({method:'casamoderna_dms.sales_doc_conversions.so_create_pf',args:{so_name:frm.doc.name},callback:go});},__('Convert'));frm.add_custom_button(__('Create Cash Sale (CS)'),()=>{frappe.call({method:'casamoderna_dms.sales_doc_conversions.so_create_cs',args:{so_name:frm.doc.name},callback:go});},__('Convert'));if(state==='Confirmed'){frm.add_custom_button(__('Create Delivery Note (DN)'),()=>{frappe.call({method:'casamoderna_dms.sales_doc_conversions.so_create_dn',args:{so_name:frm.doc.name},callback:go});},__('Convert'));frappe.call({method:'casamoderna_dms.sales_doc_conversions.so_has_delivery_note',args:{sales_order:frm.doc.name},callback:(rr)=>{const m=rr&&rr.message?rr.message:{};const has_dn=!!(m&&m.has_dn);frm.add_custom_button(__('Create Invoice (IN)'),()=>{if(!has_dn){frappe.msgprint(__('Create a Delivery Note first; invoices for stock items must follow delivery.'));return;}frappe.call({method:'casamoderna_dms.sales_doc_conversions.so_create_in',args:{so_name:frm.doc.name},callback:go});},__('Convert'));}});} }});""",
	)

	_ensure_client_script(
		"Delivery Note - CasaModerna Conversions",
		"Delivery Note",
		"""frappe.ui.form.on('Delivery Note',{refresh(frm){if(frm.is_new()||!frm.doc||!frm.doc.name)return;if(frm.doc.docstatus!==1)return;const go=(r)=>{const m=r&&r.message?r.message:null;if(m&&m.doctype&&m.name){frappe.set_route('Form',m.doctype,m.name);}else if(m&&m.name){frappe.set_route('Form','Sales Invoice',m.name);}};frm.add_custom_button(__('Create Invoice (IN)'),()=>{frappe.call({method:'casamoderna_dms.sales_doc_conversions.dn_create_in',args:{dn_name:frm.doc.name},callback:go});},__('Convert'));}});""",
	)

	# Disable the older Slice 012 standalone confirm action button script to avoid duplicates.
	_disable_client_script("Sales Order - CasaModerna Pending Confirm Action")

	frappe.clear_cache()
	frappe.logger("casamoderna_dms").info({"slice": "013", "patch": __name__})
