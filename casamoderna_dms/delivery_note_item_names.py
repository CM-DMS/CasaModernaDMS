"""delivery_note_item_names.py

Delivery Note — item name policy.

Delivery Notes are INTERNAL warehouse documents.  Warehouse operatives need to
identify physical stock by the manufacturer / supplier product name, not the
CasaModerna internal trade name.

Policy
------
- `item_name` on every Delivery Note Item row is set to the Item master's
  `item_name` (the main / manufacturer name).
- The CasaModerna given name (used on invoices / quotations) is preserved in
  `cm_dn_item_display_name` for traceability.
- Description on DN rows is reset to Item.description so it matches.

Called from:
  hooks.py  →  "Delivery Note": {"before_submit": ..., "validate": ...}
"""

from __future__ import annotations

import frappe


def apply_delivery_note_item_names(doc, method=None):
	"""Swap item_name on every DN row to the master product name.

	This hook fires on validate AND before_submit so the name is always
	correct regardless of how the DN was created (API, SO conversion, etc.).
	"""
	items = getattr(doc, "items", None) or []
	if not items:
		return

	# Collect unique item codes so we can do a single DB query.
	item_codes = list({row.item_code for row in items if getattr(row, "item_code", None)})
	if not item_codes:
		return

	master_rows = frappe.get_all(
		"Item",
		filters={"name": ["in", item_codes]},
		fields=["name", "item_name", "cm_given_name", "description"],
	)
	by_code: dict[str, dict] = {r.name: r for r in master_rows}

	for row in items:
		code = getattr(row, "item_code", None)
		if not code or code not in by_code:
			continue

		master = by_code[code]

		# Main product name (manufacturer / supplier name).
		main_name = (master.item_name or "").strip() or code

		# Preserve the CM name for reference on the row.
		given_name = (master.cm_given_name or "").strip()
		if hasattr(row, "cm_dn_item_display_name"):
			# Store CM name in the custom field so it can be shown if needed.
			row.cm_dn_item_display_name = given_name or main_name

		# Set the warehouse-facing item_name.
		row.item_name = main_name

		# Sync description to the master description so it's consistent.
		master_desc = (master.description or "").strip()
		if master_desc:
			row.description = master_desc


def guard_rounded_totals(doc, method=None):
	"""Ensure base_rounded_total / rounded_total are never None before submit.

	ERPNext's set_total_in_words calls abs(base_rounded_total) without a None
	guard.  If the browser serialised the field as null (e.g. stale session),
	the submission crashes.  This before_submit hook ensures the fields always
	fall back to grand_total so ERPNext never sees None.
	"""
	if doc.base_rounded_total is None:
		doc.base_rounded_total = doc.base_grand_total or 0
	if doc.rounded_total is None:
		doc.rounded_total = doc.grand_total or 0
