from __future__ import annotations

import frappe


def execute():
	"""Backfill Item.cm_display_name once the field exists."""
	from casamoderna_dms.item_display import backfill_item_display_names

	backfill_item_display_names(commit_every=500)
	frappe.clear_cache(doctype="Item")
