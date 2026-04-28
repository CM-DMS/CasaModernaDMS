from __future__ import annotations

import frappe


def validate_tile_master_fields(doc, method=None):
	"""Contract 16: bounded validation for tile conversion master fields.

	Rules:
	- Do not force tiles-per-box mandatory (business may not know).
	- If a tile item provides cm_tiles_per_box, it must be > 0.
	- Keep existing enforcement for cm_sqm_per_box on sales rows (qty>0) unchanged.
	"""
	if getattr(doc, "doctype", None) != "Item":
		return

	rounding_mode = (getattr(doc, "cm_pricing_rounding_mode", None) or "").strip()
	if rounding_mode != "tile_decimal_pricing":
		return

	# Only validate when the field exists on this site.
	if not hasattr(doc, "cm_tiles_per_box"):
		return

	val = getattr(doc, "cm_tiles_per_box", None)
	if val in (None, ""):
		return

	try:
		val_int = int(val)
	except Exception:
		frappe.throw("Tiles per Box must be a whole number")
		return

	if val_int <= 0:
		frappe.throw("Tiles per Box must be > 0 when provided for tile items")
