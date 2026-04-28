from __future__ import annotations

import frappe

from casamoderna_dms.freetext_quote_placeholders import is_placeholder_item_code


def _compose_description(line1: str | None, line2: str | None) -> str:
	l1 = (line1 or "").strip()
	l2 = (line2 or "").strip()
	if l1 and l2:
		return f"{l1}\n{l2}"
	return l1


def fill_row_description(doc, method=None):
	"""Auto-fill selling row description from CM description lines.

	- Only fills when description is blank (never overwrites user edits)
	- Falls back to Item.description when CM lines are absent
	"""
	try:
		item_code = (getattr(doc, "item_code", None) or "").strip()
		if not item_code:
			return
		if is_placeholder_item_code(item_code):
			return

		description = (getattr(doc, "description", None) or "").strip()

		item = frappe.db.get_value(
			"Item",
			item_code,
			["cm_description_line_1", "cm_description_line_2", "description", "item_name"],
			as_dict=True,
		)
		if not item:
			return

		item_desc = (item.get("description") or "").strip()
		item_name = (item.get("item_name") or "").strip()
		# Only treat blank or ERPNext-default descriptions as safe to replace.
		is_default = (not description) or (description == item_desc) or (item_name and description == item_name)
		if not is_default:
			return

		cm_desc = _compose_description(item.get("cm_description_line_1"), item.get("cm_description_line_2"))
		if cm_desc:
			doc.description = cm_desc
			return

		fallback = item_desc or item_name
		if fallback:
			doc.description = fallback
	except Exception:
		# Never block sales docs on description helper.
		return


_ITEM_NAME_MAX = 140


def truncate_row_item_names(doc, method=None):
	"""Guard: item_name on Quotation/Sales Order Item is a Data(140) field.

	If item_name still exceeds 140 after frontend splitting (e.g. very long
	multi-wardrobe descriptions), split at the last ' | ' that fits rather
	than hard-truncating.  The overflow is prepended to description so no
	text is lost.
	"""
	for row in getattr(doc, "items", None) or []:
		val = (getattr(row, "item_name", None) or "").strip()
		if len(val) <= _ITEM_NAME_MAX:
			continue

		# Try to split at a pipe boundary that fits within 140 chars
		cut = val.rfind(" | ", 0, _ITEM_NAME_MAX)
		if cut > 0:
			overflow = val[cut + 3:]   # text after the last fitting " | "
			val      = val[:cut]
		else:
			# No pipe found — hard-cut at word boundary
			cut = val.rfind(" ", 0, _ITEM_NAME_MAX)
			overflow = val[(cut if cut > 0 else _ITEM_NAME_MAX):]
			val      = val[:(cut if cut > 0 else _ITEM_NAME_MAX)]

		row.item_name = val.strip()
		if overflow:
			existing = (getattr(row, "description", None) or "").strip()
			row.description = overflow.strip() + ("\n" + existing if existing else "")


def fill_sales_doc_row_descriptions(doc, method=None):
	"""Ensure row descriptions on Quotation/Sales Order reflect CM lines.

	Runs on parent validate to avoid being overwritten by ERPNext's own set_missing_values
	and item-details routines.
	"""
	try:
		items = getattr(doc, "items", None) or []
		if not items:
			return

		codes = []
		for row in items:
			code = (getattr(row, "item_code", None) or "").strip()
			if code:
				codes.append(code)
		if not codes:
			return

		rows = frappe.get_all(
			"Item",
			filters={"name": ["in", list(set(codes))]},
			fields=["name", "cm_description_line_1", "cm_description_line_2", "description", "item_name"],
		)
		item_by_name = {r.name: r for r in rows}

		for row in items:
			code = (getattr(row, "item_code", None) or "").strip()
			if not code:
				continue
			if is_placeholder_item_code(code):
				continue
			item = item_by_name.get(code)
			if not item:
				continue

			current = (getattr(row, "description", None) or "").strip()
			item_desc = (getattr(item, "description", None) or "").strip()
			item_name = (getattr(item, "item_name", None) or "").strip()
			is_default = (not current) or (current == item_desc) or (item_name and current == item_name)
			if not is_default:
				continue

			cm_desc = _compose_description(getattr(item, "cm_description_line_1", None), getattr(item, "cm_description_line_2", None))
			if cm_desc:
				row.description = cm_desc
				continue
			if item_desc or item_name:
				row.description = item_desc or item_name
	except Exception:
		return
