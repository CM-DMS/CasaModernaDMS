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


def _tab_section_context(meta) -> dict[str, dict[str, str | None]]:
	"""Compute per-field tab + section labels using meta field sequence."""
	ctx: dict[str, dict[str, str | None]] = {}
	current_tab = None
	current_section = None

	for df in meta.fields:
		fn = getattr(df, "fieldname", None)
		ft = getattr(df, "fieldtype", None)
		label = (getattr(df, "label", None) or "").strip() or None

		if ft == "Tab Break":
			current_tab = label
			current_section = None
		elif ft == "Section Break":
			current_section = label

		if fn:
			ctx[fn] = {"tab": current_tab, "section": current_section}

	return ctx


def _field_dump(meta) -> list[dict]:
	ctx = _tab_section_context(meta)
	rows: list[dict] = []
	for df in meta.fields:
		fn = getattr(df, "fieldname", None)
		if not fn:
			continue
		c = ctx.get(fn, {})
		rows.append(
			{
				"fieldname": fn,
				"label": getattr(df, "label", None),
				"fieldtype": getattr(df, "fieldtype", None),
				"tab": c.get("tab"),
				"section": c.get("section"),
				"hidden": int(getattr(df, "hidden", 0) or 0),
				"reqd": int(getattr(df, "reqd", 0) or 0),
				"read_only": int(getattr(df, "read_only", 0) or 0),
				"permlevel": int(getattr(df, "permlevel", 0) or 0),
				"depends_on": getattr(df, "depends_on", None),
				"mandatory_depends_on": getattr(df, "mandatory_depends_on", None),
				"read_only_depends_on": getattr(df, "read_only_depends_on", None),
				"collapsible": int(getattr(df, "collapsible", 0) or 0),
				"collapsed": int(getattr(df, "collapsed", 0) or 0),
				"in_preview": int(getattr(df, "in_preview", 0) or 0),
				"in_list_view": int(getattr(df, "in_list_view", 0) or 0),
				"bold": int(getattr(df, "bold", 0) or 0),
			}
		)
	return rows


def audit_sales_docs_declutter() -> dict:
	"""Read-only audit for sales-doc declutter work.

	Outputs:
	- All fields (with tab/section context + key visibility flags)
	- Custom Field names for the doctype
	- Enabled Client Scripts for the doctype

	Safe to run on live sites.
	"""
	frappe.set_user("Administrator")

	out = {
		"doctypes": {},
		"target_doctypes": list(TARGET_DOCTYPES),
	}

	for dt in TARGET_DOCTYPES:
		meta = frappe.get_meta(dt)
		custom_fields = frappe.get_all(
			"Custom Field",
			filters={"dt": dt},
			fields=["name", "fieldname", "fieldtype", "insert_after", "hidden", "reqd", "read_only", "depends_on", "permlevel"],
			order_by="fieldname asc, name asc",
		)
		client_scripts = frappe.get_all(
			"Client Script",
			filters={"dt": dt, "enabled": 1},
			fields=["name", "dt", "enabled", "view", "module", "modified"],
			order_by="name asc",
		)

		out["doctypes"][dt] = {
			"field_count": len([df for df in meta.fields if getattr(df, "fieldname", None)]),
			"fields": _field_dump(meta),
			"custom_fields": custom_fields,
			"enabled_client_scripts": client_scripts,
		}

	return json.loads(json.dumps(out, default=str))
