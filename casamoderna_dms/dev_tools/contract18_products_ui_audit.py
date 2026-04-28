from __future__ import annotations

import json

import frappe


AUDIT_DOCTYPES = ["Item", "Item Group", "Workspace"]
PATTERNS = [
	"Contract",
	"contract",
	"prototype",
	"DEV",
	"dev",
	"engineering",
	"cm_",
]


def _matches(v: str | None) -> list[str]:
	if not v:
		return []
	hits = []
	for p in PATTERNS:
		if p in v:
			hits.append(p)
	return hits


def audit() -> dict:
	frappe.set_user("Administrator")

	custom_fields = frappe.get_all(
		"Custom Field",
		filters={"dt": ["in", AUDIT_DOCTYPES]},
		fields=[
			"name",
			"dt",
			"fieldname",
			"fieldtype",
			"label",
			"description",
			"options",
			"depends_on",
		],
		order_by="dt asc, fieldname asc, name asc",
	)
	custom_field_hits = []
	for cf in custom_fields:
		matched = {}
		for k in ["label", "description", "options", "depends_on"]:
			hits = _matches(cf.get(k))
			if hits:
				matched[k] = {"hits": hits, "value": cf.get(k)}
		if matched:
			custom_field_hits.append({"name": cf.get("name"), "dt": cf.get("dt"), "fieldname": cf.get("fieldname"), "fieldtype": cf.get("fieldtype"), "matched": matched})

	property_setters = frappe.get_all(
		"Property Setter",
		filters={
			"doc_type": ["in", AUDIT_DOCTYPES],
			"property": ["in", ["label", "description", "options", "default", "depends_on", "read_only_depends_on"]],
		},
		fields=["name", "doc_type", "field_name", "property", "value"],
		order_by="doc_type asc, field_name asc, property asc, name asc",
	)
	property_setter_hits = []
	for ps in property_setters:
		hits = _matches(ps.get("value"))
		if hits:
			property_setter_hits.append({**ps, "hits": hits})

	client_scripts = frappe.get_all(
		"Client Script",
		filters={"enabled": 1, "dt": ["in", AUDIT_DOCTYPES]},
		fields=["name", "dt", "view", "enabled", "script"],
		order_by="dt asc, name asc",
	)
	client_script_hits = []
	for cs in client_scripts:
		hits = _matches(cs.get("script"))
		if hits:
			client_script_hits.append({"name": cs.get("name"), "dt": cs.get("dt"), "view": cs.get("view"), "hits": hits})

	return {
		"site": frappe.local.site,
		"audit_doctypes": AUDIT_DOCTYPES,
		"patterns": PATTERNS,
		"counts": {
			"custom_fields_scanned": len(custom_fields),
			"custom_field_hits": len(custom_field_hits),
			"property_setters_scanned": len(property_setters),
			"property_setter_hits": len(property_setter_hits),
			"client_scripts_scanned": len(client_scripts),
			"client_script_hits": len(client_script_hits),
		},
		"custom_field_hits": custom_field_hits,
		"property_setter_hits": property_setter_hits,
		"client_script_hits": client_script_hits,
	}


def run() -> dict:
	res = audit()
	print(json.dumps(res, indent=2, ensure_ascii=False, default=str))
	return res
