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


def execute():
	"""Slice 012: Add Pending→Confirmed explicit UI action on Sales Order."""
	frappe.set_user("Administrator")

	_ensure_client_script(
		"Sales Order - CasaModerna Pending Confirm Action",
		"Sales Order",
		"""frappe.ui.form.on('Sales Order',{refresh(frm){if(frm.is_new()||!frm.doc||!frm.doc.name)return;if(frm.doc.docstatus!==1)return;const state=frm.doc.workflow_state||null;if(state!=='Pending')return;const isAdmin=(frappe.user_roles||[]).includes('CM Super Admin')||frappe.session.user==='Administrator';if(!isAdmin)return;frm.add_custom_button(__('Create SO Confirmed'),()=>{frappe.call({method:'casamoderna_dms.sales_order_confirm.confirm_pending_so',args:{sales_order:frm.doc.name},callback:(r)=>{frm.reload_doc();}});});}});""",
	)

	frappe.clear_cache()
	frappe.logger("casamoderna_dms").info({"slice": "012", "patch": __name__})
