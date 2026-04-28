from __future__ import annotations

import json
from typing import Any

import frappe
from frappe import _


def _first_linked_parent(
	child_doctype: str,
	parent_doctype: str,
	child_filters: dict[str, Any],
) -> str | None:
	"""Return a deterministic existing parent doc linked via a child table.

	- Excludes cancelled (docstatus=2)
	- Orders by parent.creation ASC then parent.name ASC
	"""
	where = []
	values: list[Any] = []
	for fieldname, value in (child_filters or {}).items():
		where.append(f"child.`{fieldname}` = %s")
		values.append(value)

	if not where:
		return None

	sql = f"""
		SELECT parent.name
		FROM `tab{child_doctype}` child
		JOIN `tab{parent_doctype}` parent ON parent.name = child.parent
		WHERE {' AND '.join(where)}
			AND parent.docstatus < 2
		ORDER BY parent.creation ASC, parent.name ASC
		LIMIT 1
	"""
	rows = frappe.db.sql(sql, values)
	return rows[0][0] if rows else None


def _first_existing(doctype: str, filters: dict[str, Any], order_by: str = "creation asc, name asc") -> str | None:
	rows = frappe.get_all(doctype, filters=filters, pluck="name", order_by=order_by, limit=1)
	return rows[0] if rows else None


def _require_source_exists(doctype: str, name: str) -> None:
	if not name or not frappe.db.exists(doctype, name):
		frappe.throw(_("{0} {1} not found").format(doctype, name), frappe.DoesNotExistError)

	docstatus = int(frappe.db.get_value(doctype, name, "docstatus") or 0)
	if docstatus == 2:
		frappe.throw(_("Cannot convert a cancelled document."), frappe.ValidationError)


def _require_submitted(doctype: str, name: str) -> None:
	docstatus = int(frappe.db.get_value(doctype, name, "docstatus") or 0)
	if docstatus != 1:
		frappe.throw(_("Document must be submitted before conversion."), frappe.ValidationError)


def _require_meta_field(doctype: str, fieldname: str) -> None:
	meta = frappe.get_meta(doctype)
	if not meta.get_field(fieldname):
		frappe.throw(
			_("Conversion misconfigured: {0}.{1} field is missing.").format(doctype, fieldname),
			frappe.ValidationError,
		)


def _require_sales_order_workflow_state(sales_order: str, required_state: str) -> None:
	"""Require Sales Order workflow_state to match required_state.

	This is the Slice 013 two-stage SO model enforcement.
	"""
	_require_meta_field("Sales Order", "workflow_state")
	state = frappe.db.get_value("Sales Order", sales_order, "workflow_state")
	if (state or "") != required_state:
		frappe.throw(
			_("Sales Order must be {0} to perform this conversion.").format(required_state),
			frappe.ValidationError,
		)


def _latest_linked_parent(
	child_doctype: str,
	parent_doctype: str,
	child_filters: dict[str, Any],
	parent_docstatus: int,
) -> str | None:
	"""Return a deterministic *latest* parent doc linked via a child table.

	- Only docstatus == parent_docstatus
	- Excludes cancelled
	- Orders by parent.modified DESC then parent.name DESC
	"""
	where = []
	values: list[Any] = []
	for fieldname, value in (child_filters or {}).items():
		where.append(f"child.`{fieldname}` = %s")
		values.append(value)

	if not where:
		return None

	sql = f"""
		SELECT DISTINCT parent.name
		FROM `tab{child_doctype}` child
		JOIN `tab{parent_doctype}` parent ON parent.name = child.parent
		WHERE {' AND '.join(where)}
			AND parent.docstatus = %s
		ORDER BY parent.modified DESC, parent.name DESC
		LIMIT 1
	"""
	rows = frappe.db.sql(sql, values + [int(parent_docstatus)])
	return rows[0][0] if rows else None


def _existing_delivery_note_for_sales_order(sales_order: str) -> str | None:
	"""Slice 013 idempotency strategy for SO→DN.

	- Prefer latest *draft* DN linked to SO
	- Else reuse most recent *submitted* DN linked to SO
	"""
	draft = _latest_linked_parent(
		"Delivery Note Item",
		"Delivery Note",
		{"against_sales_order": sales_order},
		0,
	)
	if draft:
		return draft
	return _latest_linked_parent(
		"Delivery Note Item",
		"Delivery Note",
		{"against_sales_order": sales_order},
		1,
	)


def _linked_delivery_notes_for_sales_order(sales_order: str) -> list[str]:
	rows = frappe.db.sql(
		"""
			SELECT DISTINCT parent.name
			FROM `tabDelivery Note Item` child
			JOIN `tabDelivery Note` parent ON parent.name = child.parent
			WHERE child.against_sales_order = %s
				AND parent.docstatus < 2
			ORDER BY parent.creation ASC, parent.name ASC
		""",
		[sales_order],
	)
	return [r[0] for r in (rows or []) if r and r[0]]


def _latest_sales_invoice_for_delivery_notes(delivery_notes: list[str]) -> str | None:
	"""Slice 013 idempotency strategy for DN→IN and SO→IN.

	- Prefer latest *draft* SI referencing any DN
	- Else reuse most recent *submitted* SI referencing any DN
	"""
	if not delivery_notes:
		return None

	placeholders = ", ".join(["%s"] * len(delivery_notes))

	def _pick(docstatus: int) -> str | None:
		sql = f"""
			SELECT DISTINCT parent.name
			FROM `tabSales Invoice Item` child
			JOIN `tabSales Invoice` parent ON parent.name = child.parent
			WHERE child.delivery_note IN ({placeholders})
				AND parent.docstatus = %s
			ORDER BY parent.modified DESC, parent.name DESC
			LIMIT 1
		"""
		rows = frappe.db.sql(sql, [*delivery_notes, int(docstatus)])
		return rows[0][0] if rows else None

	return _pick(0) or _pick(1)


def _latest_sales_invoice_for_sales_order(sales_order: str) -> str | None:
	# Fallback linkage for older invoices (not DN-derived)
	return _latest_linked_parent("Sales Invoice Item", "Sales Invoice", {"sales_order": sales_order}, 0) or _latest_linked_parent(
		"Sales Invoice Item",
		"Sales Invoice",
		{"sales_order": sales_order},
		1,
	)


_CM_FIELDS_DEFAULT = [
	"cm_sales_person",
	"cm_notes",
	"cm_customer_b",
	"cm_customer_b_name",
	"cm_customer_a_amount",
	"cm_customer_b_amount",
	"cm_route",
	"cm_delivery_instructions",
	"cm_lift_required",
	"cm_pickup_from_showroom",
	"cm_site_survey_required",
	"terms",
]


def _copy_cm_fields(source_doc, target_doc, fields=None):
	"""Copy CM custom fields from source_doc to target_doc, skipping blank/None values."""
	target_meta = frappe.get_meta(target_doc.doctype)
	for f in (fields or _CM_FIELDS_DEFAULT):
		if not target_meta.get_field(f):
			continue
		val = getattr(source_doc, f, None)
		if val is not None and val != "":
			setattr(target_doc, f, val)


@frappe.whitelist()
def audit_enabled_client_scripts() -> str:
	"""Slice 011 audit helper.

	Returns JSON for enabled Client Scripts on Quotation / Sales Order / Delivery Note.
	"""
	rows = frappe.get_all(
		"Client Script",
		filters={"enabled": 1, "dt": ["in", ["Quotation", "Sales Order", "Delivery Note"]]},
		fields=["name", "dt", "view", "enabled"],
		order_by="dt asc, name asc",
	)
	return json.dumps(rows, indent=2, sort_keys=True)


@frappe.whitelist()
def audit_slice013_linkage_and_scripts() -> str:
	"""Slice 013 audit helper (read-only).

	Returns JSON:
	- Existence of key linkage fields used for deterministic idempotency
	- Enabled Client Scripts on QT/SO/DN
	"""
	def _has_field(dt: str, fieldname: str) -> bool:
		try:
			return bool(frappe.get_meta(dt).get_field(fieldname))
		except Exception:  # noqa: BLE001
			return False

	payload = {
		"site": frappe.local.site,
		"linkage_fields": {
			"Sales Order Item.prevdoc_docname": _has_field("Sales Order Item", "prevdoc_docname"),
			"Delivery Note Item.against_sales_order": _has_field("Delivery Note Item", "against_sales_order"),
			"Sales Invoice Item.delivery_note": _has_field("Sales Invoice Item", "delivery_note"),
			"Sales Invoice Item.sales_order": _has_field("Sales Invoice Item", "sales_order"),
			"POS Invoice.cm_source_doctype": _has_field("POS Invoice", "cm_source_doctype"),
			"POS Invoice.cm_source_name": _has_field("POS Invoice", "cm_source_name"),
		},
		"enabled_client_scripts": frappe.get_all(
			"Client Script",
			filters={"enabled": 1, "dt": ["in", ["Quotation", "Sales Order", "Delivery Note"]]},
			fields=["name", "dt", "view", "enabled", "modified"],
			order_by="dt asc, name asc",
		),
	}
	return json.dumps(payload, indent=2, sort_keys=True, default=str)


@frappe.whitelist()
def make_sales_order_override_validity(source_name: str) -> dict[str, Any]:
	"""Convert a Quotation to a Sales Order, bypassing the validity-period check.

	Identical to ERPNext's make_sales_order but temporarily extends valid_till
	to today so expired quotations can still be converted.  Returns the same
	unsaved SO dict the standard function returns (frontend saves it via PUT/POST).
	"""
	from frappe.utils import today as _today
	from erpnext.selling.doctype.quotation.quotation import make_sales_order

	original_valid_till = frappe.db.get_value("Quotation", source_name, "valid_till")
	frappe.db.set_value("Quotation", source_name, "valid_till", _today(), update_modified=False)
	try:
		so = make_sales_order(source_name)
	finally:
		frappe.db.set_value("Quotation", source_name, "valid_till", original_valid_till, update_modified=False)
	return so.as_dict()


@frappe.whitelist()
def create_so_from_qt(quotation: str) -> dict[str, Any]:
	"""Quotation → Sales Order (idempotent)."""
	_require_source_exists("Quotation", quotation)
	_require_submitted("Quotation", quotation)
	_require_meta_field("Sales Order Item", "prevdoc_docname")

	existing = _first_linked_parent("Sales Order Item", "Sales Order", {"prevdoc_docname": quotation})
	if existing:
		return {"doctype": "Sales Order", "name": existing, "created": False, "source": quotation}

	from erpnext.selling.doctype.quotation.quotation import make_sales_order

	so = make_sales_order(quotation)
	# ERPNext's mapped-doc flow normally lets the user fill mandatory fields before saving.
	# Since Slice 011 requires deterministic creation + idempotency, set safe defaults.
	from frappe.utils import add_days, today

	# Clear stale payment_schedule rows copied from the Quotation.
	# make_sales_order copies due_dates equal to the Quotation's transaction_date
	# (which may be in the past). Clearing here lets ERPNext regenerate the
	# schedule from the SO's transaction_date during validate → set_payment_schedule().
	so.payment_schedule = []

	default_delivery_date = add_days(today(), 1)
	if not getattr(so, "delivery_date", None):
		setattr(so, "delivery_date", default_delivery_date)
	for row in getattr(so, "items", None) or []:
		if hasattr(row, "delivery_date") and not getattr(row, "delivery_date", None):
			setattr(row, "delivery_date", default_delivery_date)
	# Copy CM custom fields from source Quotation
	qt_doc = frappe.get_doc("Quotation", quotation)
	_copy_cm_fields(qt_doc, so)
	so.insert()  # respect DocPerm
	return {"doctype": "Sales Order", "name": so.name, "created": True, "source": quotation, "method": "erpnext.selling.doctype.quotation.quotation.make_sales_order"}


@frappe.whitelist()
def create_pf_from_qt(quotation: str) -> dict[str, Any]:
	"""Quotation → Proforma (PF) (wraps Slice 010, idempotent)."""
	_require_source_exists("Quotation", quotation)
	from casamoderna_dms.proforma_pf import create_proforma_from_quotation

	res = create_proforma_from_quotation(quotation)
	name = (res or {}).get("name")
	return {"doctype": "CM Proforma", "name": name, "created": True, "source": quotation, "method": "casamoderna_dms.proforma_pf.create_proforma_from_quotation"}


@frappe.whitelist()
def create_pf_from_so(sales_order: str) -> dict[str, Any]:
	"""Sales Order → Proforma (PF) (wraps Slice 010, idempotent)."""
	_require_source_exists("Sales Order", sales_order)
	from casamoderna_dms.proforma_pf import create_proforma_from_sales_order

	res = create_proforma_from_sales_order(sales_order)
	name = (res or {}).get("name")
	return {"doctype": "CM Proforma", "name": name, "created": True, "source": sales_order, "method": "casamoderna_dms.proforma_pf.create_proforma_from_sales_order"}


@frappe.whitelist()
def create_dn_from_so(sales_order: str) -> dict[str, Any]:
	"""Sales Order → Delivery Note (idempotent)."""
	_require_source_exists("Sales Order", sales_order)
	_require_submitted("Sales Order", sales_order)
	_require_sales_order_workflow_state(sales_order, "Confirmed")
	_require_meta_field("Delivery Note Item", "against_sales_order")

	existing = _existing_delivery_note_for_sales_order(sales_order)
	if existing:
		return {"doctype": "Delivery Note", "name": existing, "created": False, "source": sales_order}

	from erpnext.selling.doctype.sales_order.sales_order import make_delivery_note

	dn = make_delivery_note(sales_order)
	# Copy CM custom fields from source Sales Order
	so_doc = frappe.get_doc("Sales Order", sales_order)
	_copy_cm_fields(so_doc, dn, [
		"cm_route", "cm_delivery_instructions",
		"cm_lift_required", "cm_pickup_from_showroom", "cm_site_survey_required",
		"cm_notes",
	])
	dn.insert()  # respect DocPerm + existing guardrails on validate
	return {"doctype": "Delivery Note", "name": dn.name, "created": True, "source": sales_order, "method": "erpnext.selling.doctype.sales_order.sales_order.make_delivery_note"}


@frappe.whitelist()
def create_in_from_so(sales_order: str) -> dict[str, Any]:
	"""Sales Order → Sales Invoice (IN) (idempotent).

	Slice 013 rule: for stock items, invoices must follow Delivery Note. Therefore this method
	requires an existing (and submitted) DN linked to the SO and uses the ERPNext DN→SI mapping.
	"""
	_require_source_exists("Sales Order", sales_order)
	_require_submitted("Sales Order", sales_order)
	_require_sales_order_workflow_state(sales_order, "Confirmed")
	_require_meta_field("Sales Invoice Item", "delivery_note")

	delivery_notes = _linked_delivery_notes_for_sales_order(sales_order)
	existing = _latest_sales_invoice_for_delivery_notes(delivery_notes) or _latest_sales_invoice_for_sales_order(sales_order)
	if existing:
		return {"doctype": "Sales Invoice", "name": existing, "created": False, "source": sales_order}

	if not delivery_notes:
		frappe.throw(
			_("Create a Delivery Note first; invoices for stock items must follow delivery."),
			frappe.ValidationError,
		)

	# Require at least one Dispatched DN (submitted + cm_warehouse_status == "Dispatched").
	submitted_dn = None
	for dn in delivery_notes:
		docstatus = int(frappe.db.get_value("Delivery Note", dn, "docstatus") or 0)
		wh_status  = frappe.db.get_value("Delivery Note", dn, "cm_warehouse_status") or ""
		if docstatus == 1 and wh_status == "Dispatched":
			submitted_dn = dn
			break
	if not submitted_dn:
		frappe.throw(
			_("The Delivery Note must be submitted and marked as Dispatched before an invoice can be raised."),
			frappe.ValidationError,
		)

	from erpnext.stock.doctype.delivery_note.delivery_note import make_sales_invoice

	so_doc = frappe.get_doc("Sales Order", sales_order)
	si = make_sales_invoice(submitted_dn)
	setattr(si, "is_pos", 0)
	_copy_cm_fields(so_doc, si, ["cm_sales_person", "cm_notes", "cm_customer_b", "cm_customer_b_name",
		"cm_customer_a_amount", "cm_customer_b_amount", "cm_lift_required", "terms",
		"cm_payment_on_order", "cm_payment_on_delivery"])
	from casamoderna_dms.deposit_allocation_api import auto_allocate_advances
	auto_allocate_advances(si)
	si.insert()  # respect DocPerm + existing guardrails on validate
	return {
		"doctype": "Sales Invoice",
		"name": si.name,
		"created": True,
		"source": sales_order,
		"method": "erpnext.stock.doctype.delivery_note.delivery_note.make_sales_invoice",
		"delivery_note": submitted_dn,
	}


@frappe.whitelist()
def check_invoice_eligibility(doctype: str, name: str) -> None:
	"""Validate that a Sales Invoice can be raised from this document.

	Checks that a Delivery Note marked as Dispatched exists.
	Raises frappe.ValidationError with a user-friendly message if not eligible.
	Returns None on success (the frontend only cares about the exception path).
	"""
	if doctype == "Sales Order":
		delivery_notes = _linked_delivery_notes_for_sales_order(name)
		if not delivery_notes:
			frappe.throw(
				_("Create and dispatch a Delivery Note before raising an invoice."),
				frappe.ValidationError,
			)
		dispatched = any(
			(frappe.db.get_value("Delivery Note", dn, "cm_warehouse_status") or "") == "Dispatched"
			for dn in delivery_notes
		)
		if not dispatched:
			frappe.throw(
				_("The Delivery Note must be marked as Dispatched before an invoice can be raised."),
				frappe.ValidationError,
			)
	elif doctype == "Delivery Note":
		wh_status = frappe.db.get_value("Delivery Note", name, "cm_warehouse_status") or ""
		if wh_status != "Dispatched":
			frappe.throw(
				_("This Delivery Note must be marked as Dispatched before raising an invoice."),
				frappe.ValidationError,
			)


@frappe.whitelist()
def create_in_from_dn(delivery_note: str) -> dict[str, Any]:
	"""Delivery Note → Sales Invoice (IN) (idempotent)."""
	_require_source_exists("Delivery Note", delivery_note)
	_require_submitted("Delivery Note", delivery_note)
	_require_meta_field("Sales Invoice Item", "delivery_note")
	# Require the DN to be Dispatched before an invoice can be raised.
	wh_status = frappe.db.get_value("Delivery Note", delivery_note, "cm_warehouse_status") or ""
	if wh_status != "Dispatched":
		frappe.throw(
			_("This Delivery Note must be marked as Dispatched before raising an invoice."),
			frappe.ValidationError,
		)

	existing = _latest_sales_invoice_for_delivery_notes([delivery_note])
	if existing:
		return {"doctype": "Sales Invoice", "name": existing, "created": False, "source": delivery_note}

	from erpnext.stock.doctype.delivery_note.delivery_note import make_sales_invoice

	dn_doc = frappe.get_doc("Delivery Note", delivery_note)
	si = make_sales_invoice(delivery_note)
	setattr(si, "is_pos", 0)
	# Copy DN-level CM fields first (cm_notes, cm_lift_required, etc.)
	_copy_cm_fields(dn_doc, si)
	# Also pull SO-level fields not present on DN (cm_sales_person, cm_customer_b*, terms)
	so_name = frappe.db.get_value("Delivery Note Item", {"parent": delivery_note}, "against_sales_order")
	if so_name:
		so_doc = frappe.get_doc("Sales Order", so_name)
		_copy_cm_fields(so_doc, si, ["cm_sales_person", "cm_customer_b", "cm_customer_b_name",
			"cm_customer_a_amount", "cm_customer_b_amount", "terms",
			"cm_payment_on_order", "cm_payment_on_delivery"])
	from casamoderna_dms.deposit_allocation_api import auto_allocate_advances
	auto_allocate_advances(si)
	si.insert()  # respect DocPerm + existing guardrails on validate
	return {"doctype": "Sales Invoice", "name": si.name, "created": True, "source": delivery_note, "method": "erpnext.stock.doctype.delivery_note.delivery_note.make_sales_invoice"}


def _require_pos_linkage_fields() -> None:
	_require_meta_field("POS Invoice", "cm_source_doctype")
	_require_meta_field("POS Invoice", "cm_source_name")


def _existing_pos_invoice(source_doctype: str, source_name: str) -> str | None:
	return _first_existing(
		"POS Invoice",
		{"cm_source_doctype": source_doctype, "cm_source_name": source_name, "docstatus": ["<", 2]},
	)


def _append_pos_items(pos_invoice, source_items):
	set_warehouse = getattr(pos_invoice, "set_warehouse", None)
	for row in source_items or []:
		item_code = getattr(row, "item_code", None)
		if not item_code:
			continue
		warehouse = getattr(row, "warehouse", None) or set_warehouse
		pos_invoice.append(
			"items",
			{
				"item_code": item_code,
				"qty": getattr(row, "qty", 0) or 0,
				"rate": getattr(row, "rate", 0) or 0,
				"uom": getattr(row, "uom", None),
				"warehouse": warehouse,
			},
		)


def _create_pos_invoice_from_source(source_doctype: str, source_name: str) -> str:
	_require_pos_linkage_fields()

	if source_doctype == "Quotation":
		q = frappe.get_doc("Quotation", source_name)
		if getattr(q, "quotation_to", None) != "Customer":
			frappe.throw(_("Cash Sale (CS) can only be created from a Customer Quotation."), frappe.ValidationError)
		company = q.company
		customer = q.party_name
		source_items = q.items
	elif source_doctype == "Sales Order":
		so = frappe.get_doc("Sales Order", source_name)
		company = so.company
		customer = so.customer
		source_items = so.items
	else:
		frappe.throw(_("Unsupported source for Cash Sale."), frappe.ValidationError)

	pos = frappe.new_doc("POS Invoice")
	pos.company = company
	pos.posting_date = frappe.utils.nowdate()
	pos.customer = customer
	setattr(pos, "is_pos", 1)
	setattr(pos, "cm_source_doctype", source_doctype)
	setattr(pos, "cm_source_name", source_name)

	# Pull POS Profile and its payment modes (required even for draft save).
	pos.set_pos_fields(for_validate=False)

	_append_pos_items(pos, source_items)
	if not getattr(pos, "items", None):
		frappe.throw(_("Cash Sale (CS) has no items to invoice."), frappe.ValidationError)

	pos.insert()  # respect DocPerm
	return pos.name


@frappe.whitelist()
def create_cs_from_qt(quotation: str) -> dict[str, Any]:
	"""Quotation → Cash Sale (CS) as POS Invoice (idempotent)."""
	_require_source_exists("Quotation", quotation)
	_require_submitted("Quotation", quotation)

	existing = None
	try:
		existing = _existing_pos_invoice("Quotation", quotation)
	except Exception:
		# If linkage fields are missing, fail closed with a clear message.
		_require_pos_linkage_fields()

	if existing:
		return {"doctype": "POS Invoice", "name": existing, "created": False, "source": quotation}

	name = _create_pos_invoice_from_source("Quotation", quotation)
	return {"doctype": "POS Invoice", "name": name, "created": True, "source": quotation, "method": "casamoderna_dms.sales_doc_conversions.create_cs_from_qt"}


@frappe.whitelist()
def create_cs_from_so(sales_order: str) -> dict[str, Any]:
	"""Sales Order → Cash Sale (CS) as POS Invoice (idempotent)."""
	_require_source_exists("Sales Order", sales_order)
	_require_submitted("Sales Order", sales_order)

	existing = None
	try:
		existing = _existing_pos_invoice("Sales Order", sales_order)
	except Exception:
		_require_pos_linkage_fields()

	if existing:
		return {"doctype": "POS Invoice", "name": existing, "created": False, "source": sales_order}

	name = _create_pos_invoice_from_source("Sales Order", sales_order)
	return {"doctype": "POS Invoice", "name": name, "created": True, "source": sales_order, "method": "casamoderna_dms.sales_doc_conversions.create_cs_from_so"}


@frappe.whitelist()
def so_has_delivery_note(sales_order: str) -> dict[str, Any]:
	"""Lightweight helper for UI gating: does this SO have any DN (draft/submitted) linked?"""
	_require_source_exists("Sales Order", sales_order)
	_require_submitted("Sales Order", sales_order)
	_require_meta_field("Delivery Note Item", "against_sales_order")
	return {"sales_order": sales_order, "has_dn": bool(_linked_delivery_notes_for_sales_order(sales_order))}


# Slice 013: V1-like wrapper endpoints (names + args) used by the new UI scripts.


@frappe.whitelist()
def qt_create_so(qt_name: str) -> dict[str, Any]:
	return create_so_from_qt(qt_name)


@frappe.whitelist()
def qt_create_pf(qt_name: str) -> dict[str, Any]:
	return create_pf_from_qt(qt_name)


@frappe.whitelist()
def qt_create_cs(qt_name: str) -> dict[str, Any]:
	return create_cs_from_qt(qt_name)


@frappe.whitelist()
def so_create_confirmed(so_name: str) -> dict[str, Any]:
	from casamoderna_dms.sales_order_confirm import confirm_pending_so

	res = confirm_pending_so(so_name)
	name = (res or {}).get("sales_order") or so_name
	return {"doctype": "Sales Order", "name": name, "created": False, "source": so_name, "method": "casamoderna_dms.sales_order_confirm.confirm_pending_so"}


@frappe.whitelist()
def so_create_dn(so_name: str) -> dict[str, Any]:
	return create_dn_from_so(so_name)


@frappe.whitelist()
def so_create_in(so_name: str) -> dict[str, Any]:
	return create_in_from_so(so_name)


@frappe.whitelist()
def so_create_pf(so_name: str) -> dict[str, Any]:
	return create_pf_from_so(so_name)


@frappe.whitelist()
def so_create_cs(so_name: str) -> dict[str, Any]:
	return create_cs_from_so(so_name)


@frappe.whitelist()
def dn_create_in(dn_name: str) -> dict[str, Any]:
	return create_in_from_dn(dn_name)


@frappe.whitelist()
def cancel_document(doctype: str, name: str, cancel_reason: str = "") -> dict[str, Any]:
	"""Cancel a submitted document.

	Uses ignore_links so Frappe's back-link check does not block cancellation
	when related documents (e.g. Delivery Notes linked to a Sales Order) exist.
	The related documents are NOT cascade-cancelled.
	"""
	doc = frappe.get_doc(doctype, name)
	if doc.docstatus != 1:
		frappe.throw(_("Only submitted documents can be cancelled."), frappe.ValidationError)
	doc.flags.ignore_links = True
	doc.cancel()
	return doc.as_dict()


@frappe.whitelist()
def amend_document(doctype: str, name: str) -> dict[str, Any]:
	"""Create an amendment (draft copy) of a submitted or cancelled document.

	If submitted (docstatus=1) the document is automatically cancelled first,
	then the amendment draft is created in one step.  The cancelled original
	remains as an immutable audit record; the returned draft has amended_from
	pointing to it.
	"""
	if not frappe.db.exists(doctype, name):
		frappe.throw(_("{0} {1} not found").format(doctype, name), frappe.DoesNotExistError)

	docstatus = int(frappe.db.get_value(doctype, name, "docstatus") or 0)
	if docstatus == 0:
		frappe.throw(_("Cannot amend a draft document."), frappe.ValidationError)

	if docstatus == 1:
		# Cancel first so Frappe's validate_amended_from check passes on insert.
		# ignore_links suppresses the back-link check that would block cancellation
		# when linked child documents (e.g. Delivery Notes) already exist.
		# Cancelling the SO does NOT cascade-cancel those documents.
		source = frappe.get_doc(doctype, name)
		source.flags.ignore_links = True
		source.cancel()
	else:
		source = frappe.get_doc(doctype, name)

	amended = frappe.copy_doc(source)
	amended.amended_from = name
	amended.docstatus = 0
	# Reset workflow state to Draft so the workflow validator doesn't reject
	# the insert (the copied doc carries the cancelled doc's workflow state).
	wf = frappe.db.get_value("Workflow", {"document_type": amended.doctype, "is_active": 1}, "name")
	if wf:
		amended.workflow_state = "Draft"
	amended.insert()
	return amended.as_dict()


@frappe.whitelist()
def create_quotation_proforma(quotation: str) -> dict[str, Any]:
	"""Quotation → Proforma (new draft Quotation with cm_document_subtype='Proforma').

	A Proforma is used by customers to present to their bank for loan approval.
	It carries no stock reservation or fiscal weight — it is a Quotation with a
	different label. Multiple Proformas may be created from the same Quotation.
	The resulting document receives a PI-series number (e.g. PI 000001) to
	distinguish it visually from standard Quotations (QT-series).
	"""
	_require_source_exists("Quotation", quotation)
	_require_submitted("Quotation", quotation)

	source = frappe.get_doc("Quotation", quotation)
	pf = frappe.copy_doc(source)
	pf.cm_document_subtype = "Proforma"
	pf.naming_series = "PI .######"
	pf.docstatus = 0
	# copy_doc carries over amendment linkage — clear it for a fresh document.
	pf.amended_from = None
	pf.insert()
	return {"doctype": "Quotation", "name": pf.name, "created": True, "source": quotation}
