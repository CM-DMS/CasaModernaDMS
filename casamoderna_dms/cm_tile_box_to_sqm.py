from __future__ import annotations

import frappe


def apply_tile_box_to_sqm(doc, method=None):
	"""Tile items: qty IS the sqm value (entered directly as sqm).

	Copy qty into cm_tile_sqm_qty and cm_display_sqm_qty so that print
	formats can display 'X.XX sqm' instead of falling back to the plain
	raw-number path.

	Detection: look up cm_pricing_rounding_mode on the Item master (source of
	truth) so this works correctly on first save of a new document, before
	apply_sales_doc_pricing has had a chance to stamp the row field.
	"""
	if getattr(doc, "doctype", None) not in {"Quotation", "Sales Order"}:
		return
	if not hasattr(doc, "items"):
		return

	item_codes = list({
		row.item_code
		for row in (doc.items or [])
		if getattr(row, "item_code", None)
	})
	if not item_codes:
		return

	tile_items = {
		r["name"]
		for r in frappe.get_all(
			"Item",
			filters={"name": ["in", item_codes], "cm_pricing_rounding_mode": "tile_decimal_pricing"},
			fields=["name"],
		)
	}

	for row in doc.items:
		if getattr(row, "item_code", None) not in tile_items:
			continue

		qty = float(getattr(row, "qty", 0) or 0)
		if hasattr(row, "cm_tile_sqm_qty"):
			row.cm_tile_sqm_qty = qty
		if hasattr(row, "cm_display_sqm_qty"):
			row.cm_display_sqm_qty = qty
