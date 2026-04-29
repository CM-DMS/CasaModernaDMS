"""item_detail.py — single-item fetch with virtual field computation.

The standard Frappe v2 document endpoint (GET /api/v2/document/Item/<name>)
does NOT run the ``onload`` hook, so virtual fields (is_virtual=1) that are
populated in ``compute_item_virtual_fields`` are returned as their default
value (0.0 for Currency).

This endpoint loads the Item, runs ``onload``, and returns the full dict
including computed virtual fields.
"""

from __future__ import annotations

import frappe


@frappe.whitelist()
def get_item(name: str) -> dict:
	"""Return a single Item document with virtual pricing fields populated."""
	doc = frappe.get_doc("Item", name)
	doc.check_permission("read")
	doc.apply_fieldlevel_read_permissions()
	doc.run_method("onload")
	return doc.as_dict()


@frappe.whitelist()
def get_cm_product(name: str) -> dict:
	"""Return a single CM Product document with free_stock appended."""
	doc = frappe.get_doc("CM Product", name)
	doc.check_permission("read")
	result = doc.as_dict()
	# Append free_stock from tabBin (item_code = cm_product.name because thin Item uses the same code)
	rows = frappe.db.sql(
		"SELECT SUM(IFNULL(actual_qty,0) - IFNULL(reserved_qty,0)) AS fs"
		" FROM `tabBin` WHERE item_code = %s",
		name,
		as_dict=True,
	)
	result["free_stock"] = float((rows[0].fs or 0) if rows else 0)
	return result
