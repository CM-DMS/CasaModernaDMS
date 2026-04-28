from __future__ import annotations

import json

import frappe


SLICE015_TARGET_DOCTYPES = [
	"Quotation",
	"Sales Order",
	"Delivery Note",
	"Sales Invoice",
	"POS Invoice",
	"CM Proforma",
]


def _enabled_client_scripts_for(dt: str) -> list[dict]:
	return frappe.get_all(
		"Client Script",
		filters={"dt": dt, "enabled": 1},
		fields=["name", "dt", "enabled", "view", "module", "modified"],
		order_by="name asc",
	)


def _field_presence(dt: str, fieldnames: list[str]) -> dict[str, bool]:
	meta = frappe.get_meta(dt)
	out: dict[str, bool] = {}
	for fieldname in fieldnames:
		out[fieldname] = bool(meta.get_field(fieldname))
	return out


def audit_slice015_sales_doc_shell() -> dict:
	"""Slice 015 Phase A audit.

	Authoritative DB/meta audit of:
	- enabled Client Scripts for each target Sales Doc doctype
	- presence of V1-visible numbering fields used by the unified shell
	
	This is read-only and safe to run on live sites.
	"""
	frappe.set_user("Administrator")

	doctypes = list(SLICE015_TARGET_DOCTYPES)
	v1_common = ["cm_v1_operational_no", "cm_v1_draft_no"]
	v1_fiscal = ["cm_v1_fiscal_record_no"]

	out = {
		"slice": "015",
		"doctype_count": len(doctypes),
		"doctypes": {},
		"conversion_client_scripts_expected": [
			"Quotation - CasaModerna Conversions",
			"Sales Order - CasaModerna Conversions",
			"Delivery Note - CasaModerna Conversions",
		],
	}

	for dt in doctypes:
		required = list(v1_common)
		if dt in {"Sales Invoice", "POS Invoice"}:
			required += v1_fiscal

		out["doctypes"][dt] = {
			"enabled_client_scripts": _enabled_client_scripts_for(dt),
			"v1_fields_present": _field_presence(dt, required),
			"v1_fields_required": required,
		}

	# Explicitly capture status of Slice 013 conversion scripts (must remain enabled).
	conv = {}
	for name in out["conversion_client_scripts_expected"]:
		if frappe.db.exists("Client Script", name):
			cs = frappe.get_doc("Client Script", name)
			conv[name] = {
				"exists": True,
				"dt": cs.dt,
				"enabled": int(cs.enabled or 0),
				"view": cs.view,
				"modified": str(cs.modified),
			}
		else:
			conv[name] = {"exists": False}
	out["conversion_client_scripts"] = conv

	# Stable markers for deterministic parsing.
	out["notes"] = {
		"no_dom_audit": "DOM anchors cannot be audited server-side; Slice 015 uses resilient client-side selectors.",
	}

	return json.loads(json.dumps(out, default=str))
