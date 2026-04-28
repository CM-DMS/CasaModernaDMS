import frappe
from frappe import _


def _has_any_item_reference(doc, fieldnames: list[str]) -> bool:
	items = getattr(doc, "items", None) or []
	for row in items:
		for fieldname in fieldnames:
			if getattr(row, fieldname, None):
				return True
	return False


def validate_derived_only_delivery_note(doc, method=None):
	"""Prevent direct creation of Delivery Notes; allow derived creation via mapping.

	Slice 003 policy: Delivery Note must be created from a Sales Order only.
	We treat a Delivery Note as "derived" if any item row references an upstream Sales Order
	via typical link fields.
	"""
	if not doc.is_new():
		return

	if not getattr(doc, "items", None):
		return

	# Allow derived notes created from Sales Order mappings.
	derived_reference_fields = [
		"against_sales_order",
		"so_detail",
		"sales_order",
	]

	if _has_any_item_reference(doc, derived_reference_fields):
		return

	frappe.throw(
		_("Delivery Note must be created from a Sales Order. Direct creation is not allowed."),
		frappe.ValidationError,
	)


DN_PLACEHOLDER_ITEM_CODES = [
	"CM-FREETEXT",
	"CM-DELIVERY",
	"CM-DELIVERY_GOZO",
	"CM-LIFTER",
	"CM-INSTALLATION",
	"CM-SEPARATOR",
]


def validate_delivery_note_sales_order_stock_only(doc, method=None):
	"""Slice 003 guardrails for Delivery Note.

	Enforces:
	- Sales Order only source: every row must have against_sales_order
	- Stock items only: Item.is_stock_item must be 1
	- Placeholders disallowed (explicit item_code list)

	Deterministic, human-readable single-line errors.
	"""
	items = getattr(doc, "items", None) or []
	if not items:
		return

	# Defensive: if field is missing in this ERPNext build, fail closed.
	meta = frappe.get_meta("Delivery Note Item")
	if not meta.get_field("against_sales_order"):
		frappe.throw(
			_("Delivery Note guardrail misconfigured: Delivery Note Item.against_sales_order field is missing."),
			frappe.ValidationError,
		)

	# Enforce SO linkage on every row.
	missing_rows: list[int] = []
	for i, row in enumerate(items, start=1):
		idx = int(getattr(row, "idx", 0) or i)
		if not getattr(row, "against_sales_order", None):
			missing_rows.append(idx)
	if missing_rows:
		frappe.throw(
			_("Delivery Note requires Sales Order linkage on every row (against_sales_order). Missing rows: {0}.").format(
				", ".join(str(i) for i in sorted(missing_rows))
			),
			frappe.ValidationError,
		)

	# Explicitly disallow Sales Invoice derived fields (SO-only policy).
	for i, row in enumerate(items, start=1):
		idx = int(getattr(row, "idx", 0) or i)
		if getattr(row, "sales_invoice", None) or getattr(row, "si_detail", None):
			frappe.throw(
				_("Delivery Note must be created from a Sales Order only (Sales Invoice source not allowed). Row {0}.").format(idx),
				frappe.ValidationError,
			)

	# Placeholder bans.
	placeholder_hits = sorted({row.item_code for row in items if getattr(row, "item_code", None) in DN_PLACEHOLDER_ITEM_CODES})
	if placeholder_hits:
		frappe.throw(
			_("Delivery Note cannot include placeholder items: {0}.").format(", ".join(placeholder_hits)),
			frappe.ValidationError,
		)

	# Stock items only.
	item_codes = sorted({row.item_code for row in items if getattr(row, "item_code", None)})
	if not item_codes:
		return

	rows = frappe.get_all(
		"Item",
		filters={"name": ["in", item_codes]},
		fields=["name", "is_stock_item"],
	)
	by_code = {r.name: int(getattr(r, "is_stock_item", 0) or 0) for r in rows}
	missing_items = sorted([c for c in item_codes if c not in by_code])
	if missing_items:
		frappe.throw(
			_("Delivery Note contains unknown Item codes: {0}.").format(", ".join(missing_items)),
			frappe.ValidationError,
		)

	non_stock = sorted([c for c, is_stock in by_code.items() if int(is_stock or 0) == 0])
	if non_stock:
		frappe.throw(
			_("Delivery Note can include stock items only (Item.is_stock_item=1). Non-stock: {0}.").format(", ".join(non_stock)),
			frappe.ValidationError,
		)


def validate_derived_only_sales_invoice(doc, method=None):
	"""Prevent direct creation of Sales Invoices; allow derived creation and credit notes."""
	if not doc.is_new():
		return

	# Credit Note flow: must be created as a return against an existing invoice.
	if getattr(doc, "is_return", 0):
		if not getattr(doc, "return_against", None):
			frappe.throw(
				_("Credit Note must be created as a return against an existing Sales Invoice."),
				frappe.ValidationError,
			)
		return

	if not getattr(doc, "items", None):
		return

	derived_reference_fields = [
		"sales_order",
		"so_detail",
		"delivery_note",
		"dn_detail",
	]

	if _has_any_item_reference(doc, derived_reference_fields):
		return

	frappe.throw(
		_("Sales Invoice must be created from a Sales Order / Delivery Note. Direct creation is not allowed."),
		frappe.ValidationError,
	)
