from __future__ import annotations

from dataclasses import dataclass

import frappe


PLACEHOLDER_ITEM_CODES = {
	"CM-FREETEXT",
	"CM-DELIVERY",
	"CM-DELIVERY_GOZO",
	"CM-LIFTER",
	"CM-INSTALLATION",
}

# Deterministic generic names we enforce in the patch; used to treat ERPNext auto-filled
# default descriptions as "missing" so sales users must enter real free text.
PLACEHOLDER_ITEM_NAMES = {
	"CM-FREETEXT": "Free Text Line",
	"CM-DELIVERY": "Delivery Charge",
	"CM-DELIVERY_GOZO": "Gozo Delivery Charge",
	"CM-LIFTER": "Lifter Charge",
	"CM-INSTALLATION": "Installation Charge",
}


def is_placeholder_item_code(item_code: str | None) -> bool:
	return (item_code or "").strip() in PLACEHOLDER_ITEM_CODES


def _norm(v) -> str:
	return (v or "").strip()


def remap_ft_item_codes(doc, method=None):
	"""Before-validate: remap legacy FT-YYYYMMDD-XXXX codes to CM-FREETEXT.

	Old frontend versions generated synthetic FT- codes that don't exist in the
	Item master, causing DoesNotExistError during ERPNext's set_missing_item_details.
	Remapping to the real CM-FREETEXT item fixes the lookup without losing item_name.
	"""
	for row in getattr(doc, "items", None) or []:
		code = (getattr(row, "item_code", None) or "").strip()
		if code.startswith("FT-"):
			row.item_code = "CM-FREETEXT"


def validate_sales_doc_free_text_lines(doc, method=None):
	"""Contract: free-text quoting via placeholder Items.

	Rules (server-side, deterministic):
	- For placeholder lines, a meaningful description is required.
	- Treat ERPNext default auto-filled placeholder descriptions as empty.
	- Never touch normal items.
	"""
	if getattr(doc, "doctype", None) not in {"Quotation", "Sales Order"}:
		return

	items = getattr(doc, "items", None) or []
	if not items:
		return

	missing_rows: list[int] = []
	for row in items:
		item_code = _norm(getattr(row, "item_code", None))
		if item_code not in PLACEHOLDER_ITEM_CODES:
			continue

		description = _norm(getattr(row, "description", None))
		generic_name = _norm(PLACEHOLDER_ITEM_NAMES.get(item_code))

		# Consider "blank" if it's empty or still the generic placeholder label.
		if not description or (generic_name and description == generic_name) or description == item_code:
			missing_rows.append(int(getattr(row, "idx", 0) or 0))

	if missing_rows:
		raise frappe.ValidationError("Description is required for free-text service/charge lines.")
