# Copyright (c) 2026, CasaModerna and contributors
# For license information, please see license.txt
#
# SO Fulfillment — auto-classification hook + save/complete API
#
# on_submit hook:  classify_so_lines_on_submit()
#   Runs on every Sales Order submit.  Inspects each line and writes
#   cm_fulfill_action so admins start with a pre-filled review screen.
#
# API methods:     save_fulfillment_review()   — save per-line decisions
#                  complete_fulfillment()       — mark order fulfilled
#                  get_fulfillment_data()       — load review screen data
#                  lock_fulfillment()           — called when SO → Ready to Deliver

import frappe
from frappe import _
from frappe.utils import now_datetime, flt, getdate

# ── Reviewer whitelist ───────────────────────────────────────────────────────

FULFILLMENT_REVIEWERS = {
	"jason@casamoderna.mt",
	"brian@casamoderna.mt",
	"purchasing@casamoderna.mt",   # Emanuel Fenech
}


def _assert_reviewer():
	if frappe.session.user not in FULFILLMENT_REVIEWERS:
		frappe.throw(
			_("Only designated fulfilment reviewers can update this."),
			frappe.PermissionError,
		)


# ── Line classification helpers ──────────────────────────────────────────────

def _get_available_qty(item_code, warehouse):
	"""Return actual_qty from Bin.  If no specific warehouse, sum all bins."""
	if not item_code:
		return 0
	if warehouse:
		return frappe.db.get_value(
			"Bin",
			{"item_code": item_code, "warehouse": warehouse},
			"actual_qty",
		) or 0.0
	# No warehouse set — sum across all bins
	result = frappe.db.sql(
		"SELECT SUM(actual_qty) FROM `tabBin` WHERE item_code = %s",
		item_code,
	)
	return float((result[0][0] if result else None) or 0)


def _classify_item(item):
	"""
	Return the initial cm_fulfill_action for one SO line.

	Precedence:
	  1. Line has a CM Custom Line ref
	     - FREETEXT  → pending  (reviewer must confirm description + supplier)
	     - CONFIGURED → to_order (always made-to-order; supplier from BOM)
	  2. No CM Custom Line ref
	     - non-stock item → service  (auto-confirmed, no physical fulfilment)
	     - stock item, bin_qty >= ordered → stock
	     - stock item, bin_qty < ordered  → to_order
	"""
	# ── Custom line (configured / free-text) ────────────────────────────────
	ref = item.get("cm_custom_line_ref")
	if ref:
		# Both FREETEXT and CONFIGURED custom lines need purchasing — always to_order.
		# The reviewer can reclassify if the item is actually in stock.
		return "to_order"

	# ── Regular item ────────────────────────────────────────────────────────
	item_code = item.get("item_code")
	if not item_code:
		return "service"

	is_stock = frappe.db.get_value("Item", item_code, "is_stock_item")
	if not is_stock:
		return "service"

	available = _get_available_qty(item_code, item.get("warehouse"))
	return "stock" if available >= (item.qty or 0) else "to_order"


# ── on_submit hook ───────────────────────────────────────────────────────────

def classify_so_lines_on_submit(doc, method=None):
	"""
	Sales Order on_submit — classify every line and mark SO as in_review.
	Runs after reparent_cfg_lines_on_amendment so CFG refs are finalised.
	"""
	for item in doc.items:
		action = _classify_item(item)
		frappe.db.set_value(
			"Sales Order Item",
			item.name,
			{
				"cm_fulfill_action": action,
				"cm_fulfill_notes":  "",
				"cm_fulfill_by":     None,
				"cm_fulfill_on":     None,
			},
			update_modified=False,
		)

	frappe.db.set_value(
		"Sales Order",
		doc.name,
		{"cm_fulfill_status": "in_review", "cm_fulfill_locked": 0},
		update_modified=False,
	)


# ── Review API ───────────────────────────────────────────────────────────────

@frappe.whitelist()
def get_fulfillment_data(so_name):
	"""
	Return everything the fulfillment review screen needs for one SO.

	Response:
	{
	  "so": { name, customer, customer_name, delivery_date, cm_fulfill_status,
	          cm_fulfill_locked, ... },
	  "lines": [
	    { so_detail, item_code, item_name, description, qty, uom,
	      warehouse, cm_custom_line_ref, line_type,
	      cm_fulfill_action, cm_fulfill_notes, cm_fulfill_by, cm_fulfill_on,
	      available_qty,       # current bin qty (for stock lines)
	      cfg_summary,         # short human-readable config summary (for CONFIGURED)
	      supplier,            # best-guess supplier name
	    }, ...
	  ]
	}
	"""
	so = frappe.get_doc("Sales Order", so_name)

	so_data = {
		"name":               so.name,
		"customer":           so.customer,
		"customer_name":      so.customer_name,
		"delivery_date":      str(so.delivery_date) if so.delivery_date else None,
		"cm_need_by_month":   so.get("cm_need_by_month"),
		"cm_fulfill_status":  so.get("cm_fulfill_status") or "pending",
		"cm_fulfill_locked":  bool(so.get("cm_fulfill_locked")),
		"grand_total":        so.grand_total,
	}

	lines = []
	for item in so.items:
		ref = item.get("cm_custom_line_ref")
		line_type = None
		cfg_summary = None
		supplier = None

		if ref:
			cl = frappe.db.get_value(
				"CM Custom Line",
				ref,
				["line_type", "description", "config_json", "pricing_json"],
				as_dict=True,
			) or {}
			line_type = cl.get("line_type")

			if line_type == "CONFIGURED":
				# Build a one-line config summary from config_json
				import json as _json
				try:
					cfg = _json.loads(cl.get("config_json") or "{}")
					cfg_type = cfg.get("configurator_type", "")
					cfg_summary = cfg_type or "Configured item"
				except Exception:
					cfg_summary = "Configured item"

				# Derive primary supplier from BOM
				try:
					pricing = _json.loads(cl.get("pricing_json") or "{}")
					bom_lines = pricing.get("bom_lines") or []
					if bom_lines:
						# Most BOM lines share the same supplier — take the first non-null one
						for bl in bom_lines:
							s = bl.get("supplier") or bl.get("cm_supplier_name")
							if s:
								supplier = s
								break
				except Exception:
					pass

		available_qty = None
		if not ref:
			item_code = item.item_code
			if item_code and frappe.db.get_value("Item", item_code, "is_stock_item"):
				available_qty = _get_available_qty(item_code, item.warehouse)

		lines.append({
			"so_detail":         item.name,
			"item_code":         item.item_code,
			"item_name":         item.item_name,
			"description":       item.description,
			"qty":               item.qty,
			"uom":               item.uom,
			"warehouse":         item.warehouse,
			"cm_custom_line_ref": ref,
			"line_type":         line_type,
			"cm_fulfill_action": item.get("cm_fulfill_action") or "to_order",
			"cm_fulfill_notes":  item.get("cm_fulfill_notes") or "",
			"cm_fulfill_by":     item.get("cm_fulfill_by"),
			"cm_fulfill_on":     str(item.get("cm_fulfill_on")) if item.get("cm_fulfill_on") else None,
			"available_qty":     available_qty,
			"cfg_summary":       cfg_summary,
			"supplier":          supplier,
		})

	return {"so": so_data, "lines": lines}


@frappe.whitelist()
def save_fulfillment_review(so_name, line_updates):
	"""
	Persist per-line fulfillment decisions from the review screen.

	line_updates: list of dicts — each must have:
	  { "so_detail": <Sales Order Item name>,
	    "cm_fulfill_action": <action>,
	    "cm_fulfill_notes":  <notes>  }

	Only reviewers may call this.  SO must not be locked.
	"""
	_assert_reviewer()

	if frappe.db.get_value("Sales Order", so_name, "cm_fulfill_locked"):
		frappe.throw(_("This order is locked and can no longer be reviewed."))

	if isinstance(line_updates, str):
		import json
		line_updates = json.loads(line_updates)

	reviewer = frappe.session.user
	reviewed_on = now_datetime()

	# Validate all so_detail rows belong to this SO before writing
	valid_names = set(frappe.db.sql(
		"SELECT name FROM `tabSales Order Item` WHERE parent = %s",
		so_name,
		pluck="name",
	))

	for upd in line_updates:
		detail = upd.get("so_detail")
		if detail not in valid_names:
			frappe.throw(_(f"Line {detail} does not belong to {so_name}."))

		action = upd.get("cm_fulfill_action")
		notes  = (upd.get("cm_fulfill_notes") or "").strip()

		frappe.db.set_value(
			"Sales Order Item",
			detail,
			{
				"cm_fulfill_action": action,
				"cm_fulfill_notes":  notes,
				"cm_fulfill_by":     reviewer,
				"cm_fulfill_on":     reviewed_on,
			},
			update_modified=False,
		)

	# Keep SO status as in_review while we save progress
	frappe.db.set_value(
		"Sales Order", so_name,
		"cm_fulfill_status", "in_review",
		update_modified=False,
	)

	frappe.db.commit()
	return {"ok": True}


@frappe.whitelist()
def complete_fulfillment(so_name):
	"""
	Mark a Sales Order as fulfilled — every non-service line must be resolved.
	A 'resolved' line is anything other than 'pending'.
	"""
	_assert_reviewer()

	if frappe.db.get_value("Sales Order", so_name, "cm_fulfill_locked"):
		frappe.throw(_("This order is locked and can no longer be reviewed."))

	# Mark the order as fulfilled — all lines have been classified by auto-classification
	# or overridden by the reviewer.  No blocking check needed since 'pending' no longer exists.
	frappe.db.set_value(
		"Sales Order", so_name,
		"cm_fulfill_status", "fulfilled",
		update_modified=False,
	)
	frappe.db.commit()
	return {"ok": True}


@frappe.whitelist()
def get_items_to_order():
	"""
	Return all Sales Order lines with cm_fulfill_action = 'to_order' from
	submitted, unlocked SOs — used by the cross-SO Items to Order screen.

	Each row is enriched with supplier and cfg_summary where available.
	Rows are sorted by delivery_date ASC so urgent items surface first.
	"""
	import json as _json

	rows = frappe.db.sql(
		"""
		SELECT
			soi.name            AS so_detail,
			soi.parent          AS so_name,
			so.customer_name,
			so.delivery_date,
			soi.item_code,
			soi.item_name,
			soi.description,
			soi.qty,
			soi.uom,
			soi.cm_custom_line_ref,
			soi.cm_fulfill_notes
		FROM `tabSales Order Item` soi
		JOIN `tabSales Order` so ON so.name = soi.parent
		WHERE soi.cm_fulfill_action = 'to_order'
		  AND so.docstatus = 1
		  AND (so.cm_fulfill_locked = 0 OR so.cm_fulfill_locked IS NULL)
		ORDER BY so.delivery_date ASC, so.creation ASC
		""",
		as_dict=True,
	)

	company = frappe.defaults.get_global_default("company") or ""

	for row in rows:
		row["supplier"]    = None
		row["line_type"]   = None
		row["cfg_summary"] = None

		ref = row.get("cm_custom_line_ref")
		if ref:
			cl = frappe.db.get_value(
				"CM Custom Line",
				ref,
				["line_type", "pricing_json", "config_json"],
				as_dict=True,
			) or {}
			row["line_type"] = cl.get("line_type")

			if cl.get("line_type") == "CONFIGURED":
				try:
					pricing = _json.loads(cl.get("pricing_json") or "{}")
					for bl in pricing.get("bom_lines") or []:
						s = bl.get("supplier") or bl.get("cm_supplier_name")
						if s:
							row["supplier"] = s
							break
				except Exception:
					pass
				try:
					cfg = _json.loads(cl.get("config_json") or "{}")
					row["cfg_summary"] = cfg.get("configurator_type") or "Configured item"
				except Exception:
					row["cfg_summary"] = "Configured item"
		else:
			# Regular stock item — look up default supplier.
			# Prefer Item Default (ERPNext standard), fall back to cm_supplier_name
			# which is the custom field used throughout this codebase.
			item_code = row.get("item_code")
			supplier = frappe.db.get_value(
				"Item Default",
				{"parent": item_code, "company": company},
				"default_supplier",
			) or None
			if not supplier:
				supplier = frappe.db.get_value("Item", item_code, "cm_supplier_name") or None
			row["supplier"] = supplier

	return rows


@frappe.whitelist()
def mark_to_order_placed(so_details):
	"""
	Mark a list of Sales Order Item names as to_order_placed.
	Only reviewers may call this.

	so_details: JSON-encoded list of Sales Order Item names
	"""
	_assert_reviewer()

	if isinstance(so_details, str):
		import json
		so_details = json.loads(so_details)

	if not so_details:
		return {"ok": True, "updated": 0}

	for detail in so_details:
		frappe.db.set_value(
			"Sales Order Item",
			detail,
			"cm_fulfill_action",
			"to_order_placed",
			update_modified=False,
		)

	frappe.db.commit()
	return {"ok": True, "updated": len(so_details)}


@frappe.whitelist()
def create_batch_po_from_so_items(so_details, supplier, descriptions=None, config_snapshots=None, leg_types=None):
	"""
	Create one Purchase Order containing all specified SO Item lines from the same
	supplier, then mark each line as to_order_placed.

	so_details:       JSON list of Sales Order Item names (so_detail values)
	supplier:         supplier document name
	descriptions:     Optional JSON dict {so_detail: "PRIMO 2PLSX+..."} — supplier
	                  description string per line.  Overrides item-master fallback.
	config_snapshots: Optional JSON dict {so_detail: "{...}"} — config_json snapshot
	                  to store on each PO Item for audit trail.
	leg_types:        Optional JSON dict {so_detail: "PIEDE LEGNO"} — leg type per line.

	Returns: {"po_name": "PO-XXXX", "po_url": "/app/purchase-order/PO-XXXX"}
	"""
	import json as _json
	from urllib.parse import quote as _quote

	_assert_reviewer()

	if isinstance(so_details, str):
		so_details = _json.loads(so_details)
	if isinstance(descriptions, str):
		descriptions = _json.loads(descriptions)
	if isinstance(config_snapshots, str):
		config_snapshots = _json.loads(config_snapshots)
	if isinstance(leg_types, str):
		leg_types = _json.loads(leg_types)

	descriptions = descriptions or {}
	config_snapshots = config_snapshots or {}
	leg_types = leg_types or {}

	if not so_details:
		frappe.throw(_("No lines selected."))

	supplier = (supplier or "").strip()
	if not supplier:
		frappe.throw(_("Supplier is required."))

	company = frappe.defaults.get_global_default("company") or ""

	items_data = []
	earliest_date = None

	for detail_name in so_details:
		so_item = frappe.get_doc("Sales Order Item", detail_name)
		so = frappe.get_doc("Sales Order", so_item.parent)

		if so.docstatus != 1:
			frappe.throw(_("Sales Order {0} is not submitted.").format(so.name))

		remaining_qty = flt(so_item.qty) - flt(so_item.delivered_qty or 0)
		if remaining_qty <= 0:
			continue

		schedule_date = so_item.delivery_date or frappe.utils.nowdate()
		if earliest_date is None or getdate(schedule_date) < getdate(earliest_date):
			earliest_date = schedule_date

		item_master = frappe.db.get_value(
			"Item",
			so_item.item_code,
			["stock_uom", "cm_supplier_item_name", "cm_supplier_item_code",
			 "cm_supplier_variant_description"],
			as_dict=True,
		) or {}

		supplier_item_name = (item_master.get("cm_supplier_item_name") or "").strip()
		display_name = supplier_item_name or so_item.item_name or so_item.item_code

		# Prefer caller-supplied description; fall back to item master
		line_description = descriptions.get(detail_name) or (
			(item_master.get("cm_supplier_variant_description") or "").strip() or None
		)

		row = {
			"item_code":             so_item.item_code,
			"item_name":             display_name,
			"qty":                   remaining_qty,
			"uom":                   so_item.uom or item_master.get("stock_uom") or "Nos",
			"schedule_date":         schedule_date,
			"sales_order":           so.name,
			"sales_order_item":      so_item.name,
			"cm_supplier_item_code": (item_master.get("cm_supplier_item_code") or "").strip() or None,
			"description":           line_description,
			"cm_so_reference":       so.name,
			"cm_so_line_idx":        so_item.idx,
			"_detail_name":          detail_name,
		}

		# Optional enrichment fields
		snapshot = config_snapshots.get(detail_name)
		if snapshot:
			row["cm_config_snapshot"] = snapshot if isinstance(snapshot, str) else _json.dumps(snapshot)
		leg = leg_types.get(detail_name)
		if leg:
			row["cm_leg_type"] = leg

		# Supplier cost from SO item (cm_supplier_price custom field on SO Item)
		sp = getattr(so_item, "cm_supplier_price", None)
		if sp:
			row["cm_supplier_price"] = flt(sp)

		items_data.append(row)

	if not items_data:
		frappe.throw(_("All selected lines are already fully delivered."))

	po = frappe.new_doc("Purchase Order")
	po.company = company
	po.supplier = supplier
	po.schedule_date = earliest_date or frappe.utils.nowdate()

	for item in items_data:
		po.append("items", {k: v for k, v in item.items() if not k.startswith("_")})

	po.insert(ignore_permissions=False)

	# Mark all lines as to_order_placed
	reviewer = frappe.session.user
	reviewed_on = now_datetime()
	for item in items_data:
		frappe.db.set_value(
			"Sales Order Item",
			item["_detail_name"],
			{
				"cm_fulfill_action": "to_order_placed",
				"cm_fulfill_by":     reviewer,
				"cm_fulfill_on":     reviewed_on,
			},
			update_modified=False,
		)

	frappe.db.commit()
	return {"po_name": po.name, "po_url": f"/app/purchase-order/{_quote(po.name)}"}


@frappe.whitelist()
def lock_fulfillment(so_name):
	"""
	Lock fulfilment review — called when SO is marked Ready to Deliver.
	After this, no further changes to cm_fulfill_* fields are allowed.
	"""
	frappe.db.set_value(
		"Sales Order", so_name,
		{"cm_fulfill_status": "fulfilled", "cm_fulfill_locked": 1},
		update_modified=False,
	)
	frappe.db.commit()


# ── Workflow lock hook ───────────────────────────────────────────────────────

def lock_on_so_confirm(doc, method=None):
	"""
	Sales Order on_update — lock fulfillment when workflow state reaches Confirmed.
	Idempotent: safe to call multiple times.
	"""
	if doc.get("workflow_state") == "Confirmed" and not doc.get("cm_fulfill_locked"):
		frappe.db.set_value(
			"Sales Order", doc.name,
			{"cm_fulfill_status": "fulfilled", "cm_fulfill_locked": 1},
			update_modified=False,
		)


def auto_fulfill_on_so_complete(doc, method=None):
	"""
	Sales Order on_update_after_submit — auto-mark fulfillment as fulfilled
	when ERPNext sets SO status to 'Completed' (fully delivered and billed).
	Idempotent: no-op if already fulfilled/locked.
	"""
	if doc.status == "Completed" and not doc.get("cm_fulfill_locked"):
		frappe.db.set_value(
			"Sales Order", doc.name,
			{"cm_fulfill_status": "fulfilled", "cm_fulfill_locked": 1},
			update_modified=False,
		)
