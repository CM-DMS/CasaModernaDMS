from __future__ import annotations

import frappe


def _ensure_print_format(pf_name: str, doc_type: str, html: str):
	frappe.set_user("Administrator")
	if not frappe.db.exists("DocType", doc_type):
		return
	if frappe.db.exists("Print Format", pf_name):
		pf = frappe.get_doc("Print Format", pf_name)
		if (pf.doc_type != doc_type) or ((pf.html or "") != html) or int(pf.disabled or 0) != 0:
			pf.doc_type = doc_type
			pf.print_format_type = "Jinja"
			pf.html = html
			pf.disabled = 0
			pf.custom_format = 1
			pf.save()
		return

	pf = frappe.new_doc("Print Format")
	pf.name = pf_name
	pf.doc_type = doc_type
	pf.print_format_for = "DocType"
	pf.print_format_type = "Jinja"
	pf.custom_format = 1
	pf.disabled = 0
	pf.html = html
	pf.insert(ignore_permissions=True)


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


def _set_custom_field_props(dt: str, fieldname: str, props: dict) -> dict:
	name = frappe.db.get_value("Custom Field", {"dt": dt, "fieldname": fieldname}, "name")
	if not name:
		return {"dt": dt, "fieldname": fieldname, "status": "missing"}

	changed: dict[str, dict] = {}
	for key, expected in props.items():
		current = frappe.db.get_value("Custom Field", name, key)
		if str(current) != str(expected):
			frappe.db.set_value("Custom Field", name, key, expected, update_modified=False)
			changed[key] = {"from": current, "to": expected}
	return {"dt": dt, "fieldname": fieldname, "status": "ok", "changed": changed}


def execute():
	"""Slice 010: Proforma (PF) artifact.

	- Add CM Proforma DocType (code-defined) and ensure V1-visible numbering fields exist.
	- Add QT/SO UI entry points to create PF.
	- Ensure PF has a dedicated print format.
	"""
	frappe.set_user("Administrator")

	# Ensure the CM Proforma DocType exists (provided by app files).
	if not frappe.db.exists("DocType", "CM Proforma"):
		return

	# V1 numbering: ensure required fields (incl. CM Proforma) exist as Custom Fields.
	from casamoderna_dms.v1_numbering import ensure_v1_numbering_fields

	ensure_v1_numbering_fields()

	# Surface PF numbers in preview/header and list surfaces.
	changes = []
	changes.append(
		_set_custom_field_props(
			"CM Proforma",
			"cm_v1_draft_no",
			{
				"in_preview": 1,
				"in_list_view": 0,
				"depends_on": "eval:!doc.cm_pf_issued and doc.cm_v1_draft_no",
			},
		)
	)
	changes.append(
		_set_custom_field_props(
			"CM Proforma",
			"cm_v1_operational_no",
			{
				"in_preview": 1,
				"in_list_view": 1,
				"depends_on": "eval:doc.cm_pf_issued and doc.cm_v1_operational_no",
			},
		)
	)

	# Ensure PF print format exists.
	_ensure_print_format(
		"CasaModerna Proforma",
		"CM Proforma",
		"""<h3>Proforma {{ doc.cm_v1_operational_no or doc.cm_v1_draft_no or doc.name }}</h3>

<p class=small><strong>Bank document:</strong> Proforma (PF). <strong>Not a tax invoice.</strong></p>

<div class=row>
  <div class=col-xs-6><strong>Customer</strong><br>{{ doc.customer_name or doc.customer or '' }}</div>
  <div class=col-xs-6 text-right><strong>Issued</strong><br>{{ doc.get_formatted('cm_pf_issued_on') or '' }}</div>
</div>

{%- if doc.quotation -%}
<p class=small><strong>Source Quotation</strong>: {{ doc.quotation }}</p>
{%- endif -%}
{%- if doc.sales_order -%}
<p class=small><strong>Source Sales Order</strong>: {{ doc.sales_order }}</p>
{%- endif -%}

<hr>

<table class="table table-bordered">
  <thead>
    <tr>
      <th style="width:5%">#</th>
      <th>Item</th>
      <th class=text-right style="width:12%">Qty</th>
      <th class=text-right style="width:18%">Amount</th>
    </tr>
  </thead>
  <tbody>
  {%- for row in doc.items -%}
    <tr>
      <td>{{ row.idx }}</td>
      <td>{{ row.item_code }}<br><span class=small>{{ row.description or '' }}</span></td>
      <td class=text-right>{{ row.qty }}</td>
      <td class=text-right>{{ row.get_formatted('amount', doc) }}</td>
    </tr>
  {%- endfor -%}
  </tbody>
</table>

<div class=row>
  <div class=col-xs-6>
    {%- if doc.notes -%}
    <p><strong>Notes</strong><br>{{ doc.notes }}</p>
    {%- endif -%}
  </div>
  <div class=col-xs-6>
    <table class="table table-bordered">
      <tr><th>Grand Total</th><td class=text-right>{{ doc.get_formatted('grand_total') }}</td></tr>
    </table>
  </div>
</div>
""",
	)

	# Set default print format if not already set.
	current_pf = frappe.db.get_value("DocType", "CM Proforma", "default_print_format")
	if not current_pf:
		frappe.db.set_value("DocType", "CM Proforma", "default_print_format", "CasaModerna Proforma", update_modified=False)

	# UI entry points on Quotation and Sales Order.
	_ensure_client_script(
		"Quotation - CasaModerna Proforma (PF)",
		"Quotation",
		"""frappe.ui.form.on('Quotation',{refresh(frm){if(frm.is_new()||!frm.doc||!frm.doc.name||!frm.doc.customer)return;frm.add_custom_button(__('Create Proforma (PF)'),()=>{frappe.call({method:'casamoderna_dms.proforma_pf.create_proforma_from_quotation',args:{quotation:frm.doc.name},callback:(r)=>{const m=r&&r.message?r.message:null;if(m&&m.name){frappe.set_route('Form','CM Proforma',m.name);}}});});}});""",
	)
	_ensure_client_script(
		"Sales Order - CasaModerna Proforma (PF)",
		"Sales Order",
		"""frappe.ui.form.on('Sales Order',{refresh(frm){if(frm.is_new()||!frm.doc||!frm.doc.name||!frm.doc.customer)return;frm.add_custom_button(__('Create Proforma (PF)'),()=>{frappe.call({method:'casamoderna_dms.proforma_pf.create_proforma_from_sales_order',args:{sales_order:frm.doc.name},callback:(r)=>{const m=r&&r.message?r.message:null;if(m&&m.name){frappe.set_route('Form','CM Proforma',m.name);}}});});}});""",
	)

	frappe.clear_cache()
	frappe.logger("casamoderna_dms").info({"slice": "010", "patch": __name__, "changes": changes})
