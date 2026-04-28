"""configurator_pricing_api.py — Whitelisted API endpoints for pricing administration
and configurator price resolution.

All methods are @frappe.whitelist(). The React frontend calls these via
frappe.call() / frappe.callGet().

Endpoints:
  get_price_lists              — list all configurator price lists
  get_configurator_pricing     — get full pricing doc (tiers + matrix)
  resolve_configured_price     — given config dimensions, return tier-resolved price
  create_custom_line           — create a CM Custom Line on first quotation save
  get_custom_lines_for_doc     — list all CM Custom Lines for a parent document
  graduate_custom_line         — link a graduated stock Item to a CM Custom Line
"""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any

import frappe

# Minimum effective BOM weight used for fixed-cost distribution.
# Prevents a single low-weight item from absorbing the entire fixed-cost pool
# when only part of a full bedroom set is ordered.
_MIN_WEIGHT_FLOOR = 3.0


# ---------------------------------------------------------------------------
# Permission helpers
# ---------------------------------------------------------------------------

def _require_product_maintainer():
	allowed_roles = {"CasaModerna Product Maintainer", "System Manager", "Owner / Director", "CM Super Admin"}
	user_roles = set(frappe.get_roles(frappe.session.user))
	if not (allowed_roles & user_roles):
		frappe.throw("Not permitted. Requires CasaModerna Product Maintainer role.", frappe.PermissionError)


def _require_sales_or_admin():
	allowed_roles = {
		"CasaModerna Sales Console", "CasaModerna Product Maintainer",
		"System Manager", "Owner / Director", "CM Super Admin",
		"Sales Manager", "Sales User",
	}
	user_roles = set(frappe.get_roles(frappe.session.user))
	if not (allowed_roles & user_roles):
		frappe.throw("Not permitted.", frappe.PermissionError)


# ---------------------------------------------------------------------------
# Price list administration
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_price_lists():
	"""Return all Price Lists that have a cm_configurator_type set, plus their
	associated CM Configurator Pricing documents.
	"""
	_require_product_maintainer()

	# Native ERPNext Price Lists that are marked as selling configurator lists
	price_lists = frappe.get_all(
		"Price List",
		filters={"selling": 1},
		fields=["name", "currency", "cm_configurator_type", "enabled"],
		order_by="name asc",
	)

	# Attach CM Configurator Pricing records for each
	for pl in price_lists:
		pl["pricing_docs"] = frappe.get_all(
			"CM Configurator Pricing",
			filters={"price_list": pl["name"]},
			fields=["name", "configurator_type", "valid_from", "valid_to"],
			order_by="configurator_type asc",
		)

	return price_lists


@frappe.whitelist()
def list_configurator_types_for_sales():
	"""Return distinct active configurator types available to salespeople.

	Used by the SupplierPriceModal to populate the Price Configurator picker.
	Returns one record per configurator_type (the most recently created active doc).
	"""
	_require_sales_or_admin()

	from datetime import date
	today = str(date.today())

	docs = frappe.get_all(
		"CM Configurator Pricing",
		fields=["name", "configurator_type", "price_list", "valid_from", "valid_to"],
		order_by="configurator_type asc, creation desc",
	)

	# Keep only active docs and deduplicate by configurator_type (first = most recent)
	seen: dict[str, dict] = {}
	for doc in docs:
		ct = doc["configurator_type"]
		if ct in seen:
			continue
		vf = str(doc.get("valid_from") or "")
		vt = str(doc.get("valid_to") or "")
		if vf and vf > today:
			continue
		if vt and vt < today:
			continue
		seen[ct] = {
			"name": doc["name"],
			"configurator_type": ct,
			"price_list": doc["price_list"],
		}

	return list(seen.values())


@frappe.whitelist()
def get_configurator_pricing(name: str):
	"""Return a full CM Configurator Pricing document including tiers and matrix."""
	_require_product_maintainer()
	doc = frappe.get_doc("CM Configurator Pricing", name)
	return doc.as_dict()


@frappe.whitelist()
def save_configurator_pricing(doc: dict | str):
	"""Create or update a CM Configurator Pricing document.
	Accepts the full document dict (including tiers and matrix_rows child tables).
	"""
	_require_product_maintainer()
	if isinstance(doc, str):
		import json
		doc = json.loads(doc)

	name = doc.get("name")
	if name and frappe.db.exists("CM Configurator Pricing", name):
		existing = frappe.get_doc("CM Configurator Pricing", name)
		existing.update(doc)
		existing.save()
		return existing.as_dict()
	else:
		new_doc = frappe.get_doc({"doctype": "CM Configurator Pricing", **doc})
		new_doc.insert()
		return new_doc.as_dict()


@frappe.whitelist()
def delete_configurator_pricing(name: str):
	"""Delete a CM Configurator Pricing document."""
	_require_product_maintainer()
	frappe.delete_doc("CM Configurator Pricing", name, force=True)
	return {"success": True}


# ---------------------------------------------------------------------------
# Price resolution (called by configurators at runtime)
# ---------------------------------------------------------------------------

@frappe.whitelist()
def resolve_configured_price(
	configurator_type: str,
	dimensions: dict | str,
	quotation: str | None = None,
	price_list: str | None = None,
):
	"""Resolve the tier-adjusted price for a configurator configuration.

	Args:
		configurator_type: e.g. 'Night Collection', 'Sofa'
		dimensions: dict of dimension key=value pairs used to look up the matrix row
		            (role_name='OUTPUT' is assumed unless overridden in dimensions)
		quotation: optional — if provided, the existing configured lines on this
		           quotation are summed to determine the correct tier
		price_list: optional — if provided, use this specific price list

	Returns:
		{
		  "offer_price_inc_vat": float,
		  "rrp_inc_vat": float,
		  "cost_price": float,
		  "tier_name": str,
		  "pricing_doc": str,   # name of the CM Configurator Pricing record used
		}
	"""
	_require_sales_or_admin()

	if isinstance(dimensions, str):
		import json
		dimensions = json.loads(dimensions)

	role_name = dimensions.pop("role_name", "OUTPUT")

	# Find the active CM Configurator Pricing doc for this type
	pricing_doc = _get_active_pricing_doc(configurator_type, price_list)
	if not pricing_doc:
		frappe.throw(
			f"No active configurator pricing found for '{configurator_type}'. "
			"Ask an admin to set up pricing in Admin → Price Lists."
		)

	# Determine the applicable tier
	tier_name = _resolve_tier(pricing_doc, configurator_type, quotation)

	# Look up the matrix row matching tier + dimensions
	row = _match_matrix_row(pricing_doc, tier_name, role_name, dimensions)
	if not row:
		frappe.throw(
			f"No pricing matrix row found for configurator_type='{configurator_type}', "
			f"tier='{tier_name}', role='{role_name}', dimensions={dimensions}. "
			"Check the pricing matrix in Admin → Price Lists."
		)

	return {
		"offer_price_inc_vat": float(row.offer_price_inc_vat or 0),
		"rrp_inc_vat": float(row.rrp_inc_vat or 0),
		"cost_price": float(row.cost_price or 0),
		"tier_name": tier_name,
		"pricing_doc": pricing_doc.name,
	}


def _get_active_pricing_doc(configurator_type: str, price_list: str | None):
	"""Find the most specific active CM Configurator Pricing record."""
	import datetime
	today = datetime.date.today().isoformat()

	filters = {"configurator_type": configurator_type}
	if price_list:
		filters["price_list"] = price_list

	candidates = frappe.get_all(
		"CM Configurator Pricing",
		filters=filters,
		fields=["name", "valid_from", "valid_to"],
		order_by="valid_from desc",
	)

	for c in candidates:
		valid_from = str(c.get("valid_from") or "")
		valid_to = str(c.get("valid_to") or "")
		# A record with no dates is always active
		if valid_from and valid_from > today:
			continue
		if valid_to and valid_to < today:
			continue
		return frappe.get_doc("CM Configurator Pricing", c["name"])

	return None


def _resolve_tier(pricing_doc, configurator_type: str, quotation: str | None) -> str:
	"""Determine the highest qualifying tier for the given quotation context.

	If no quotation is provided (e.g., during preview), returns the base tier.
	"""
	if not pricing_doc.tiers:
		return ""

	# Sort tiers ascending by threshold; base tier (0) comes first
	sorted_tiers = sorted(
		pricing_doc.tiers,
		key=lambda t: float(t.min_order_value_inc_vat or 0),
	)
	base_tier = sorted_tiers[0].tier_name

	if not quotation:
		return base_tier

	# Sum all CONFIGURED custom lines on this quotation for this configurator type
	existing_total = _sum_configured_lines(quotation, configurator_type)

	# Find highest qualifying tier
	selected = base_tier
	for tier in sorted_tiers:
		if float(tier.min_order_value_inc_vat or 0) <= existing_total:
			selected = tier.tier_name

	return selected


def _sum_configured_lines(quotation: str, configurator_type: str) -> float:
	"""Sum offer_incl_vat of all CONFIRMED CM Custom Lines on a quotation
	that belong to the given configurator_type (identified via price_list).
	"""
	rows = frappe.get_all(
		"CM Custom Line",
		filters={
			"parent_doctype": "Quotation",
			"parent_name": quotation,
			"line_type": "CONFIGURED",
			"status": ["in", ["Draft", "Confirmed"]],
		},
		fields=["name", "offer_incl_vat", "price_list"],
	)
	if not rows:
		return 0.0

	# Filter rows to this configurator_type via their price_list's cm_configurator_type
	total = 0.0
	for row in rows:
		if not row.get("price_list"):
			continue
		pl_type = frappe.db.get_value("Price List", row["price_list"], "cm_configurator_type")
		if pl_type == configurator_type:
			total += float(row.get("offer_incl_vat") or 0)

	return total


def _match_matrix_row(pricing_doc, tier_name: str, role_name: str, dimensions: dict):
	"""Find the best-matching matrix row for the given tier + role + dimensions.

	Matching logic: exact match on all provided non-null dimension keys.
	Null/empty dimension keys in the matrix row are treated as wildcards.
	Returns the first match; callers should populate matrix rows from most to
	least specific.
	"""
	DIMENSION_FIELDS = ("mode", "option_code", "handle_variant", "finish_code",
						"seat_count", "extra_key_1", "extra_key_2")

	for row in pricing_doc.matrix_rows:
		if row.tier_name != tier_name:
			continue
		if row.role_name and row.role_name != role_name:
			continue
		# Check each provided dimension
		match = True
		for field in DIMENSION_FIELDS:
			row_val = getattr(row, field, None)
			query_val = dimensions.get(field)
			# Matrix row value is a wildcard when empty/null
			if row_val in (None, "", 0):
				continue
			if query_val is None:
				continue
			if str(row_val) != str(query_val):
				match = False
				break
		if match:
			return row

	return None


# ---------------------------------------------------------------------------
# CM Custom Line lifecycle
# ---------------------------------------------------------------------------

@frappe.whitelist()
def update_custom_line_json(cl_name: str, config_json: str = "", pricing_json: str = ""):
	"""Store config_json and/or pricing_json on an existing CM Custom Line.

	Called post-save from the frontend once the cm_custom_line_ref is known
	(the backend hook creates the record; this call enriches it with BOM data).
	"""
	_require_sales_or_admin()
	if not frappe.db.exists("CM Custom Line", cl_name):
		frappe.throw(f"CM Custom Line {cl_name!r} not found.")
	updates = {}
	if config_json:
		updates["config_json"] = config_json
	if pricing_json:
		updates["pricing_json"] = pricing_json
	if updates:
		frappe.db.set_value("CM Custom Line", cl_name, updates)
		frappe.db.commit()
	return {"ok": True}


@frappe.whitelist()
def create_custom_line(
	parent_doctype: str,
	parent_name: str,
	line_type: str,
	description: str = "",
	price_list: str = "",
	offer_incl_vat: float = 0.0,
	rrp_incl_vat: float = 0.0,
	vat_rate: float = 0.0,
	config_json: str = "",
	pricing_json: str = "",
	tier_name: str = "",
):
	"""Create a CM Custom Line. Called on first Save of a quotation that
	contains CONFIGURED or FREETEXT lines.

	Returns the created document name (CFG-YYYY-#####).
	"""
	_require_sales_or_admin()

	if line_type not in ("CONFIGURED", "FREETEXT"):
		frappe.throw(f"Invalid line_type '{line_type}'. Must be CONFIGURED or FREETEXT.")
	if parent_doctype not in ("Quotation", "Sales Order"):
		frappe.throw(f"parent_doctype must be Quotation or Sales Order, got '{parent_doctype}'.")

	doc = frappe.get_doc({
		"doctype": "CM Custom Line",
		"line_type": line_type,
		"status": "Draft",
		"parent_doctype": parent_doctype,
		"parent_name": parent_name,
		"description": description,
		"price_list": price_list or None,
		"tier_name": tier_name or None,
		"offer_incl_vat": offer_incl_vat or None,
		"rrp_incl_vat": rrp_incl_vat or None,
		"vat_rate": vat_rate or None,
		"config_json": config_json or None,
		"pricing_json": pricing_json or None,
	})
	doc.insert(ignore_permissions=False)
	return {"name": doc.name}


@frappe.whitelist()
def get_custom_lines_for_doc(parent_doctype: str, parent_name: str):
	"""Return all CM Custom Lines for a given parent document."""
	_require_sales_or_admin()

	if parent_doctype not in ("Quotation", "Sales Order"):
		frappe.throw(f"parent_doctype must be Quotation or Sales Order.")

	rows = frappe.get_all(
		"CM Custom Line",
		filters={"parent_doctype": parent_doctype, "parent_name": parent_name},
		fields=[
			"name", "line_type", "status", "description",
			"price_list", "tier_name",
			"offer_incl_vat", "rrp_incl_vat", "vat_rate",
			"graduated_item", "config_json", "pricing_json",
		],
		order_by="creation asc",
	)
	return rows


@frappe.whitelist()
def confirm_custom_lines_for_doc(parent_doctype: str, parent_name: str):
	"""Mark all Draft CM Custom Lines for a document as Confirmed.
	Called when a Quotation is submitted / converted to Sales Order.
	"""
	_require_sales_or_admin()

	lines = frappe.get_all(
		"CM Custom Line",
		filters={
			"parent_doctype": parent_doctype,
			"parent_name": parent_name,
			"status": "Draft",
		},
		fields=["name"],
	)
	for line in lines:
		frappe.db.set_value("CM Custom Line", line["name"], "status", "Confirmed")

	return {"confirmed": len(lines)}


@frappe.whitelist()
def graduate_custom_line(name: str, item_code: str):
	"""Link a CM Custom Line to a permanent stock Item (graduation).
	The CFG- reference is permanently retained alongside the new item code.
	"""
	_require_product_maintainer()

	if not frappe.db.exists("Item", item_code):
		frappe.throw(f"Item '{item_code}' does not exist.")

	frappe.db.set_value("CM Custom Line", name, "graduated_item", item_code)
	return {"name": name, "graduated_item": item_code}


# ---------------------------------------------------------------------------
# Night Collection — item catalogue + BOM-based pricing
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_night_collection_items():
	"""Return all items under the Notte Collection item group tree, including
	their cm_* configurator fields.  Used by the frontend configurator to
	resolve finish + family code combinations to supplier SKU codes.

	Also includes ACCESSORY_STRUCTURE items (e.g. Under-Ponte Framing Shelf
	1CNACC*014, family ACC-GRILLE) which live outside the Notte Collection
	tree but are required accessories for Ponte wardrobes.
	"""
	_require_sales_or_admin()

	# Fetch all item groups in the Notte Collection tree
	notte_groups = frappe.get_all(
		"Item Group",
		filters={"lft": [">=", _get_item_group_lft("Notte Collection")],
				 "rgt": ["<=", _get_item_group_rgt("Notte Collection")]},
		pluck="name",
	)
	if not notte_groups:
		# Fall back to direct children if tree query fails
		notte_groups = frappe.get_all(
			"Item Group",
			filters={"parent_item_group": "Notte Collection"},
			pluck="name",
		)
		notte_groups.append("Notte Collection")

	# Always include ACCESSORY_STRUCTURE — holds finish-keyed accessories
	# (Under-Ponte Framing Shelf 1CNACC*014, LED per Ponte 1CNACCXX014)
	# that are not parented under the Notte Collection tree.
	if "ACCESSORY_STRUCTURE" not in notte_groups:
		notte_groups.append("ACCESSORY_STRUCTURE")

	items = frappe.get_all(
		"Item",
		filters={"item_group": ["in", notte_groups], "disabled": 0},
		fields=[
			"item_code", "item_name",
			"cm_product_code", "cm_family_code", "cm_finish_code",
			"cm_role_name", "cm_variant", "cm_dimensions", "cm_weight_factor",
		],
	)
	return items


def _get_item_group_lft(group_name: str) -> int:
	row = frappe.db.get_value("Item Group", group_name, ["lft", "rgt"], as_dict=True)
	return int(row.lft) if row else 0


def _get_item_group_rgt(group_name: str) -> int:
	row = frappe.db.get_value("Item Group", group_name, ["lft", "rgt"], as_dict=True)
	return int(row.rgt) if row else 999999


@frappe.whitelist()
def resolve_night_collection_bom_price(
	bom: dict | str,
	price_list: str | None = None,
	gozo_delivery: bool | int | str = False,
	quotation: str | None = None,
):
	"""Price a Night Collection BOM using the CM_BEDROOMS_MR calculator.

	Args:
		bom:          Full BOM dict as produced by NightCollectionConfigurator.
		price_list:   Optional specific price list (defaults to "Night Supplier Price List").
		gozo_delivery: If True, add the calculator's gozo_surcharge to the fixed pool.
		quotation:    Optional — used for tier resolution.

	Returns:
		{
		  "offer_price_inc_vat": float,
		  "rrp_inc_vat": float,
		  "cost_price": float,
		  "vat_rate": float,
		  "bom_lines": [
		    { "sku", "role", "finish", "qty", "weight",
		      "supplier_price", "allocated_fixed", "selling_price_ex_vat" }, …
		  ],
		  "calculator": str,
		}
	"""
	_require_sales_or_admin()

	import json as _json
	if isinstance(bom, str):
		bom = _json.loads(bom)
	gozo_delivery = str(gozo_delivery).lower() in ("1", "true", "yes")

	# Flatten the BOM into a list of lines with sku + weight
	lines = _flatten_bom(bom)
	if not lines:
		frappe.throw("BOM is empty — nothing to price.")

	# Supplier price list
	supplier_pl = price_list or "Night Supplier Price List"

	# Look up buying prices for each SKU
	for line in lines:
		line["supplier_price"] = _get_item_price(line["sku"], supplier_pl) if line.get("sku") else 0.0

	# Find the CM_BEDROOMS_MR calculator
	calc_doc = _get_calculator_by_code("CM_BEDROOMS_MR")
	if not calc_doc:
		frappe.throw(
			"Price calculator 'CM_BEDROOMS_MR' not found. "
			"Please create it in Admin → Pricing Calculators."
		)

	max_discount = float(calc_doc.max_discount_percent or 0)
	gozo_amount  = float(calc_doc.gozo_surcharge or 0) if gozo_delivery else 0.0
	vat_rate     = _get_vat_rate()

	# Separate formula steps into before/after the weighted fixed step
	pre_steps  = []
	post_steps = []
	weighted_found = False
	for step in (calc_doc.steps or []):
		if step.step_type == "ADD_FIXED_WEIGHTED":
			weighted_found = True
		elif not weighted_found:
			pre_steps.append(step)
		else:
			post_steps.append(step)

	# Total weight for distribution.
	# A min floor of 3.0 prevents a single small item from absorbing the entire
	# fixed-cost pool when the customer buys only part of a full bedroom set.
	total_weight = sum(float(l.get("weight") or 0) * int(l.get("qty") or 1) for l in lines)
	total_weight = max(total_weight, _MIN_WEIGHT_FLOOR)

	# Installation pool: €38 per weight unit (no fixed cap)
	fixed_pool = total_weight * 38.0 + gozo_amount

	# Apply formula to each line
	total_cost   = 0.0
	total_rrp_ex = 0.0
	for line in lines:
		qty = int(line.get("qty") or 1)
		sp  = float(line.get("supplier_price") or 0)
		w   = float(line.get("weight") or 0)

		# Pre-weighted steps (discounts, etc.)
		running = sp
		for step in pre_steps:
			running = _apply_step(running, step, lm=0)

		# Allocate weighted fixed cost
		if total_weight > 0:
			allocated = fixed_pool * (w / total_weight)
		else:
			allocated = fixed_pool / len(lines) if lines else 0
		line["allocated_fixed"] = round(allocated, 4)
		running += allocated

		# Post-weighted steps (profit markup)
		for step in post_steps:
			running = _apply_step(running, step, lm=0)

		line["selling_price_ex_vat"] = round(running, 4)
		total_cost   += sp * qty
		total_rrp_ex += running * qty

	# RRP inc-VAT (rounded to 2dp)
	rrp_inc_vat = round(total_rrp_ex * (1 + vat_rate / 100), 2)

	# Offer price = apply max discount, then ceil to whole euro
	import math
	offer_ex_vat   = total_rrp_ex * (1 - max_discount / 100)
	offer_inc_vat  = math.ceil(offer_ex_vat * (1 + vat_rate / 100))

	return {
		"offer_price_inc_vat": float(offer_inc_vat),
		"rrp_inc_vat":         float(rrp_inc_vat),
		"cost_price":          round(total_cost, 2),
		"vat_rate":            float(vat_rate),
		"max_discount_pct":    float(max_discount),
		"bom_lines":           lines,
		"calculator":          calc_doc.name,
	}


def _resolve_acc_placeholder(placeholder_sku: str, structure_finish: str) -> str:
	"""Re-resolve a placeholder SKU (e.g. 'ACC-UNDER_PONTE') to a real item code.

	Used when the BOM was saved before the catalog was fully populated, or when
	the structure finish has no exact-match accessory (e.g. NG/KZ for ACC-GRILLE).
	Falls back through finish priority order until an enabled item is found.
	"""
	_PLACEHOLDER_MAP = {
		# placeholder → (cm_family_code, fallback_finishes_in_priority_order)
		"ACC-UNDER_PONTE": ("ACC-GRILLE", ["NS", "LW", "CE", "AT", "PG"]),
	}
	entry = _PLACEHOLDER_MAP.get(placeholder_sku)
	if not entry:
		return placeholder_sku

	family, fallbacks = entry
	# Try the exact structure finish first, then the fallback chain
	for fin in ([structure_finish] if structure_finish else []) + fallbacks:
		row = frappe.db.get_value(
			"Item",
			{"cm_family_code": family, "cm_finish_code": fin, "disabled": 0},
			"item_code",
		)
		if row:
			return row
	return placeholder_sku


def _flatten_bom(bom: dict) -> list:
	"""Convert a Night Collection BOM dict into a flat list of priced lines.

	Supports both:
	  - new format: bom["wardrobes"] = [...] (array of wardrobe objects)
	  - legacy format: bom["wardrobe"] = {...} (single wardrobe object)
	"""
	lines = []

	def _add(component: dict, role: str):
		if not component:
			return
		sku = component.get("sku") or ""
		if not sku:
			return
		lines.append({
			"sku":    sku,
			"role":   role,
			"finish": component.get("finish", ""),
			"qty":    int(component.get("qty") or 1),
			"weight": float(component.get("weight") or 0),
			"name":   component.get("name", ""),
		})

	def _add_wardrobe(wardrobe: dict):
		if not wardrobe:
			return
		structure_finish = (wardrobe.get("structure") or {}).get("finish", "")
		if wardrobe.get("structure"):
			_add(wardrobe["structure"], "STRUCTURE")
		for door in wardrobe.get("doors") or []:
			_add(door, "DOOR")
		for handle in wardrobe.get("handles") or []:
			_add(handle, "HANDLE")
		for acc in wardrobe.get("accessories") or []:
			# Re-resolve placeholder SKUs (e.g. ACC-UNDER_PONTE) saved in older BOMs
			# where the catalog item was missing or the finish had no exact match.
			sku = acc.get("sku") or ""
			if sku.startswith("ACC-") and not frappe.db.exists("Item", sku):
				resolved = _resolve_acc_placeholder(sku, structure_finish)
				if resolved != sku:
					acc = {**acc, "sku": resolved}
			_add(acc, "ACCESSORY")

	# New multi-wardrobe format — falls back to legacy single wardrobe
	wardrobe_list = bom.get("wardrobes") or []
	if not wardrobe_list:
		single = bom.get("wardrobe")
		if single:
			wardrobe_list = [single]

	for wardrobe in wardrobe_list:
		_add_wardrobe(wardrobe)

	# Bedroom furniture
	for item in bom.get("furniture") or []:
		_add(item, item.get("role", "FURNITURE"))

	return lines


def _flatten_lorella_bom(bom: dict) -> list:
	"""Convert a Lorella Collection BOM dict into a flat list of priced lines.

	Lorella uses combined item codes (structure + front in one SKU), so each
	wardrobe piece is a single line rather than separate structure/door/handle.

	BOM format:
	  bom["wardrobes"] = [
	    { "sku": "1LEODA001CM", "role": "STRUCTURE", "qty": 1, "weight": 1.8,
	      "name": "...", "finish": "..." },
	    ...
	  ]
	  bom["furniture"] = [
	    { "sku": "1LEODR011", "role": "FURNITURE_BED", "qty": 1, "weight": 1.2, ... },
	    ...
	  ]
	"""
	lines = []
	for piece in (bom.get("wardrobes") or []):
		sku = piece.get("sku") or ""
		if not sku:
			continue
		lines.append({
			"sku":    sku,
			"role":   piece.get("role", "STRUCTURE"),
			"finish": piece.get("finish", ""),
			"qty":    int(piece.get("qty") or 1),
			"weight": float(piece.get("weight") or 0),
			"name":   piece.get("name", ""),
		})
	for item in (bom.get("furniture") or []):
		sku = item.get("sku") or ""
		if not sku:
			continue
		lines.append({
			"sku":    sku,
			"role":   item.get("role", "FURNITURE"),
			"finish": item.get("finish", ""),
			"qty":    int(item.get("qty") or 1),
			"weight": float(item.get("weight") or 0),
			"name":   item.get("name", ""),
		})
	return lines


@frappe.whitelist()
def get_lorella_collection_items():
	"""Return all Lorella Collection items from the Lorella Supplier Price List.

	Returns item_code + cm_supplier_item_name so the frontend can verify
	items exist and display Italian descriptions.
	"""
	_require_sales_or_admin()
	rows = frappe.db.sql(
		"""
		SELECT i.name AS item_code,
		       i.item_name,
		       i.cm_supplier_item_code,
		       i.cm_supplier_item_name
		FROM `tabItem` i
		JOIN `tabItem Price` ip ON ip.item_code = i.name
		WHERE ip.price_list = 'Lorella Supplier Price List'
		  AND i.disabled = 0
		ORDER BY i.name
		""",
		as_dict=True,
	)
	return rows


@frappe.whitelist()
def resolve_lorella_bom_price(
	bom: dict | str,
	gozo_delivery: bool | int | str = False,
	quotation: str | None = None,
):
	"""Price a Lorella Collection BOM using the CM_BEDROOMS_MR calculator.

	Identical to resolve_night_collection_bom_price but:
	  - Uses "Lorella Supplier Price List" for buying prices
	  - Calls _flatten_lorella_bom() which handles the combined-SKU format

	Returns the same structure as resolve_night_collection_bom_price:
	  { offer_price_inc_vat, rrp_inc_vat, cost_price, vat_rate,
	    max_discount_pct, bom_lines, calculator }
	"""
	_require_sales_or_admin()

	import json as _json
	if isinstance(bom, str):
		bom = _json.loads(bom)
	gozo_delivery = str(gozo_delivery).lower() in ("1", "true", "yes")

	lines = _flatten_lorella_bom(bom)
	if not lines:
		frappe.throw("BOM is empty — nothing to price.")

	supplier_pl = "Lorella Supplier Price List"
	for line in lines:
		line["supplier_price"] = _get_item_price(line["sku"], supplier_pl) if line.get("sku") else 0.0

	calc_doc = _get_calculator_by_code("CM_BEDROOMS_MR")
	if not calc_doc:
		frappe.throw(
			"Price calculator 'CM_BEDROOMS_MR' not found. "
			"Please create it in Admin → Pricing Calculators."
		)

	max_discount = float(calc_doc.max_discount_percent or 0)
	gozo_amount  = float(calc_doc.gozo_surcharge or 0) if gozo_delivery else 0.0
	vat_rate     = _get_vat_rate()

	pre_steps  = []
	post_steps = []
	weighted_found = False
	for step in (calc_doc.steps or []):
		if step.step_type == "ADD_FIXED_WEIGHTED":
			weighted_found = True
		elif not weighted_found:
			pre_steps.append(step)
		else:
			post_steps.append(step)

	total_weight = sum(float(l.get("weight") or 0) * int(l.get("qty") or 1) for l in lines)
	total_weight = max(total_weight, _MIN_WEIGHT_FLOOR)

	# Installation pool: €38 per weight unit (no fixed cap)
	fixed_pool = total_weight * 38.0 + gozo_amount

	total_cost   = 0.0
	total_rrp_ex = 0.0
	for line in lines:
		qty = int(line.get("qty") or 1)
		sp  = float(line.get("supplier_price") or 0)
		w   = float(line.get("weight") or 0)

		running = sp
		for step in pre_steps:
			running = _apply_step(running, step, lm=0)

		if total_weight > 0:
			allocated = fixed_pool * (w / total_weight)
		else:
			allocated = fixed_pool / len(lines) if lines else 0
		line["allocated_fixed"] = round(allocated, 4)
		running += allocated

		for step in post_steps:
			running = _apply_step(running, step, lm=0)

		line["selling_price_ex_vat"] = round(running, 4)
		total_cost   += sp * qty
		total_rrp_ex += running * qty

	rrp_inc_vat = round(total_rrp_ex * (1 + vat_rate / 100), 2)

	import math
	offer_ex_vat  = total_rrp_ex * (1 - max_discount / 100)
	offer_inc_vat = math.ceil(offer_ex_vat * (1 + vat_rate / 100))

	return {
		"offer_price_inc_vat": float(offer_inc_vat),
		"rrp_inc_vat":         float(rrp_inc_vat),
		"cost_price":          round(total_cost, 2),
		"vat_rate":            float(vat_rate),
		"max_discount_pct":    float(max_discount),
		"bom_lines":           lines,
		"calculator":          calc_doc.name,
	}


def _apply_step(total: float, step, lm: float = 0) -> float:
	"""Apply a single CM Price Calculator Step to a running total."""
	st = step.step_type
	v  = float(step.value or 0)
	v2 = float(step.value2 or 0)
	if st == "DISCOUNT_PCT":
		return total * (1 - v / 100)
	if st == "INCREASE_PCT":
		return total * (1 + v / 100)
	if st == "ADD_FIXED":
		return total + v
	if st == "ADD_INSTALL_FROM_LM":
		return total + (v * lm) + v2
	if st == "MULTIPLY":
		return total * v
	return total


def _get_calculator_by_code(code: str):
	"""Return the first CM Price Calculator doc with the given calculator_code."""
	name = frappe.db.get_value("CM Price Calculator", {"calculator_code": code}, "name")
	if not name:
		return None
	return frappe.get_doc("CM Price Calculator", name)


def _get_item_price(item_code: str, price_list: str) -> float:
	"""Return the buying rate for item_code from the given price list."""
	rate = frappe.db.get_value(
		"Item Price",
		{"item_code": item_code, "price_list": price_list},
		"price_list_rate",
	)
	return float(rate or 0)


def _get_vat_rate() -> float:
	"""Return the default VAT rate (18% unless overridden)."""
	try:
		from casamoderna_dms.cm_sales_pricing import _get_company_vat_rate_percent
		rate = _get_company_vat_rate_percent(None)
		return float(rate) if rate is not None else 18.0
	except Exception:
		return 18.0


# ---------------------------------------------------------------------------
# Topline Bedrooms — item catalogue + BOM-based pricing
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_topline_items():
	"""Return all items in the Topline Bedrooms item group with their prices
	from the Topline Supplier Price List.

	Used by the frontend configurator to build range/finish pickers and show
	supplier SKU codes + prices.
	"""
	_require_sales_or_admin()
	rows = frappe.db.sql(
		"""
		SELECT i.name AS item_code,
		       i.item_name,
		       i.cm_supplier_item_code,
		       i.cm_supplier_item_name,
		       i.cm_weight_factor,
		       ip.price_list_rate AS supplier_price
		FROM `tabItem` i
		JOIN `tabItem Price` ip ON ip.item_code = i.name
		WHERE ip.price_list = 'Topline Supplier Price List'
		  AND i.item_group = 'Topline Bedrooms'
		  AND i.disabled = 0
		ORDER BY i.name
		""",
		as_dict=True,
	)
	return rows


def _flatten_topline_bom(bom: dict) -> list:
	"""Convert a Topline BOM dict into a flat list of priced lines.

	BOM format (same structure as Lorella):
	  bom["wardrobes"] = [
	    { "sku": "TLNCAR6B_BL", "role": "WARDROBE", "qty": 1, "weight": 2.6, "name": "..." },
	    ...
	  ]
	  bom["furniture"] = [
	    { "sku": "TLNCCM_RN_BL", "role": "FURNITURE_BED", "qty": 1, "weight": 0.3, ... },
	    ...
	  ]
	"""
	lines = []
	for piece in (bom.get("wardrobes") or []):
		sku = piece.get("sku") or ""
		if not sku:
			continue
		lines.append({
			"sku":    sku,
			"role":   piece.get("role", "WARDROBE"),
			"finish": piece.get("finish", ""),
			"qty":    int(piece.get("qty") or 1),
			"weight": float(piece.get("weight") or 0),
			"name":   piece.get("name", ""),
		})
	for item in (bom.get("furniture") or []):
		sku = item.get("sku") or ""
		if not sku:
			continue
		lines.append({
			"sku":    sku,
			"role":   item.get("role", "FURNITURE"),
			"finish": item.get("finish", ""),
			"qty":    int(item.get("qty") or 1),
			"weight": float(item.get("weight") or 0),
			"name":   item.get("name", ""),
		})
	return lines


@frappe.whitelist()
def resolve_topline_bom_price(
	bom: dict | str,
	gozo_delivery: bool | int | str = False,
	quotation: str | None = None,
):
	"""Price a Topline Bedrooms BOM using the CM_BEDROOMS_TL calculator
	(falls back to CM_BEDROOMS_MR if TL-specific calculator does not exist).

	Steps:
	  1. List price = cm_supplier_list_price_ex_vat (from Topline Supplier Price List)
	  2. Apply discount chain from calculator steps (DISCOUNT_PCT steps)
	  3. ADD_FIXED_WEIGHTED: installation pool = total_weight × €38 per unit (no cap)
	     — individual pieces carry their full per-item weight cost
	  4. Post-weighted steps (profit margin, INCREASE_PCT)
	  5. Gozo surcharge added to fixed pool if applicable
	  6. Round UP to nearest whole euro (offer price)

	Returns the same structure as resolve_lorella_bom_price:
	  { offer_price_inc_vat, rrp_inc_vat, cost_price, vat_rate,
	    max_discount_pct, bom_lines, calculator }

	Note on individual piece orders: installation is applied per-item at the
	full weight rate — there is no minimum floor for Topline (unlike Night
	Collection) so that individual pieces accurately reflect their installation
	cost. The frontend must display this cost prominently.
	"""
	_require_sales_or_admin()

	import json as _json
	if isinstance(bom, str):
		bom = _json.loads(bom)
	gozo_delivery = str(gozo_delivery).lower() in ("1", "true", "yes")

	lines = _flatten_topline_bom(bom)
	if not lines:
		frappe.throw("BOM is empty — nothing to price.")

	supplier_pl = "Topline Supplier Price List"
	for line in lines:
		line["supplier_price"] = _get_item_price(line["sku"], supplier_pl) if line.get("sku") else 0.0

	# Try Topline-specific calculator first, fall back to shared bedrooms calculator
	calc_doc = _get_calculator_by_code("CM_BEDROOMS_TL") or _get_calculator_by_code("CM_BEDROOMS_MR")
	if not calc_doc:
		frappe.throw(
			"Price calculator 'CM_BEDROOMS_TL' (or fallback 'CM_BEDROOMS_MR') not found. "
			"Please create it in Admin → Pricing Calculators."
		)

	max_discount = float(calc_doc.max_discount_percent or 0)
	gozo_amount  = float(calc_doc.gozo_surcharge or 0) if gozo_delivery else 0.0
	vat_rate     = _get_vat_rate()

	pre_steps  = []
	post_steps = []
	weighted_found = False
	for step in (calc_doc.steps or []):
		if step.step_type == "ADD_FIXED_WEIGHTED":
			weighted_found = True
		elif not weighted_found:
			pre_steps.append(step)
		else:
			post_steps.append(step)

	# Topline installation pool: €30 per weight unit (Night/Lorella use €38).
	# Full bedroom set (COMPOSITION bundle): minimum pool €300.
	# Individual pieces: same 3.0-unit weight floor as Night/Lorella → €90 minimum.
	_TL_INSTALL_RATE       = 30.0
	_TL_MIN_INSTALL_FULLSET = 300.0

	total_weight = sum(float(l.get("weight") or 0) * int(l.get("qty") or 1) for l in lines)

	is_fullset = any(l.get("role") == "COMPOSITION" for l in lines)
	# Fullset: tiny floor only (division-by-zero guard); €300 minimum applied below.
	# Individual: 3.0-unit floor (same as Night Collection & Lorella → €90 minimum).
	effective_weight = max(total_weight, 0.001 if is_fullset else _MIN_WEIGHT_FLOOR)

	raw_install  = effective_weight * _TL_INSTALL_RATE
	fixed_pool   = (max(raw_install, _TL_MIN_INSTALL_FULLSET) if is_fullset else raw_install) + gozo_amount

	total_cost   = 0.0
	total_rrp_ex = 0.0
	for line in lines:
		qty = int(line.get("qty") or 1)
		sp  = float(line.get("supplier_price") or 0)
		w   = float(line.get("weight") or 0)

		running = sp
		for step in pre_steps:
			running = _apply_step(running, step, lm=0)

		# Allocate weighted installation cost
		if effective_weight > 0:
			allocated = fixed_pool * (w / effective_weight)
		else:
			allocated = 0.0
		line["allocated_fixed"] = round(allocated, 4)
		running += allocated

		for step in post_steps:
			running = _apply_step(running, step, lm=0)

		line["selling_price_ex_vat"] = round(running, 4)
		total_cost   += sp * qty
		total_rrp_ex += running * qty

	rrp_inc_vat = round(total_rrp_ex * (1 + vat_rate / 100), 2)

	import math
	offer_ex_vat  = total_rrp_ex * (1 - max_discount / 100)
	# Round UP to nearest €5 for Topline bedroom sets
	offer_inc_vat = math.ceil(offer_ex_vat * (1 + vat_rate / 100) / 5) * 5

	return {
		"offer_price_inc_vat": float(offer_inc_vat),
		"rrp_inc_vat":         float(rrp_inc_vat),
		"cost_price":          round(total_cost, 2),
		"vat_rate":            float(vat_rate),
		"max_discount_pct":    float(max_discount),
		"total_weight":        round(total_weight, 3),
		"bom_lines":           lines,
		"calculator":          calc_doc.name,
	}


# ---------------------------------------------------------------------------
# Tier re-pricing (called from cm_sales_pricing.py validate hook)
# ---------------------------------------------------------------------------

def apply_configured_line_tiers(doc, method=None):
	"""Re-evaluate price tiers for all CONFIGURED lines on a Quotation/Sales Order.

	This is invoked from Quotation.validate and Sales Order.validate (via hooks.py).
	It is a no-op if there are no CM Custom Lines linked to the document.

	The function:
	1. Groups configured lines by configurator_type (via their price_list)
	2. For each group, sums current offer values at their current tier
	3. Determines the correct tier based on that sum
	4. If the tier changes, updates the offer price for each line in the group

	Tier/price updates are written back to the CM Custom Line records and the
	caller is responsible for updating the Quotation item rows with the new rates.
	"""
	if getattr(doc, "doctype", None) not in {"Quotation", "Sales Order"}:
		return

	custom_lines = frappe.get_all(
		"CM Custom Line",
		filters={
			"parent_doctype": doc.doctype,
			"parent_name": doc.name,
			"line_type": "CONFIGURED",
			"status": ["in", ["Draft", "Confirmed"]],
		},
		fields=[
			"name", "price_list", "tier_name", "offer_incl_vat",
			"config_json", "pricing_json",
		],
	)

	if not custom_lines:
		return

	# Group by configurator_type
	groups: dict[str, list] = {}
	for line in custom_lines:
		pl_type = (
			frappe.db.get_value("Price List", line["price_list"], "cm_configurator_type")
			if line.get("price_list")
			else None
		)
		key = pl_type or "__unknown__"
		groups.setdefault(key, []).append(line)

	for configurator_type, lines in groups.items():
		if configurator_type == "__unknown__":
			continue

		# Get active pricing doc
		pricing_doc = _get_active_pricing_doc(configurator_type, None)
		if not pricing_doc:
			continue

		# Sum current offer values to determine provisional total
		provisional_total = sum(float(l.get("offer_incl_vat") or 0) for l in lines)

		# Determine applicable tier from provisional total
		sorted_tiers = sorted(
			pricing_doc.tiers,
			key=lambda t: float(t.min_order_value_inc_vat or 0),
		)
		new_tier = sorted_tiers[0].tier_name if sorted_tiers else ""
		for tier in sorted_tiers:
			if float(tier.min_order_value_inc_vat or 0) <= provisional_total:
				new_tier = tier.tier_name

		# If any line has a different tier, update pricing for all lines in group
		tier_changed = any(l.get("tier_name") != new_tier for l in lines)
		if not tier_changed:
			continue

		import json
		for line in lines:
			config = {}
			if line.get("config_json"):
				try:
					config = json.loads(line["config_json"])
				except Exception:
					pass

			role_name = config.pop("role_name", "OUTPUT")
			matrix_row = _match_matrix_row(pricing_doc, new_tier, role_name, config)
			if not matrix_row:
				frappe.log_error(
					title="CM Configurator Pricing: tier re-price miss",
					message=(
						f"Could not find matrix row for {configurator_type} / "
						f"tier={new_tier} / dimensions={config}"
					),
				)
				continue

			new_offer = float(matrix_row.offer_price_inc_vat or 0)
			new_rrp = float(matrix_row.rrp_inc_vat or 0)

			frappe.db.set_value("CM Custom Line", line["name"], {
				"tier_name": new_tier,
				"offer_incl_vat": new_offer,
				"rrp_incl_vat": new_rrp,
			})


# ---------------------------------------------------------------------------
# Supplier price list administration (item-level cost prices)
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_supplier_price_lists():
	"""Return all buying Price Lists that have a cm_configurator_type set,
	together with a count of their Item Price records.
	"""
	_require_product_maintainer()

	price_lists = frappe.get_all(
		"Price List",
		filters={"buying": 1, "cm_configurator_type": ["not in", ["", None]]},
		fields=["name", "currency", "cm_configurator_type", "enabled"],
		order_by="name asc",
	)

	for pl in price_lists:
		pl["item_count"] = frappe.db.count("Item Price", {"price_list": pl["name"]})

	return price_lists


@frappe.whitelist()
def get_supplier_item_prices(
	price_list: str,
	search: str = "",
	page: int = 1,
	page_size: int = 50,
):
	"""Return paginated Item Price records for a supplier price list.

	Supports free-text search across item_code and item_name.
	Returns { rows, total, page, page_size }.
	"""
	_require_product_maintainer()

	page = int(page)
	page_size = int(page_size)
	offset = (page - 1) * page_size

	base_where = "ip.price_list = %s"
	values: list = [price_list]

	if search:
		base_where += " AND (ip.item_code LIKE %s OR ip.item_name LIKE %s)"
		like = f"%{frappe.db.escape(search, percent=False)}%"
		values.extend([like, like])

	total = frappe.db.sql(
		f"SELECT COUNT(*) FROM `tabItem Price` ip WHERE {base_where}",
		values,
	)[0][0]

	rows = frappe.db.sql(
		f"""
		SELECT ip.name, ip.item_code, ip.item_name,
		       ip.price_list_rate, ip.currency, ip.uom,
		       i.cm_weight_factor
		FROM `tabItem Price` ip
		LEFT JOIN `tabItem` i ON i.name = ip.item_code
		WHERE {base_where}
		ORDER BY ip.item_code ASC
		LIMIT %s OFFSET %s
		""",
		values + [page_size, offset],
		as_dict=True,
	)

	return {
		"rows":      [dict(r) for r in rows],
		"total":     int(total),
		"page":      page,
		"page_size": page_size,
	}


@frappe.whitelist()
def update_supplier_item_price(name: str, price_list_rate: float):
	"""Update the price_list_rate for a single Item Price record.

	Only Product Maintainers / admins may call this.
	"""
	_require_product_maintainer()

	try:
		price_list_rate = float(price_list_rate)
	except (TypeError, ValueError):
		frappe.throw("price_list_rate must be a number.")

	if price_list_rate < 0:
		frappe.throw("Price cannot be negative.")

	if not frappe.db.exists("Item Price", name):
		frappe.throw(f"Item Price '{name}' not found.", frappe.DoesNotExistError)

	frappe.db.set_value("Item Price", name, "price_list_rate", price_list_rate)
	return {"success": True, "name": name, "price_list_rate": price_list_rate}
