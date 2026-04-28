from __future__ import annotations

import json

import frappe


def _has_field(doctype: str, fieldname: str) -> bool:
	return bool(frappe.get_meta(doctype).get_field(fieldname))


def _pf_summary(pf_name: str) -> dict:
	if not frappe.db.exists("Print Format", pf_name):
		return {"exists": False}
	doc = frappe.get_doc("Print Format", pf_name)
	html = doc.html or ""
	# Keep checks simple and deterministic.
	return {
		"exists": True,
		"enabled": int(getattr(doc, "disabled", 0) or 0) == 0,
		"references_row_qty": "row.qty" in html,
		"references_cm_sqm": "cm_sqm" in html or "cm_display_sqm" in html or "cm_tile_sqm" in html,
		"references_cm_box_qty": "cm_box_qty" in html,
		"has_qty_header": "Qty" in html or "Quantity" in html,
	}


def inspect() -> dict:
	"""Phase A inspector for Contract 14.

	Reports only live facts; does not mutate data.
	"""
	out: dict = {"contract": 14}

	# 1) Product master: field presence + tile mode storage
	item_meta = frappe.get_meta("Item")
	# Provide a small layout window around existing CM pricing fields to guide safe insert_after.
	cm_anchor_fields = [
		"cm_rrp_ex_vat",
		"cm_discount_target_percent",
		"cm_pricing_rounding_mode",
	]
	anchor_indexes = [
		i for i, df in enumerate(item_meta.fields) if getattr(df, "fieldname", None) in set(cm_anchor_fields)
	]
	anchor_idx = min(anchor_indexes) if anchor_indexes else None
	start = max(0, (anchor_idx or 0) - 20)
	end = min(len(item_meta.fields), (anchor_idx or 0) + 30)
	layout_ctx = []
	for df in item_meta.fields[start:end]:
		fn = getattr(df, "fieldname", None)
		if not fn:
			continue
		layout_ctx.append(
			{
				"fieldname": fn,
				"fieldtype": getattr(df, "fieldtype", None),
				"label": getattr(df, "label", None),
				"insert_after": getattr(df, "insert_after", None),
			}
		)

	out["item"] = {
		"has_cm_tiles_per_box": bool(item_meta.get_field("cm_tiles_per_box")),
		"has_cm_sqm_per_box": bool(item_meta.get_field("cm_sqm_per_box")),
		"tile_mode_field_candidates_present": {
			"cm_pricing_rounding_mode": bool(item_meta.get_field("cm_pricing_rounding_mode")),
			"cm_is_tile": bool(item_meta.get_field("cm_is_tile")),
			"cm_tile_mode": bool(item_meta.get_field("cm_tile_mode")),
		},
		"cm_pricing_layout_context": layout_ctx,
	}

	# Try to detect a reliable tile discriminator from existing implementation patterns.
	# (Contract 12 used cm_pricing_rounding_mode = tile_decimal_pricing for the tile exception.)
	tile_items = []
	if item_meta.get_field("cm_pricing_rounding_mode"):
		fields = [
			"name",
			"item_code",
			"item_name",
			"stock_uom",
			"sales_uom",
			"cm_pricing_rounding_mode",
			"cm_rrp_ex_vat",
		]
		if item_meta.get_field("cm_tiles_per_box"):
			fields.append("cm_tiles_per_box")
		if item_meta.get_field("cm_sqm_per_box"):
			fields.append("cm_sqm_per_box")
		tile_items = frappe.get_all(
			"Item",
			filters={"cm_pricing_rounding_mode": "tile_decimal_pricing", "disabled": 0},
			fields=fields,
			limit=5,
		)
	out["tile_sample_items"] = tile_items

	# 2) Sales documents: child doctypes and qty fields
	def _child_dt(parent_dt: str) -> str | None:
		m = frappe.get_meta(parent_dt)
		df = m.get_field("items")
		return getattr(df, "options", None) if df else None

	q_item_dt = _child_dt("Quotation")
	so_item_dt = _child_dt("Sales Order")
	out["sales"] = {
		"Quotation.items_child_doctype": q_item_dt,
		"Sales Order.items_child_doctype": so_item_dt,
	}

	for dt in [d for d in [q_item_dt, so_item_dt] if d]:
		meta = frappe.get_meta(dt)
		out["sales"][dt] = {
			"has_qty": bool(meta.get_field("qty")),
			"has_uom": bool(meta.get_field("uom")),
			"has_stock_uom": bool(meta.get_field("stock_uom")),
			"has_conversion_factor": bool(meta.get_field("conversion_factor")),
			"has_stock_qty": bool(meta.get_field("stock_qty")),
			"has_cm_box_qty": bool(meta.get_field("cm_box_qty")),
			"has_cm_tile_sqm_qty": bool(meta.get_field("cm_tile_sqm_qty")),
			"has_cm_display_sqm_qty": bool(meta.get_field("cm_display_sqm_qty")),
		}

	# 3) Current quantity behaviour: we can't infer live UI flow, but we can show relevant standard fields.
	out["uom_conversion_mechanism_present"] = {
		"Item UOM table present": bool(item_meta.get_field("uoms")),
		"Quotation Item conversion_factor field": bool(_has_field(q_item_dt, "conversion_factor")) if q_item_dt else False,
		"Sales Order Item conversion_factor field": bool(_has_field(so_item_dt, "conversion_factor")) if so_item_dt else False,
	}

	# 4) Print/PDF path: check current CasaModerna print formats
	out["print_formats"] = {
		"CasaModerna Quotation": _pf_summary("CasaModerna Quotation"),
		"CasaModerna Sales Order": _pf_summary("CasaModerna Sales Order"),
	}

	return out


def run(site: str | None = None):
	if site:
		frappe.init(site=site)
		frappe.connect()
	try:
		res = inspect()
		print(json.dumps(res, indent=2, sort_keys=True, default=str))
	finally:
		if site:
			frappe.destroy()
