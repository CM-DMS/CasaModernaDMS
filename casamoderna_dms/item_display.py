from __future__ import annotations

import frappe


def compute_item_display_name(doc) -> str:
	base = (getattr(doc, "item_name", None) or getattr(doc, "item_code", None) or getattr(doc, "name", None) or "").strip()
	cm_name = (getattr(doc, "cm_given_name", None) or "").strip()
	if not base and cm_name:
		return cm_name
	if not cm_name:
		return base
	if cm_name.lower() in base.lower():
		return base
	return f"{base} — {cm_name}"


def sync_item_description(doc, method=None):
	"""Keep ERPNext's standard `description` field in sync with DMS structured lines.

	DMS is the source of truth for product content.  Any edit via the DMS frontend
	writes cm_description_line_1 / cm_description_line_2; this hook ensures the
	ERPNext-native `description` field is never stale (used in print formats, emails,
	purchase orders, etc.).

	Policy:
	  - If at least one DMS line has content, overwrite `description`.
	  - If both DMS lines are blank, leave `description` untouched so existing data
	    imported before DMS adoption is not erased.
	"""
	line1 = (getattr(doc, "cm_description_line_1", None) or "").strip()
	line2 = (getattr(doc, "cm_description_line_2", None) or "").strip()
	parts = [p for p in [line1, line2] if p]
	if parts:
		doc.description = "\n".join(parts)


def sync_item_display_name(doc, method=None):
	"""Set cm_display_name in-memory (virtual field — not persisted to DB).

	cm_display_name is derived from item_name + cm_given_name on every validate.
	The field carries is_virtual=1 so Frappe never writes it to tabItem.
	"""
	if not hasattr(doc, "cm_display_name"):
		return
	doc.cm_display_name = compute_item_display_name(doc)


def compute_item_virtual_fields(doc, method=None):
	"""Populate all virtual Item fields when a doc is loaded.

	Called from the ``onload`` doc event so that virtual fields are available
	both in the Desk form and when docs are fetched programmatically
	(e.g. get_doc for CSV export).  This is a read-only derivation — no DB writes.
	"""
	# Display name (Group 1)
	if hasattr(doc, "cm_display_name"):
		doc.cm_display_name = compute_item_display_name(doc)

	# Pricing virtual mirrors (Groups 2 & 3) — delegate to the pricing engine's
	# ladder function which sets all virtual pricing fields in-memory.
	try:
		from casamoderna_dms.cm_pricing import apply_supplier_ladder
		apply_supplier_ladder(doc)
	except Exception:
		pass  # Never block doc load for virtual-field derivation failures


def backfill_item_display_names(commit_every: int = 500) -> dict:
	"""No-op: cm_display_name is now a virtual field and is never stored in DB.

	The function is kept so that the patch
	``ux_integration_backfill_item_display_name`` continues to execute without
	error on sites already running the dedup migration.
	"""
	return {"updated": 0, "skipped": 0, "reason": "cm_display_name is virtual — no backfill needed"}
