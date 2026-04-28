from __future__ import annotations

import json

import frappe


TARGET_DOCTYPES = [
	"Quotation",
	"Sales Order",
	"Delivery Note",
	"Sales Invoice",
	"POS Invoice",
	"CM Proforma",
]


def _script_flags(script: str) -> dict:
	s = (script or "")
	return {
		"has_shell_token": "CM_SALES_DOC_SHELL_V1" in s,
		"mentions_cm_sales_doc_shell": "cm_sales_doc_shell" in s,
		"mentions_convert_group": "__('Convert')" in s or "Convert" in s,
		"mentions_ab_split": "AB Split" in s or "ab_split" in s,
		"mentions_proforma": "Proforma" in s or "PF" in s,
	}


def audit_slice021_sales_doc_shell_current_state() -> dict:
	"""Slice 021 Phase A audit (read-only).

	Collects evidence per target doctype:
	- Enabled Client Scripts (names + quick flags)
	- Field anchors relevant to the shell (party/customer, v1 numbers, state/status)
	- Presence of shared shell assets in hooks
	"""
	frappe.set_user("Administrator")

	out: dict = {
		"site": frappe.local.site,
		"doctypes": {},
		"hooks": {
			"app_include_js": [],
			"app_include_css": [],
		},
	}

	try:
		import casamoderna_dms.hooks as cm_hooks

		out["hooks"]["app_include_js"] = list(getattr(cm_hooks, "app_include_js", []) or [])
		out["hooks"]["app_include_css"] = list(getattr(cm_hooks, "app_include_css", []) or [])
	except Exception as e:  # noqa: BLE001
		out["hooks"]["error"] = str(e)

	for dt in TARGET_DOCTYPES:
		meta = frappe.get_meta(dt)

		scripts = frappe.get_all(
			"Client Script",
			filters={"dt": dt, "view": "Form", "enabled": 1},
			fields=["name", "dt", "enabled", "modified", "script"],
			order_by="name asc",
			limit=2000,
		)

		scripts_out = []
		for s in scripts:
			scripts_out.append(
				{
					"name": s.get("name"),
					"enabled": int(s.get("enabled") or 0),
					"modified": str(s.get("modified")),
					"flags": _script_flags(s.get("script") or ""),
				}
			)

		anchors = {
			"has_party_name": bool(meta.get_field("party_name")),
			"has_customer": bool(meta.get_field("customer")),
			"has_customer_name": bool(meta.get_field("customer_name")),
			"has_cm_v1_operational_no": bool(meta.get_field("cm_v1_operational_no")),
			"has_cm_v1_draft_no": bool(meta.get_field("cm_v1_draft_no")),
			"has_cm_v1_fiscal_record_no": bool(meta.get_field("cm_v1_fiscal_record_no")),
			"has_workflow_state": bool(meta.get_field("workflow_state")),
			"has_status": bool(meta.get_field("status")),
			"has_is_return": bool(meta.get_field("is_return")),
			"has_items": bool(meta.get_field("items")),
		}

		out["doctypes"][dt] = {
			"anchors": anchors,
			"enabled_client_scripts": scripts_out,
		}

	return json.loads(json.dumps(out, default=str))


def execute() -> None:
	res = audit_slice021_sales_doc_shell_current_state()
	print(json.dumps(res, indent=2, sort_keys=True))
