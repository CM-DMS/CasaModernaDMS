"""
cfg_purchasing_api.py — CFG Order Tracker API.

Returns CM Custom Lines (CONFIGURED and FREETEXT) enriched with Sales Order
context, PO coverage, and decoded config/pricing snapshots so the purchasing
manager can:

  - See all custom-product orders across SOs (Tab 1 — All CFG Lines)
  - See full Night Collection component breakdowns for ordering (Tab 2)
  - Audit whether the price sold matches what was priced (Tab 3)
"""
from __future__ import annotations

import json as _json

import frappe


def reparent_cfg_lines_on_amendment(doc, method=None):
	"""
	Called on_submit of a Sales Order.

	If this SO is an amendment (amended_from is set):
	- CM Custom Lines from the predecessor still referenced by an item on
	  this new SO are reparented here (item was kept through the amendment).
	- CM Custom Lines from the predecessor that are NO LONGER referenced by
	  any item on this SO are deleted — the item was removed during the
	  amendment and the predecessor SO is now cancelled, leaving them orphaned.
	"""
	if not doc.amended_from:
		return

	# CFG refs that are genuinely live on the new SO.
	live_refs = {
		item.cm_custom_line_ref
		for item in (doc.items or [])
		if getattr(item, "cm_custom_line_ref", None)
	}

	old_line_names = frappe.db.get_all(
		"CM Custom Line",
		filters={"parent_name": doc.amended_from, "parent_doctype": "Sales Order"},
		pluck="name",
	)

	if not old_line_names:
		return

	reparented = 0
	deleted = 0
	for cl_name in old_line_names:
		if cl_name in live_refs:
			# Item carried over unchanged — move CFG record to the new SO.
			frappe.db.set_value("CM Custom Line", cl_name, "parent_name", doc.name)
			reparented += 1
		else:
			# Item was removed during the amendment — delete the orphaned record.
			frappe.db.delete("CM Custom Line", {"name": cl_name})
			deleted += 1

	if reparented or deleted:
		frappe.db.commit()


def _require_purchasing_or_admin():
	roles = frappe.get_roles()
	allowed = {
		"CasaModerna Purchasing",
		"Purchase User",
		"Purchase Manager",
		"CasaModerna Supplier Maintainer",
		"System Manager",
		"CasaModerna Super Admin",
	}
	if not (allowed & set(roles)):
		frappe.throw("Not permitted.", frappe.PermissionError)


# ---------------------------------------------------------------------------
# Main list endpoint
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_cfg_order_lines(
	q: str = "",
	line_type: str = "",
	so_status: str = "",
	from_date: str = "",
	to_date: str = "",
	configurator_type: str = "",
	include_quotations: bool = False,
	limit: int = 200,
) -> list[dict]:
	"""
	Return CM Custom Lines enriched with Sales Order context, PO coverage,
	and decoded config/pricing snapshots.

	Args:
		q:                 Free-text search on CFG ref, customer name, SO name, description.
		line_type:         'CONFIGURED' | 'FREETEXT' | '' (all)
		so_status:         Filter by Sales Order status string.
		from_date:         SO transaction_date >=
		to_date:           SO transaction_date <=
		configurator_type: 'Night Collection' | '' (all configured)
		limit:             Max rows (default 200).

	Returns a flat list of dicts, one per CM Custom Line. Each row includes:
		- All CM Custom Line fields (name, line_type, status, tier_name,
		  offer_incl_vat, rrp_incl_vat, config_json, pricing_json, price_list)
		- SO fields (so_name, customer, customer_name, transaction_date,
		  delivery_date, so_status, so_docstatus)
		- SO item fields (qty, uom, rate_on_so)
		- po_coverage: True if at least one submitted/to-receive PO item
		  references the same item_code for this Sales Order
		- configurator_type: from the Price List's cm_configurator_type field
		- config_summary: short human-readable label decoded from config_json
	"""
	_require_purchasing_or_admin()

	# ── Build per-arm WHERE clauses ────────────────────────────────────────
	# Split into clauses shared by both arms and SO-only clauses.
	common_filters: list[str] = []
	so_filters: list[str] = []
	qt_filters: list[str] = []
	values: dict = {}

	# Exclude cancelled documents
	so_filters.append("so.docstatus != 2")
	qt_filters.append("qt.docstatus != 2")

	if line_type:
		common_filters.append("cl.line_type = %(line_type)s")
		values["line_type"] = line_type

	if so_status:
		# SO-arm: filter by the actual SO status.
		# Quotation-arm: only include if so_status matches a quotation context.
		# For simplicity, exclude quotations when a specific SO status is selected.
		so_filters.append("so.status = %(so_status)s")
		values["so_status"] = so_status
		# signal to skip the quotation arm
		values["_skip_quotations"] = True

	if from_date:
		common_filters.append("MIN_PARENT.transaction_date >= %(from_date)s")
		values["from_date"] = from_date

	if to_date:
		common_filters.append("MIN_PARENT.transaction_date <= %(to_date)s")
		values["to_date"] = to_date

	if q:
		common_filters.append(
			"(cl.name LIKE %(q)s OR MIN_PARENT.customer_name LIKE %(q)s "
			"OR cl.parent_name LIKE %(q)s OR cl.description LIKE %(q)s)"
		)
		values["q"] = f"%{q}%"

	def _build_where(arm_filters: list[str], alias: str) -> str:
		all_f = [f.replace("MIN_PARENT.", f"{alias}.") for f in (arm_filters + common_filters)]
		return ("WHERE " + " AND ".join(all_f)) if all_f else ""

	so_where = _build_where(so_filters, "so")
	qt_where = _build_where(qt_filters, "qt")

	# ── Common SELECT columns list (same order in both UNION arms) ──────────
	_COLS = """
		cl.name              AS name,
		cl.line_type         AS line_type,
		cl.status            AS cfg_status,
		cl.price_list        AS price_list,
		cl.tier_name         AS tier_name,
		cl.offer_incl_vat    AS offer_incl_vat,
		cl.rrp_incl_vat      AS rrp_incl_vat,
		cl.vat_rate          AS vat_rate,
		cl.graduated_item    AS graduated_item,
		cl.config_json       AS config_json,
		cl.pricing_json      AS pricing_json,
		cl.description       AS description,
		cl.parent_name       AS so_name,
		cl.parent_doctype    AS parent_doctype"""

	# ── Sales Order arm ────────────────────────────────────────────────────
	so_arm = f"""
		SELECT
			{_COLS},
			so.customer          AS customer,
			so.customer_name     AS customer_name,
			so.transaction_date  AS transaction_date,
			so.delivery_date     AS delivery_date,
			so.status            AS so_status,
			so.docstatus         AS so_docstatus,
			soi.name             AS so_detail,
			soi.qty              AS qty,
			soi.uom              AS uom,
			soi.rate             AS rate_on_so,
			soi.item_code        AS item_code
		FROM `tabCM Custom Line` cl
		JOIN `tabSales Order` so
			ON so.name = cl.parent_name
			AND cl.parent_doctype = 'Sales Order'
		LEFT JOIN `tabSales Order Item` soi
			ON soi.parent = cl.parent_name
			AND soi.cm_custom_line_ref = cl.name
		{so_where}"""

	# ── Quotation arm (only when no so_status filter applied) ─────────────
	qt_arm = f"""
		SELECT
			{_COLS},
			qt.party_name        AS customer,
			qt.customer_name     AS customer_name,
			qt.transaction_date  AS transaction_date,
			qt.valid_till        AS delivery_date,
			qt.status            AS so_status,
			qt.docstatus         AS so_docstatus,
			qti.name             AS so_detail,
			qti.qty              AS qty,
			qti.uom              AS uom,
			qti.rate             AS rate_on_so,
			qti.item_code        AS item_code
		FROM `tabCM Custom Line` cl
		JOIN `tabQuotation` qt
			ON qt.name = cl.parent_name
			AND cl.parent_doctype = 'Quotation'
		LEFT JOIN `tabQuotation Item` qti
			ON qti.parent = cl.parent_name
			AND qti.cm_custom_line_ref = cl.name
		{qt_where}"""

	_force_skip_qt = values.pop("_skip_quotations", False)
	show_qt = include_quotations and not _force_skip_qt
	union_sql = so_arm if not show_qt else f"{so_arm}\n\t\tUNION ALL\n\t\t{qt_arm}"

	# ── Execute ─────────────────────────────────────────────────────────────
	rows = frappe.db.sql(
		f"""
		{union_sql}
		ORDER BY transaction_date DESC, name
		LIMIT %(limit)s
		""",
		{**values, "limit": int(limit)},
		as_dict=True,
	)

	if not rows:
		return []

	# ── Post-process each row ───────────────────────────────────────────────

	# Build a set of SO names to batch-check PO coverage
	so_names = list({r["so_name"] for r in rows if r["so_name"]})
	po_covered_keys = _get_po_covered_keys(so_names)

	# Resolve cm_configurator_type for each unique price_list
	price_list_types: dict[str, str] = {}

	result = []
	for row in rows:
		# Resolve configurator_type — first try price_list lookup,
		# then fall back to description prefix (price_list is often NULL
		# on existing records where it wasn't stored)
		pl = row.get("price_list") or ""
		if pl and pl not in price_list_types:
			ctype = frappe.db.get_value("Price List", pl, "cm_configurator_type") or ""
			price_list_types[pl] = ctype
		ctype = price_list_types.get(pl, "")
		if not ctype:
			# Description-based detection: "Night Collection …" prefix
			descr = (row.get("description") or "").strip()
			if descr.lower().startswith("night collection"):
				ctype = "Night Collection"
		if not ctype:
			# config_json-based detection: configurator_type stored in the snapshot
			# (used by Lorella Collection and any future collection types where
			# price_list is NULL and the description doesn't match a known prefix).
			cj_raw = row.get("config_json")
			if cj_raw:
				try:
					cfg_data = _json.loads(cj_raw) if isinstance(cj_raw, str) else cj_raw
					ctype = cfg_data.get("configurator_type") or ""
				except Exception:
					pass
		row["configurator_type"] = ctype

		# Filter by configurator_type if requested
		if configurator_type and row["configurator_type"] != configurator_type:
			continue

		# PO coverage: True if any PO already covers (item_code, so_name)
		key = (row.get("item_code") or "", row.get("so_name") or "")
		row["po_coverage"] = key in po_covered_keys

		# Decode config_json → short summary label
		row["config_summary"] = _decode_config_summary(row.get("config_json"), row.get("line_type"))

		# Defensive: skip CONFIGURED Sales Order lines where the LEFT JOIN
		# found no matching SO Item — these are orphaned records left over from
		# an amendment that removed the item.  (item_code comes from the joined
		# soi row; it will be None when the join matched nothing.)
		if (
			row.get("parent_doctype") == "Sales Order"
			and row.get("line_type") == "CONFIGURED"
			and row.get("item_code") is None
		):
			continue

		# Parse pricing_json from string to dict (keep it light — frontend renders it)
		pj = row.get("pricing_json")
		if pj and isinstance(pj, str):
			try:
				row["pricing_json"] = _json.loads(pj)
			except Exception:
				row["pricing_json"] = None
		# config_json: parse to dict too
		cj = row.get("config_json")
		if cj and isinstance(cj, str):
			try:
				row["config_json"] = _json.loads(cj)
			except Exception:
				row["config_json"] = None

		result.append(row)

	# Enrich Night Collection bom_lines with Ares supplier codes + Italian descriptions
	_enrich_night_bom_supplier_fields(result)
	# Enrich all other configurator types (e.g. Topline Bedrooms, Lorella) with supplier codes
	_enrich_generic_bom_supplier_fields(result)
	# Attach calculator steps so the tracker can render the full pricing trail
	_enrich_calculator_steps(result)

	return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_po_covered_keys(so_names: list[str]) -> set[tuple]:
	"""
	Return a set of (item_code, sales_order) tuples that already have a
	submitted (or to-receive) Purchase Order item.

	We check `tabPurchase Order Item` for lines where sales_order is set.
	Standard ERPNext stores the SO reference in the `sales_order` field of
	`Purchase Order Item` when a PO is raised from a Sales Order.
	"""
	if not so_names:
		return set()

	placeholders = ", ".join(["%s"] * len(so_names))
	rows = frappe.db.sql(
		f"""
		SELECT poi.item_code, poi.sales_order
		FROM `tabPurchase Order Item` poi
		JOIN `tabPurchase Order` po ON po.name = poi.parent
		WHERE po.docstatus != 2
		  AND poi.sales_order IN ({placeholders})
		""",
		tuple(so_names),
		as_dict=True,
	)
	return {(r["item_code"], r["sales_order"]) for r in rows if r.get("sales_order")}


def _enrich_night_bom_supplier_fields(rows: list[dict]) -> None:
	"""
	Inject ``supplier_item_code`` and ``supplier_item_name`` (Ares / Italian)
	into every bom_line belonging to a Night Collection pricing_json snapshot.

	Performs a single batch SQL query across all unique SKUs so there is no
	N+1 behaviour even when many Night Collection lines are returned.
	"""
	skus: set[str] = set()
	for row in rows:
		if row.get("configurator_type") != "Night Collection":
			continue
		pj = row.get("pricing_json")
		if not isinstance(pj, dict):
			continue
		for line in pj.get("bom_lines") or []:
			sku = line.get("sku")
			if sku:
				skus.add(sku)

	if not skus:
		return

	placeholders = ", ".join(["%s"] * len(skus))
	item_rows = frappe.db.sql(
		f"""
		SELECT name, cm_supplier_item_code, cm_supplier_item_name
		FROM `tabItem`
		WHERE name IN ({placeholders})
		""",
		tuple(skus),
		as_dict=True,
	)
	supplier_map: dict[str, dict] = {r["name"]: r for r in item_rows}

	for row in rows:
		if row.get("configurator_type") != "Night Collection":
			continue
		pj = row.get("pricing_json")
		if not isinstance(pj, dict):
			continue
		for line in pj.get("bom_lines") or []:
			sku = line.get("sku") or ""
			item_data = supplier_map.get(sku, {})
			line["supplier_item_code"] = item_data.get("cm_supplier_item_code") or ""
			line["supplier_item_name"] = item_data.get("cm_supplier_item_name") or ""


def _enrich_generic_bom_supplier_fields(rows: list[dict]) -> None:
	"""
	Inject ``supplier_item_code`` and ``supplier_item_name`` into bom_lines
	for all configurator types other than Night Collection (which has its own
	dedicated enrichment).  Covers Topline Bedrooms, Lorella Collection, Sofas,
	and any future configurator.

	Performs a single batch SQL query across all unique SKUs.
	"""
	skus: set[str] = set()
	for row in rows:
		if row.get("configurator_type") == "Night Collection":
			continue
		pj = row.get("pricing_json")
		if not isinstance(pj, dict):
			continue
		for line in pj.get("bom_lines") or []:
			sku = line.get("sku")
			if sku:
				skus.add(sku)

	if not skus:
		return

	placeholders = ", ".join(["%s"] * len(skus))
	item_rows = frappe.db.sql(
		f"""
		SELECT name, cm_supplier_item_code, cm_supplier_item_name
		FROM `tabItem`
		WHERE name IN ({placeholders})
		""",
		tuple(skus),
		as_dict=True,
	)
	supplier_map: dict[str, dict] = {r["name"]: r for r in item_rows}

	for row in rows:
		if row.get("configurator_type") == "Night Collection":
			continue
		pj = row.get("pricing_json")
		if not isinstance(pj, dict):
			continue
		for line in pj.get("bom_lines") or []:
			sku = line.get("sku") or ""
			item_data = supplier_map.get(sku, {})
			if item_data.get("cm_supplier_item_code"):
				line["supplier_item_code"] = item_data["cm_supplier_item_code"]
			if item_data.get("cm_supplier_item_name"):
				line["supplier_item_name"] = item_data["cm_supplier_item_name"]


def _enrich_calculator_steps(result: list[dict]) -> None:
	"""
	Attach ``markup_steps`` to each row's pricing_json so the CFG Order Tracker
	can render the full step-by-step pricing trail.

	Performs one SQL query per unique calculator name (batch, no N+1).
	"""
	calc_names: set[str] = set()
	for row in result:
		pj = row.get("pricing_json")
		if isinstance(pj, dict):
			calc = pj.get("calculator")
			if calc:
				calc_names.add(calc)

	if not calc_names:
		return

	calc_steps: dict[str, list] = {}
	for calc_name in calc_names:
		steps = frappe.db.sql(
			"""SELECT step_type, label, value, value2, idx
			   FROM `tabCM Price Calculator Step`
			   WHERE parent = %s
			   ORDER BY idx""",
			(calc_name,),
			as_dict=True,
		)
		calc_steps[calc_name] = [
			{
				"step_type": s["step_type"],
				"label":     s["label"],
				"value":     float(s["value"] or 0),
				"value2":    float(s["value2"] or 0),
			}
			for s in steps
		]

	for row in result:
		pj = row.get("pricing_json")
		if not isinstance(pj, dict):
			continue
		calc = pj.get("calculator")
		if calc and calc in calc_steps:
			pj["markup_steps"] = calc_steps[calc]


def _decode_config_summary(config_json, line_type: str | None) -> str:
	"""
	Produce a short human-readable label from a Night Collection config_json snapshot.

	For FREETEXT lines this returns an empty string (description is used instead).
	For CONFIGURED lines it decodes the wardrobe list into a compact label like:
	  "Hinged 3-Door + Sliding 2D (L172) · Bed 140"
	"""
	if line_type != "CONFIGURED" or not config_json:
		return ""

	try:
		cfg = config_json if isinstance(config_json, dict) else _json.loads(config_json)
	except Exception:
		return ""

	parts: list[str] = []

	# Wardrobes
	MODE_LABEL = {
		"HINGED":    "Hinged",
		"SLIDING":   "Sliding",
		"CABINA":    "Cabina",
		"PONTE":     "Ponte",
		"OPEN":      "Open Unit",
		"TERMINALE": "Terminal",
	}
	for w in cfg.get("wardrobes") or []:
		mode = w.get("mode", "")
		opt_label = w.get("optionLabel", "")
		# Night Collection: finish nested under structure.finish
		# Lorella Collection: finish is a direct field on the wardrobe object
		fin = w.get("structure", {}).get("finish", "") or w.get("finish", "")
		label = MODE_LABEL.get(mode, mode)
		if opt_label:
			label = f"{label} {opt_label}".strip()
		elif not label:
			# Lorella-style: full description is in the name field
			label = w.get("name", "")
		if fin and label:
			label = f"{label} ({fin})"
		if label:
			parts.append(label)

	# Bedroom furniture — summarise types
	FURN_LABEL = {
		"BED": "Bed", "BEDSIDE": "Bedside", "TALLBOY": "Tallboy",
		"CHEST": "Chest", "DRESSER": "Dresser",
	}
	furn_types: dict[str, int] = {}
	for f in cfg.get("furniture") or []:
		t = f.get("type") or f.get("role", "")
		base = FURN_LABEL.get(t, t)
		if base:
			furn_types[base] = furn_types.get(base, 0) + 1

	if furn_types:
		furn_parts = [
			f"{base}×{cnt}" if cnt > 1 else base
			for base, cnt in furn_types.items()
		]
		parts.append(" + ".join(furn_parts))

	return " · ".join(parts) if parts else ""
