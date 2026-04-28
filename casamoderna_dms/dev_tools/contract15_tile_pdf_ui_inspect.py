from __future__ import annotations

import json

import frappe


def inspect() -> dict:
	"""Contract 15 Phase A inspector.

	Reports only live facts; does not mutate data.
	"""
	out: dict = {"contract": 15}

	def _print_format_list(dt: str) -> list[dict]:
		fields = ["name", "standard", "print_format_type"]
		if frappe.db.has_column("Print Format", "default"):
			fields.insert(1, "default")
		pfs = frappe.get_all(
			"Print Format",
			filters={"doc_type": dt, "disabled": 0},
			fields=fields,
		)
		if "default" in fields:
			pfs.sort(key=lambda d: (0 if (d.get("default") or 0) else 1, d.get("name") or ""))
		else:
			pfs.sort(key=lambda d: (d.get("name") or ""))
		return pfs

	out["print_formats"] = {
		"Quotation": _print_format_list("Quotation"),
		"Sales Order": _print_format_list("Sales Order"),
	}

	# Check whether key CasaModerna print formats exist and roughly how they render Qty.
	pf_checks: dict[str, dict] = {}
	for pf_name in ["CasaModerna Quotation", "CasaModerna Sales Order"]:
		if not frappe.db.exists("Print Format", pf_name):
			pf_checks[pf_name] = {"exists": False}
			continue
		doc = frappe.get_doc("Print Format", pf_name)
		html = doc.html or ""
		pf_checks[pf_name] = {
			"exists": True,
			"enabled": int(getattr(doc, "disabled", 0) or 0) == 0,
			"doc_type": getattr(doc, "doc_type", None),
			"print_format_type": getattr(doc, "print_format_type", None),
			"has_qty_header": ("Qty" in html) or ("Quantity" in html),
			"references_tile_mode": "tile_decimal_pricing" in html,
			"references_cm_tile_sqm_qty": "cm_tile_sqm_qty" in html,
			"references_row_qty": "row.qty" in html,
		}
	out["casamoderna_print_formats"] = pf_checks

	# Look for likely default print format fields on common singleton doctypes.
	defaults: dict[str, dict] = {}
	for singleton in ("Print Settings", "Selling Settings"):
		if not frappe.db.exists("DocType", singleton):
			continue
		meta = frappe.get_meta(singleton)
		pf_fields = [df.fieldname for df in meta.fields if getattr(df, "fieldname", None) and "print_format" in df.fieldname]
		if not pf_fields:
			continue
		doc = frappe.get_single(singleton)
		defaults[singleton] = {fn: getattr(doc, fn, None) for fn in pf_fields}
	out["default_print_format_fields"] = defaults

	# Some setups store a default print format directly on the DocType record.
	if frappe.db.has_column("DocType", "default_print_format"):
		out["doctype_default_print_format"] = {
			"Quotation": frappe.db.get_value("DocType", "Quotation", "default_print_format"),
			"Sales Order": frappe.db.get_value("DocType", "Sales Order", "default_print_format"),
		}

	out["derived_sqm_field"] = {
		"preferred": "cm_tile_sqm_qty",
		"quotation_item_has_cm_tile_sqm_qty": bool(frappe.get_meta("Quotation Item").get_field("cm_tile_sqm_qty")),
		"sales_order_item_has_cm_tile_sqm_qty": bool(frappe.get_meta("Sales Order Item").get_field("cm_tile_sqm_qty")),
	}

	return out


def run(site: str | None = None):
	if site:
		frappe.init(site=site)
		frappe.connect()
	try:
		print(json.dumps(inspect(), indent=2, sort_keys=True, default=str))
	finally:
		if site:
			frappe.destroy()
