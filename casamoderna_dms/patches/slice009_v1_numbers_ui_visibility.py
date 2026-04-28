from __future__ import annotations

import frappe


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
	"""Slice 009: surface V1-visible number fields in UI surfaces.

	Constraints:
	- UI-only: list + preview/header visibility
	- No numbering logic changes
	- No print format changes
	"""
	# Use conditional visibility to keep the preview/header surface compact.
	# List view cannot be conditional; operational/fiscal are shown and draft is not.
	cfg: dict[str, dict[str, dict]] = {
		"Quotation": {
			"cm_v1_draft_no": {
				"in_preview": 1,
				"in_list_view": 0,
				"depends_on": "eval:doc.docstatus==0 and doc.cm_v1_draft_no",
			},
			"cm_v1_operational_no": {
				"in_preview": 1,
				"in_list_view": 1,
				"depends_on": "eval:doc.docstatus==1 and doc.cm_v1_operational_no",
			},
		},
		"Sales Order": {
			"cm_v1_draft_no": {
				"in_preview": 1,
				"in_list_view": 0,
				"depends_on": "eval:doc.docstatus==0 and doc.cm_v1_draft_no",
			},
			"cm_v1_operational_no": {
				"in_preview": 1,
				"in_list_view": 1,
				"depends_on": "eval:doc.docstatus==1 and doc.cm_v1_operational_no",
			},
		},
		"Delivery Note": {
			"cm_v1_draft_no": {
				"in_preview": 1,
				"in_list_view": 0,
				"depends_on": "eval:doc.docstatus==0 and doc.cm_v1_draft_no",
			},
			"cm_v1_operational_no": {
				"in_preview": 1,
				"in_list_view": 1,
				"depends_on": "eval:doc.docstatus==1 and doc.cm_v1_operational_no",
			},
		},
		"Sales Invoice": {
			"cm_v1_draft_no": {
				"in_preview": 1,
				"in_list_view": 0,
				"depends_on": "eval:doc.docstatus==0 and doc.cm_v1_draft_no",
			},
			"cm_v1_operational_no": {
				"in_preview": 1,
				"in_list_view": 1,
				"depends_on": "eval:doc.docstatus==1 and doc.cm_v1_operational_no",
			},
			"cm_v1_fiscal_record_no": {
				"in_preview": 1,
				"in_list_view": 1,
				"depends_on": "eval:doc.docstatus==1 and doc.cm_v1_fiscal_record_no",
			},
		},
		"POS Invoice": {
			"cm_v1_draft_no": {
				"in_preview": 1,
				"in_list_view": 0,
				"depends_on": "eval:doc.docstatus==0 and doc.cm_v1_draft_no",
			},
			"cm_v1_operational_no": {
				"in_preview": 1,
				"in_list_view": 1,
				"depends_on": "eval:doc.docstatus==1 and doc.cm_v1_operational_no",
			},
			"cm_v1_fiscal_record_no": {
				"in_preview": 1,
				"in_list_view": 1,
				"depends_on": "eval:doc.docstatus==1 and doc.cm_v1_fiscal_record_no",
			},
		},
	}

	changes = []
	for dt, fields in cfg.items():
		for fieldname, props in fields.items():
			changes.append(_set_custom_field_props(dt, fieldname, props))

	# Keep cache coherent after meta changes.
	frappe.clear_cache()

	# Keep a small audit trail in patch logs.
	frappe.logger("casamoderna_dms").info({"slice": "009", "patch": __name__, "changes": changes})
