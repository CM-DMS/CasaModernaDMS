from __future__ import annotations

import frappe


SHELL_TOKEN = "CM_SALES_DOC_SHELL_V1"


def _ensure_client_script(name: str, dt: str, script: str) -> None:
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
		if (doc.module or "") != "Selling":
			doc.module = "Selling"
			changed = True
		if changed:
			doc.save(ignore_permissions=True)
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
	"""Slice 021: Unified V1 Sales Docs UI shell — Phase 1 wrappers.

	UI-only:
	- Updates the thin per-Doctype wrapper Client Scripts to pass the required V1 label mapping.
	- Does NOT change conversion logic (Slice 013), numbering, workflow, pricing, tiles, or guardrails.
	"""
	frappe.set_user("Administrator")

	wrapper = (
		"// {token}\n"
		"frappe.ui.form.on('{dt}',{{refresh(frm){{\n"
		"\tif(!window.cm_sales_doc_shell||!window.cm_sales_doc_shell.init){{\n"
		"\t\tconsole.warn('{token}: shared shell not loaded');\n"
		"\t\treturn;\n"
		"\t}}\n"
		"\twindow.cm_sales_doc_shell.init(frm, {{doctype_label: '{label}'}});\n"
		"}}}});\n"
	)

	# Doctype label mapping (V1-like): QT/SO/DN/IN/CS/PF, and returns are handled client-side.
	_ensure_client_script(
		"Quotation - CasaModerna Sales Doc Shell",
		"Quotation",
		wrapper.format(token=SHELL_TOKEN, dt="Quotation", label="Quotation"),
	)
	_ensure_client_script(
		"Sales Order - CasaModerna Sales Doc Shell",
		"Sales Order",
		wrapper.format(token=SHELL_TOKEN, dt="Sales Order", label="Sales Order"),
	)
	_ensure_client_script(
		"Delivery Note - CasaModerna Sales Doc Shell",
		"Delivery Note",
		wrapper.format(token=SHELL_TOKEN, dt="Delivery Note", label="Delivery Note"),
	)
	_ensure_client_script(
		"Sales Invoice - CasaModerna Sales Doc Shell",
		"Sales Invoice",
		wrapper.format(token=SHELL_TOKEN, dt="Sales Invoice", label="Invoice"),
	)
	_ensure_client_script(
		"POS Invoice - CasaModerna Sales Doc Shell",
		"POS Invoice",
		wrapper.format(token=SHELL_TOKEN, dt="POS Invoice", label="Cash Sale"),
	)
	_ensure_client_script(
		"CM Proforma - CasaModerna Sales Doc Shell",
		"CM Proforma",
		wrapper.format(token=SHELL_TOKEN, dt="CM Proforma", label="Proforma"),
	)

	frappe.clear_cache()
	frappe.logger("casamoderna_dms").info({"slice": "021", "patch": __name__})
