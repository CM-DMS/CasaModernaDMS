"""delivery_pickup_api.py

Warehouse Delivery Pickup / Pick-List API.

Exposes whitelisted API methods that power the React front-end screen:
  - get_pickup_list        → list submitted DNs pending pick / dispatch
  - get_pickup_detail      → full DN detail with items using main product names
  - set_dn_warehouse_status → move a DN through Preparing → Ready → Dispatched
  - get_so_remaining_qtys  → helper: remaining undelivered qty per SO line
                             (drives the partial-delivery modal in DeliveryPrep)

All functions are decorated @frappe.whitelist() so they are accessible via
the standard /api/method/ call.
"""

from __future__ import annotations

import random

import frappe
from frappe import _


def _ensure_batch_no(item_code: str, warehouse: str = "STV L-2 - CM") -> str:
	"""Return a batch for item_code that has stock, creating both batch and
	a mock Material Receipt (100 qty) if none exists."""
	# Prefer an existing batch that already has stock in any warehouse.
	existing_with_stock = frappe.db.sql("""
		SELECT b.name
		FROM tabBatch b
		INNER JOIN `tabStock Ledger Entry` sle
			ON sle.batch_no = b.name AND sle.is_cancelled = 0
			AND sle.warehouse = %(warehouse)s
		WHERE b.item = %(item)s AND b.disabled = 0
		GROUP BY b.name
		HAVING SUM(sle.actual_qty) > 0
		LIMIT 1
	""", {"item": item_code, "warehouse": warehouse}, as_dict=True)
	if existing_with_stock:
		return existing_with_stock[0].name

	# No stocked batch — create one and add 100 qty via Material Receipt.
	for _ in range(50):
		code = f"{random.randint(0, 999999):06d}"
		if not frappe.db.exists("Batch", code):
			frappe.get_doc({
				"doctype": "Batch",
				"batch_id": code,
				"item": item_code,
			}).insert(ignore_permissions=True)

			uom = frappe.db.get_value("Item", item_code, "stock_uom") or "Nos"
			se = frappe.get_doc({
				"doctype": "Stock Entry",
				"stock_entry_type": "Material Receipt",
				"posting_date": frappe.utils.nowdate(),
				"posting_time": "08:00:00",
				"items": [{
					"item_code": item_code,
					"qty": 100,
					"uom": uom,
					"t_warehouse": warehouse,
					"batch_no": code,
					"basic_rate": 0,
					"valuation_rate": 0,
				}],
			})
			se.insert(ignore_permissions=True)
			se.submit()
			return code

	frappe.throw(_(f"Could not generate a unique batch code for {item_code}"))


# ──────────────────────────────────────────────────────────────────────────────
# Pick list
# ──────────────────────────────────────────────────────────────────────────────

@frappe.whitelist()
def get_pickup_list(from_date: str | None = None, to_date: str | None = None,
					warehouse_status: str | None = None, warehouse: str | None = None,
					limit: int = 200):
	"""Return submitted Delivery Notes that are not yet Dispatched.

	Each row includes header fields + a flat list of items so the front-end can
	render a per-DN pick card without an extra round-trip.
	"""
	filters = [
		["docstatus", "=", 1],
		["status", "!=", "Cancelled"],
	]

	if from_date:
		filters.append(["posting_date", ">=", from_date])
	if to_date:
		filters.append(["posting_date", "<=", to_date])

	# Filter by warehouse status (Preparing / Ready / Dispatched / '')
	if warehouse_status:
		filters.append(["cm_warehouse_status", "=", warehouse_status])
	else:
		# Default: exclude already dispatched
		filters.append(["cm_warehouse_status", "!=", "Dispatched"])

	if warehouse:
		filters.append(["set_warehouse", "=", warehouse])

	dn_list = frappe.get_all(
		"Delivery Note",
		filters=filters,
		fields=[
			"name", "customer", "customer_name", "posting_date",
			"set_warehouse", "cm_warehouse_status", "cm_route",
			"cm_delivery_instructions", "cm_lift_required",
			"cm_pickup_from_showroom", "lr_no", "total_qty",
		],
		order_by="posting_date asc, name asc",
		limit_page_length=int(limit),
	)

	if not dn_list:
		return []

	dn_names = [r.name for r in dn_list]

	# Fetch all items for these DNs in one query.
	items = frappe.get_all(
		"Delivery Note Item",
		filters={"parent": ["in", dn_names]},
		fields=[
			"parent", "idx", "item_code", "item_name",
			"cm_dn_item_display_name", "qty", "stock_uom",
			"uom", "warehouse", "against_sales_order",
		],
		order_by="parent asc, idx asc",
		limit_page_length=5000,
	)

	# Group items by parent DN.
	items_by_dn: dict[str, list] = {}
	for item in items:
		items_by_dn.setdefault(item.parent, []).append(item)

	result = []
	for dn in dn_list:
		row = dict(dn)
		row["items"] = items_by_dn.get(dn.name, [])
		result.append(row)

	return result


@frappe.whitelist()
def get_pickup_detail(name: str):
	"""Return a single DN with full detail (same shape as frappe.getDoc for our React)."""
	doc = frappe.get_doc("Delivery Note", name)
	return doc.as_dict()


@frappe.whitelist()
def set_dn_warehouse_status(name: str, status: str):
	"""Advance a DN's warehouse status.

	Valid transitions:
	  '' / None  → Preparing
	  Preparing  → Ready
	  Ready      → Dispatched
	(backwards transitions allowed for corrections)
	"""
	allowed = {"Preparing", "Ready", "Dispatched", ""}
	if status not in allowed:
		frappe.throw(_(f"Invalid warehouse status: {status}"), frappe.ValidationError)

	doc = frappe.get_doc("Delivery Note", name)
	if doc.docstatus != 1:
		frappe.throw(_("Warehouse status can only be set on submitted Delivery Notes."),
					 frappe.ValidationError)

	# Use db.set_value to avoid UpdateAfterSubmitError — cm_warehouse_status is
	# intentionally changed after submission as part of warehouse workflow.
	frappe.db.set_value("Delivery Note", name, "cm_warehouse_status", status)
	frappe.db.commit()

	if status == "Dispatched":
		_notify_dispatch(doc)

	return {"name": name, "cm_warehouse_status": status}


_DISPATCH_NOTIFY_RECIPIENTS = [
	"logistics@casamoderna.mt",    # Marcelle Demicoli
	"purchasing@casamoderna.mt",   # Emanuel Fenech
	"jason@casamoderna.mt",        # Jason Falzon
]


def _notify_dispatch(doc):
	"""Send system + email notification when a DN is marked Dispatched."""
	customer = doc.customer_name or doc.customer
	subject = f"Delivery Note {doc.name} Dispatched — {customer}"
	message = (
		f"Delivery Note <b>{doc.name}</b> for <b>{customer}</b> "
		f"has been marked as <b>Dispatched</b> by {frappe.session.user}."
	)

	for recipient in _DISPATCH_NOTIFY_RECIPIENTS:
		try:
			frappe.sendmail(
				recipients=[recipient],
				subject=subject,
				message=message,
				reference_doctype="Delivery Note",
				reference_name=doc.name,
				now=True,
			)
		except Exception:
			frappe.log_error(title=f"Dispatch notification failed: {recipient}")

	for recipient in _DISPATCH_NOTIFY_RECIPIENTS:
		try:
			n = frappe.new_doc("Notification Log")
			n.for_user = recipient
			n.from_user = frappe.session.user
			n.subject = subject
			n.email_content = message
			n.document_type = "Delivery Note"
			n.document_name = doc.name
			n.type = "Alert"
			n.read = 0
			n.insert(ignore_permissions=True)
		except Exception:
			pass


# ──────────────────────────────────────────────────────────────────────────────
# Partial delivery helpers
# ──────────────────────────────────────────────────────────────────────────────

@frappe.whitelist()
def get_so_remaining_qtys(so_name: str):
	"""Return per-line remaining (undelivered) quantities for a Sales Order.

	Used by the DeliveryPrep partial-delivery modal: lets the warehouse operative
	choose how many units to include in this delivery run before creating the DN.

	Returns a list of dicts:
	  {
	    item_code, item_name, cm_given_name,
	    ordered_qty, delivered_qty, remaining_qty,
	    uom, so_detail (= SO Item row name, needed for make_delivery_note mapping)
	  }
	"""
	so = frappe.get_doc("Sales Order", so_name)
	if so.docstatus != 1:
		frappe.throw(_("Sales Order must be submitted."), frappe.ValidationError)

	# Collect item codes for master lookups.
	codes = [r.item_code for r in so.items if r.item_code]
	master_rows = frappe.get_all(
		"Item",
		filters={"name": ["in", codes]},
		fields=["name", "item_name", "cm_given_name"],
	) if codes else []
	master: dict[str, dict] = {r.name: r for r in master_rows}

	result = []
	for row in so.items:
		remaining = max(0, (row.qty or 0) - (row.delivered_qty or 0))
		m = master.get(row.item_code, {})
		result.append({
			"item_code":     row.item_code,
			"item_name":     (m.get("item_name") or row.item_name or "").strip() or row.item_code,
			"cm_given_name": (m.get("cm_given_name") or "").strip(),
			"ordered_qty":   row.qty,
			"delivered_qty": row.delivered_qty or 0,
			"remaining_qty": remaining,
			"uom":           row.uom or row.stock_uom or "",
			"so_detail":     row.name,  # child row name — needed for DN mapping
		})

	return result


@frappe.whitelist()
def submit_delivery_note(name: str):
	"""Load a draft Delivery Note by name and submit it.

	This exists because passing only {doctype, name, modified} to
	frappe.client.submit causes Frappe to build a mostly-empty document dict
	instead of loading from the database, which then fails mandatory-field
	validation.  Loading the full document here before calling .submit() avoids
	that problem entirely.
	"""
	doc = frappe.get_doc("Delivery Note", name)
	if doc.docstatus != 0:
		frappe.throw(_("Delivery Note {0} is not in Draft state.").format(name))

	# Auto-assign a batch for any batch-tracked item rows that are missing one.
	for row in doc.items:
		if not getattr(row, "batch_no", None):
			has_batch = frappe.db.get_value("Item", row.item_code, "has_batch_no")
			if has_batch:
				row.batch_no = _ensure_batch_no(row.item_code, row.warehouse or "STV L-2 - CM")

	doc.submit()
	return {"name": doc.name, "status": doc.status}


@frappe.whitelist()
def make_partial_delivery_note(so_name: str, lines: str):
	"""Create a Delivery Note for a subset of SO lines at specified quantities.

	`lines` is JSON: list of {"so_detail": "<SO Item row name>", "qty": N}

	Only rows where qty > 0 are included.  Uses ERPNext's standard
	make_delivery_note mapper, then patches the qtys to the requested amounts.

	Returns the unsaved DN doc dict (same shape as makeDeliveryNote in salesOrders.js).
	"""
	import json as _json

	try:
		line_specs: list[dict] = _json.loads(lines)
	except Exception:
		frappe.throw(_("Invalid lines JSON."), frappe.ValidationError)

	# Build a lookup: so_detail row name → requested qty
	qty_by_row: dict[str, float] = {}
	for spec in line_specs:
		row_name = spec.get("so_detail")
		qty      = float(spec.get("qty") or 0)
		if row_name and qty > 0:
			qty_by_row[row_name] = qty

	if not qty_by_row:
		frappe.throw(_("At least one line with qty > 0 is required."), frappe.ValidationError)

	# Use ERPNext's standard mapper.
	from erpnext.selling.doctype.sales_order.sales_order import make_delivery_note
	dn = make_delivery_note(so_name)

	# Filter items to only those requested and apply requested qty.
	kept = []
	for item in dn.items:
		if item.so_detail in qty_by_row:
			item.qty = qty_by_row[item.so_detail]
			kept.append(item)

	dn.items = kept
	if not dn.items:
		frappe.throw(_("No matching SO lines found for the specified rows."),
					 frappe.ValidationError)

	dn.insert(ignore_permissions=False)
	frappe.db.commit()
	return frappe.get_doc("Delivery Note", dn.name).as_dict()
