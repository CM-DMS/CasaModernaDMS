from __future__ import annotations

import json
from decimal import Decimal

import frappe

from casamoderna_dms.contract9_products_pricing import compute_pricing


def run():
	"""Deterministic smoke checks for the Products Console baseline.

	Scope:
	- Workspace exists and is role-gated
	- Role exists
	- Item tab label property setters exist (business grouping names)

	This is implementation evidence only; not used by runtime hooks.
	"""
	frappe.set_user("Administrator")

	print("== Products Console: Role presence ==")
	role_name = "CasaModerna Products Console"
	if not frappe.db.exists("Role", role_name):
		frappe.throw(f"Smoke check failed: Role missing: {role_name}")
	print("Role:", role_name)

	print("== Products Console: Workspace presence ==")
	ws_name = "Products Console"
	ws = frappe.get_doc("Workspace", ws_name)
	print("Workspace:", ws.name, "module=", ws.module, "public=", int(ws.public))

	roles = {r.role for r in (ws.roles or [])}
	print("Workspace roles:", sorted(roles))
	if role_name not in roles:
		frappe.throw(f"Smoke check failed: Workspace not gated by role: {role_name}")

	print("== Products Console: Shortcut sanity ==")
	# Basic workflow order: Catalogue + New Product first
	shortcut_labels = [s.label for s in (ws.shortcuts or [])]
	print("Shortcut labels:", shortcut_labels)
	if shortcut_labels[:2] != ["Product Catalogue", "New Product"]:
		frappe.throw(
			"Smoke check failed: Products Console shortcuts should start with: Product Catalogue, New Product"
		)
	for needed in [
		"Product Categories",
		"Bulk Import",
		"Bulk Export",
		"Stock Summary",
		"Internal Stock Transfer",
		"Stock Allocation",
		"Stock Adjustment",
	]:
		if needed not in shortcut_labels:
			frappe.throw(f"Smoke check failed: Workspace shortcut missing: {needed}")

	stock_alloc = [s for s in (ws.shortcuts or []) if s.label == "Stock Allocation"]
	if not stock_alloc:
		frappe.throw("Smoke check failed: Workspace shortcut missing: Stock Allocation")
	if len(stock_alloc) != 1:
		frappe.throw("Smoke check failed: Workspace shortcut duplicated: Stock Allocation")
	stock_alloc = stock_alloc[0]
	print("Stock Allocation ->", stock_alloc.type, stock_alloc.link_to, stock_alloc.doc_view)
	if stock_alloc.type != "DocType" or stock_alloc.link_to != "Stock Reservation Entry" or stock_alloc.doc_view != "List":
		frappe.throw(
			"Smoke check failed: Stock Allocation shortcut must be DocType -> Stock Reservation Entry (List)"
		)

	categories = [s for s in (ws.shortcuts or []) if s.label == "Product Categories"]
	if not categories:
		frappe.throw("Smoke check failed: Workspace shortcut missing: Product Categories")
	if len(categories) != 1:
		frappe.throw("Smoke check failed: Workspace shortcut duplicated: Product Categories")
	categories = categories[0]
	print("Product Categories ->", categories.type, categories.link_to, categories.doc_view)
	if categories.type != "DocType" or categories.link_to != "Item Group" or categories.doc_view != "Tree":
		frappe.throw("Smoke check failed: Product Categories shortcut must be DocType -> Item Group (Tree)")

	print("== Products Console: Item tab label property setters ==")
	expected = {
		"Item-details-label": "General",
		"Item-purchasing_tab-label": "Suppliers & Pricing",
		"Item-inventory_section-label": "Stock",
		"Item-dashboard_tab-label": "Transactions",
		"Item-variants_section-label": "Specs",
	}
	for ps_name, expected_value in expected.items():
		if not frappe.db.exists("Property Setter", ps_name):
			frappe.throw(f"Smoke check failed: Property Setter missing: {ps_name}")
		ps = frappe.get_doc("Property Setter", ps_name)
		actual = (ps.value or "").strip()
		print(ps.name, "->", actual)
		if actual != expected_value:
			frappe.throw(f"Smoke check failed: {ps.name} value mismatch: {actual} != {expected_value}")

	print("== Products Console: Composition tab is retired ==")
	ps_name = "Item-manufacturing-hidden"
	if not frappe.db.exists("Property Setter", ps_name):
		frappe.throw(f"Smoke check failed: Property Setter missing: {ps_name}")
	ps = frappe.get_doc("Property Setter", ps_name)
	actual = (ps.value or "").strip()
	print(ps.name, "->", actual)
	if actual != "1":
		frappe.throw(f"Smoke check failed: {ps.name} value mismatch: {actual} != 1")

	print("== Products Console: Item extra-tab hiding property setters ==")
	hidden_expected = [
		"Item-accounting-hidden",
		"Item-sales_details-hidden",
		"Item-item_tax_section_break-hidden",
		"Item-quality_tab-hidden",
	]
	for ps_name in hidden_expected:
		if not frappe.db.exists("Property Setter", ps_name):
			frappe.throw(f"Smoke check failed: Property Setter missing: {ps_name}")
		ps = frappe.get_doc("Property Setter", ps_name)
		actual = (ps.value or "").strip()
		print(ps.name, "->", actual)
		if actual != "1":
			frappe.throw(f"Smoke check failed: {ps.name} value mismatch: {actual} != 1")

	print("== Products Console: Item visible tabs are restricted to 5 ==")
	meta = frappe.get_meta("Item")
	all_tab_fields = [df for df in meta.fields if df.fieldtype == "Tab Break"]
	visible_tabs = [df.fieldname for df in all_tab_fields if df.fieldname and not int(getattr(df, "hidden", 0) or 0)]
	visible_tabs_set = set(visible_tabs)
	expected_visible = {
		"details",
		"purchasing_tab",
		"inventory_section",
		"dashboard_tab",
		"variants_section",
	}
	print("Visible tabs:", sorted(visible_tabs_set))
	if visible_tabs_set != expected_visible:
		frappe.throw(f"Smoke check failed: Item visible tabs mismatch: {sorted(visible_tabs_set)} != {sorted(expected_visible)}")

	print("== Products Console: Item catalogue list-view columns ==")
	list_view_expected = [
		"Item-item_code-in_list_view",
		"Item-item_name-in_list_view",
		"Item-item_group-in_list_view",
		"Item-brand-in_list_view",
		"Item-stock_uom-in_list_view",
		"Item-disabled-in_list_view",
		"Item-is_stock_item-in_list_view",
		"Item-has_variants-in_list_view",
		"Item-variant_of-in_list_view",
	]
	for ps_name in list_view_expected:
		if not frappe.db.exists("Property Setter", ps_name):
			frappe.throw(f"Smoke check failed: Property Setter missing: {ps_name}")
		ps = frappe.get_doc("Property Setter", ps_name)
		actual = (ps.value or "").strip()
		print(ps.name, "->", actual)
		if actual != "1":
			frappe.throw(f"Smoke check failed: {ps.name} value mismatch: {actual} != 1")

	print("== Products Console: CM Item list filters ==")
	filter_names = [
		"CM Active Products",
		"CM Stock Items",
		"CM Non-Stock Items",
		"CM Templates (Has Variants)",
		"CM Variants (Variant Of Set)",
		"CM Missing RRP",
		"CM Tile Pricing",
	]
	for name in filter_names:
		if not frappe.db.exists("List Filter", name):
			frappe.throw(f"Smoke check failed: List Filter missing: {name}")
		doc = frappe.get_doc("List Filter", name)
		if doc.reference_doctype != "Item":
			frappe.throw(f"Smoke check failed: List Filter doctype mismatch: {name} -> {doc.reference_doctype}")
		print("List Filter:", doc.name)

	print("== Products Console: Item structural grouping fields (Custom Field) ==")
	structural = [
		"cm_general_identity_section",
		"cm_suppliers_pricing_section",
		"cm_supplier_price_pipeline_section",
		"cm_supplier_price_pipeline_banner",
		"cm_pricing_ops_help",
		"cm_supplier_price_pipeline_grid",
		"cm_pricing_inputs_section",
		"cm_inputs_missing_steps_help",
		"cm_landed_additions_section",
		"cm_landed_additions_help",
		"cm_calculated_steps_section",
		"cm_calculated_steps_help",
		"cm_pricing_outputs_section",
		"cm_erpnext_purchase_controls_section",
		"cm_composition_overview_section",
		"cm_composition_note",
		"cm_stock_controls_section",
		"cm_transactions_overview_section",
		"cm_transactions_help",
		"cm_specs_overview_section",
		"cm_specs_note",
	]
	for fieldname in structural:
		cf_name = f"Item-{fieldname}"
		if not frappe.db.exists("Custom Field", cf_name):
			frappe.throw(f"Smoke check failed: Custom Field missing: {cf_name}")
		print("Custom Field:", cf_name)

	meta = frappe.get_meta("Item")
	for fieldname in structural:
		if not meta.get_field(fieldname):
			frappe.throw(f"Smoke check failed: Item meta missing structural field: {fieldname}")

	print("== Products Console: Suppliers & Pricing pipeline ordering ==")

	def purchasing_tab_fieldnames() -> list[str]:
		seq: list[str] = []
		in_tab = False
		for df in meta.fields:
			if df.fieldtype == "Tab Break" and df.fieldname:
				if df.fieldname == "purchasing_tab":
					in_tab = True
				else:
					if in_tab:
						break
			if in_tab and getattr(df, "fieldname", None):
				seq.append(df.fieldname)
		return seq

	seq = purchasing_tab_fieldnames()
	idx = {fn: i for i, fn in enumerate(seq)}
	print("Purchasing tab fields (count):", len(seq))

	def require_before(a: str, b: str):
		if a not in idx:
			frappe.throw(f"Smoke check failed: Item purchasing tab missing field: {a}")
		if b not in idx:
			frappe.throw(f"Smoke check failed: Item purchasing tab missing field: {b}")
		if idx[a] >= idx[b]:
			frappe.throw(
				"Smoke check failed: Item Suppliers & Pricing ordering broken: "
				f"{a} (idx={idx[a]}) must be before {b} (idx={idx[b]})"
			)

	# Commercial ladder sections must appear in this order.
	require_before("cm_suppliers_pricing_section", "cm_supplier_price_pipeline_section")
	require_before("cm_supplier_price_pipeline_section", "cm_pricing_inputs_section")
	require_before("cm_pricing_inputs_section", "cm_landed_additions_section")
	require_before("cm_landed_additions_section", "cm_calculated_steps_section")
	require_before("cm_calculated_steps_section", "cm_pricing_outputs_section")
	require_before("cm_pricing_outputs_section", "cm_erpnext_purchase_controls_section")

	# The pipeline grid must render before inputs begin.
	require_before("cm_pricing_ops_help", "cm_supplier_price_pipeline_grid")
	require_before("cm_supplier_price_pipeline_grid", "cm_pricing_inputs_section")

	# Push ERPNext supplier_items table into the low-priority purchase controls section.
	if "supplier_items" in idx:
		require_before("cm_erpnext_purchase_controls_section", "supplier_items")

	print("== Products Console: General clutter reductions (Property Setters) ==")
	general_hidden = [
		"Item-is_fixed_asset-hidden",
		"Item-auto_create_assets-hidden",
		"Item-is_grouped_asset-hidden",
		"Item-asset_category-hidden",
		"Item-asset_naming_series-hidden",
		"Item-over_delivery_receipt_allowance-hidden",
		"Item-over_billing_allowance-hidden",
	]
	for ps_name in general_hidden:
		if not frappe.db.exists("Property Setter", ps_name):
			frappe.throw(f"Smoke check failed: Property Setter missing: {ps_name}")
		ps = frappe.get_doc("Property Setter", ps_name)
		actual = (ps.value or "").strip()
		print(ps.name, "->", actual)
		if actual != "1":
			frappe.throw(f"Smoke check failed: {ps.name} value mismatch: {actual} != 1")

	print("== Products Console: Transactions tab is not empty ==")
	tx_help = meta.get_field("cm_transactions_help")
	if not tx_help:
		frappe.throw("Smoke check failed: Transactions help field missing from meta")
	if int(getattr(tx_help, "hidden", 0) or 0):
		frappe.throw("Smoke check failed: Transactions help field is hidden")
	print("Transactions help field visible")

	print("== Products Console: Specs tab exposes Variant Attributes when applicable ==")
	ps_name = "Item-attributes-hidden"
	if not frappe.db.exists("Property Setter", ps_name):
		frappe.throw(f"Smoke check failed: Property Setter missing: {ps_name}")
	ps = frappe.get_doc("Property Setter", ps_name)
	actual = (ps.value or "").strip()
	print(ps.name, "->", actual)
	if actual != "0":
		frappe.throw(f"Smoke check failed: {ps.name} value mismatch: {actual} != 0")
	attributes_df = meta.get_field("attributes")
	if not attributes_df:
		frappe.throw("Smoke check failed: Item meta missing: attributes")
	if int(getattr(attributes_df, "hidden", 0) or 0):
		frappe.throw("Smoke check failed: Variant Attributes is hidden in meta")
	print("Variant Attributes available")

	print("== Products Console: Stock tab starts cleanly ==")
	ps_name = "Item-cm_stock_controls_section-hidden"
	if not frappe.db.exists("Property Setter", ps_name):
		frappe.throw(f"Smoke check failed: Property Setter missing: {ps_name}")
	ps = frappe.get_doc("Property Setter", ps_name)
	actual = (ps.value or "").strip()
	print(ps.name, "->", actual)
	if actual != "1":
		frappe.throw(f"Smoke check failed: {ps.name} value mismatch: {actual} != 1")
	cm_stock_section = meta.get_field("cm_stock_controls_section")
	if not cm_stock_section:
		frappe.throw("Smoke check failed: Item meta missing: cm_stock_controls_section")
	if not int(getattr(cm_stock_section, "hidden", 0) or 0):
		frappe.throw("Smoke check failed: cm_stock_controls_section should be hidden")
	print("Stock tab start cleaned")

	print("== Products Console: Contract 8 role + permissions slice ==")
	maintainer_role = "CasaModerna Product Maintainer"
	if not frappe.db.exists("Role", maintainer_role):
		frappe.throw(f"Smoke check failed: Role missing: {maintainer_role}")
	print("Role:", maintainer_role)

	# Contract 17: Standard DocPerm must be the only controlling layer.
	# Any Custom DocPerm rows for these doctypes would shadow DocPerm and is not allowed.
	for parent in ["Item", "Item Group", "Company", "Customer", "Quotation", "Sales Order", "Delivery Note", "Sales Invoice", "File", "Workspace", "List Filter", "Print Format"]:
		if frappe.db.exists("DocType", "Custom DocPerm"):
			shadow = frappe.get_all("Custom DocPerm", filters={"parent": parent}, fields=["name"], limit=1)
			if shadow:
				frappe.throw(f"Smoke check failed: Custom DocPerm shadow layer present for {parent}: {shadow[0]['name']}")

	def get_docperm(parent: str, role: str):
		rows = frappe.get_all(
			"DocPerm",
			filters={"parent": parent, "role": role, "permlevel": 0},
			fields=["name", "read", "write", "create", "delete"],
			limit=5,
		)
		return rows[0] if rows else None

	pc_role = "CasaModerna Products Console"
	item_pc = get_docperm("Item", pc_role)
	if not item_pc or not int(item_pc.get("read") or 0):
		frappe.throw("Smoke check failed: DocPerm missing/invalid: Item read for CasaModerna Products Console")
	print("DocPerm:", item_pc.get("name"), "Item ->", pc_role)

	ig_pc = get_docperm("Item Group", pc_role)
	if not ig_pc or not int(ig_pc.get("read") or 0) or int(ig_pc.get("write") or 0) or int(ig_pc.get("create") or 0):
		frappe.throw("Smoke check failed: DocPerm missing/invalid: Item Group read-only for CasaModerna Products Console")
	print("DocPerm:", ig_pc.get("name"), "Item Group ->", pc_role)

	item_pm = get_docperm("Item", maintainer_role)
	if not item_pm or not int(item_pm.get("read") or 0) or not int(item_pm.get("write") or 0) or int(item_pm.get("create") or 0):
		frappe.throw("Smoke check failed: DocPerm missing/invalid: Item write (no create) for CasaModerna Product Maintainer")
	print("DocPerm:", item_pm.get("name"), "Item ->", maintainer_role)

	ig_pm = get_docperm("Item Group", maintainer_role)
	if not ig_pm or not int(ig_pm.get("read") or 0) or not int(ig_pm.get("write") or 0) or not int(ig_pm.get("create") or 0) or int(ig_pm.get("delete") or 0):
		frappe.throw("Smoke check failed: DocPerm missing/invalid: Item Group create+write (no delete) for CasaModerna Product Maintainer")
	print("DocPerm:", ig_pm.get("name"), "Item Group ->", maintainer_role)

	print("== Products Console: Contract 8 product image path is available ==")
	image_df = meta.get_field("image")
	if not image_df:
		frappe.throw("Smoke check failed: Item meta missing: image")
	if int(getattr(image_df, "hidden", 0) or 0):
		frappe.throw("Smoke check failed: Item image field is hidden")
	ps_name = "Item-image-read_only_depends_on"
	if not frappe.db.exists("Property Setter", ps_name):
		frappe.throw(f"Smoke check failed: Property Setter missing: {ps_name}")
	ps = frappe.get_doc("Property Setter", ps_name)
	expected_expr = "eval: !frappe.user.has_role('CasaModerna Product Maintainer')"
	actual_expr = (ps.value or "").strip()
	print(ps.name, "->", actual_expr)
	if actual_expr != expected_expr:
		frappe.throw(f"Smoke check failed: {ps.name} value mismatch")
	meta_expr = (getattr(image_df, "read_only_depends_on", None) or "").strip()
	if meta_expr != expected_expr:
		frappe.throw("Smoke check failed: Item image read_only_depends_on not applied")
	print("Item image field visible with maintainer-only edit gating")

	print("== Products Console: Contract 9 CasaModerna product fields exist ==")
	# Identity fields (General tab)
	identity_fields = ["cm_given_name", "cm_description_line_1", "cm_description_line_2"]
	# Supplier + pricing fields (Suppliers & Pricing tab)
	supplier_fields = [
		"cm_supplier_name",
		"cm_supplier_code",
		"cm_supplier_variant_description",
		"cm_supplier_item_code",
		"cm_supplier_item_name",
		"cm_supplier_currency",
		"cm_supplier_pack",
	]
	# Contract 12:
	# - discount input is now cm_discount_target_percent
	# - cm_discount_percent is stored as effective discount output
	pricing_inputs = ["cm_rrp_ex_vat", "cm_discount_target_percent", "cm_cost_ex_vat", "cm_pricing_mode_ui"]
	internal_pricing_fields = ["cm_pricing_rounding_mode"]
	pricing_outputs = [
		"cm_rrp_inc_vat",
		"cm_discounted_inc_vat",
		"cm_final_offer_inc_vat",
		"cm_final_offer_ex_vat",
		"cm_discount_percent",
		"cm_rounding_delta",
		"cm_profit_ex_vat",
		"cm_margin_percent",
		"cm_markup_percent",
	]
	contract10_fields = ["cm_pricing_ops_help", "cm_pricing_inputs_section", "cm_pricing_outputs_section"]
	contract_reset_ladder_fields = [
		"cm_supplier_price_pipeline_section",
		"cm_supplier_price_pipeline_banner",
		"cm_pricing_inputs_section",
		"cm_supplier_list_price_ex_vat",
		"cm_increase_before_percent",
		"cm_discount_1_percent",
		"cm_discount_2_percent",
		"cm_discount_3_percent",
		"cm_increase_after_percent",
		"cm_landed_additions_section",
		"cm_shipping_percent",
		"cm_shipping_fee",
		"cm_handling_fee",
		"cm_other_landed",
		"cm_calculated_steps_section",
		"cm_after_increase_before_ex_vat",
		"cm_after_discount_1_ex_vat",
		"cm_after_discount_2_ex_vat",
		"cm_after_discount_3_ex_vat",
		"cm_purchase_price_ex_vat",
		"cm_landed_additions_total_ex_vat",
		"cm_cost_ex_vat_calculated",
		"cm_vat_rate_percent",
		"cm_erpnext_purchase_controls_section",
	]
	for fn in (
		identity_fields
		+ supplier_fields
		+ pricing_inputs
		+ internal_pricing_fields
		+ pricing_outputs
		+ contract10_fields
		+ contract_reset_ladder_fields
	):
		df = meta.get_field(fn)
		if not df:
			frappe.throw(f"Smoke check failed: Item meta missing Contract 9 field: {fn}")

	# Placement by tab (meta-based)
	def tab_for(fieldname: str) -> str | None:
		current = None
		for df in meta.fields:
			if df.fieldtype == "Tab Break" and df.fieldname:
				current = df.fieldname
			if df.fieldname == fieldname:
				return current
		return None

	for fn in identity_fields:
		if tab_for(fn) != "details":
			frappe.throw(f"Smoke check failed: {fn} must be in General (details) tab")
	for fn in supplier_fields + pricing_inputs + pricing_outputs:
		if tab_for(fn) != "purchasing_tab":
			frappe.throw(f"Smoke check failed: {fn} must be in Suppliers & Pricing (purchasing_tab) tab")

	# Pricing mode: internal tokens must not be visible in the business UI.
	internal_mode_df = meta.get_field("cm_pricing_rounding_mode")
	if not int(getattr(internal_mode_df, "hidden", 0) or 0):
		frappe.throw("Smoke check failed: cm_pricing_rounding_mode must be hidden (internal)")
	ui_mode_df = meta.get_field("cm_pricing_mode_ui")
	ui_options = [o.strip() for o in (ui_mode_df.options or "").split("\n") if o.strip()]
	if ui_options != ["Whole Euro (Round Up)", "Tiles (2 Decimals)"]:
		frappe.throw("Smoke check failed: cm_pricing_mode_ui options mismatch")
	# Contract 16: Tile fields should depend on internal rounding mode.
	for fn in ["cm_tiles_per_box", "cm_sqm_per_box"]:
		df = meta.get_field(fn)
		if not df:
			frappe.throw(f"Smoke check failed: missing tile field: {fn}")
		dep = (getattr(df, "depends_on", None) or "")
		if "cm_pricing_rounding_mode" not in dep or "tile_decimal_pricing" not in dep:
			frappe.throw(
				f"Smoke check failed: {fn} depends_on must reference cm_pricing_rounding_mode == tile_decimal_pricing"
			)

	# Derived fields should be read-only
	derived = pricing_outputs + [
		"cm_after_increase_before_ex_vat",
		"cm_after_discount_1_ex_vat",
		"cm_after_discount_2_ex_vat",
		"cm_after_discount_3_ex_vat",
		"cm_purchase_price_ex_vat",
		"cm_landed_additions_total_ex_vat",
		"cm_cost_ex_vat_calculated",
		"cm_vat_rate_percent",
	]
	for fn in derived:
		df = meta.get_field(fn)
		if not int(getattr(df, "read_only", 0) or 0):
			frappe.throw(f"Smoke check failed: {fn} must be read-only")
	print("Contract 9 Item fields present and placed")

	print("== Products Console: Contract 10 pricing ops safety + grouping ==")
	# Pricing ops help must be HTML
	help_df = meta.get_field("cm_pricing_ops_help")
	if not help_df or help_df.fieldtype != "HTML":
		frappe.throw("Smoke check failed: cm_pricing_ops_help must exist and be HTML")
	# Pricing grouping section breaks
	for fn in ["cm_pricing_inputs_section", "cm_pricing_outputs_section"]:
		df = meta.get_field(fn)
		if not df or df.fieldtype != "Section Break":
			frappe.throw(f"Smoke check failed: {fn} must exist and be a Section Break")

	# Client script must exist (renders VAT status + guide)
	cs_name = "Item - CasaModerna Pricing Ops"
	if not frappe.db.exists("Client Script", cs_name):
		frappe.throw(f"Smoke check failed: Client Script missing: {cs_name}")
	cs = frappe.get_doc("Client Script", cs_name)
	if not int(getattr(cs, "enabled", 0) or 0):
		frappe.throw(f"Smoke check failed: Client Script disabled: {cs_name}")
	script = cs.script or ""
	for token in ["cm_pricing_ops_help", "cm_vat_rate_percent", "frappe.db.get_value"]:
		if token not in script:
			frappe.throw(f"Smoke check failed: Client Script missing token: {token}")
	print("Contract 10 pricing ops client safety present")

	print("== Products Console: Contract 17 General tab overview layout ==")
	# Structural fields enabling a V1-like General overview.
	general_required_custom_fields = [
		"cm_general_meta_panel",
		"cm_general_pricing_summary",
		"cm_general_attachments_section",
		"cm_general_attachments_panel",
		"cm_general_admin_section",
	]
	for fn in general_required_custom_fields:
		if not meta.get_field(fn):
			frappe.throw(f"Smoke check failed: missing Contract 17 general field: {fn}")
		print("Custom Field:", f"Item-{fn}")

	# Client script: renders pricing summary + attachments list (display-only).
	cs_name = "Item - CasaModerna General Overview"
	if not frappe.db.exists("Client Script", cs_name):
		frappe.throw(f"Smoke check failed: Client Script missing: {cs_name}")
	cs = frappe.get_doc("Client Script", cs_name)
	if not int(getattr(cs, "enabled", 0) or 0):
		frappe.throw(f"Smoke check failed: Client Script disabled: {cs_name}")
	script = cs.script or ""
	for token in [
		"cm_general_pricing_summary",
		"cm_general_attachments_panel",
		"cm_rrp_ex_vat",
		"cm_final_offer_inc_vat",
		"cm_discount_percent",
		"precision:3",
	]:
		if token not in script:
			frappe.throw(f"Smoke check failed: Contract 17 client script missing token: {token}")
	# Must be lightweight: no server calls from the General tab overview.
	for token in ["frappe.call", "frappe.db.get_value", "frappe.xcall"]:
		if token in script:
			frappe.throw(f"Smoke check failed: Contract 17 client script must not call server: {token}")
	print("Contract 17 general overview client script present")

	# Supporting property setters: commercial labels + collapsed admin section + V1-like ordering.
	for ps_name in [
		"Item-item_code-label",
		"Item-item_name-label",
		"Item-item_group-label",
		"Item-stock_uom-label",
		"Item-image-insert_after",
		"Item-item_code-insert_after",
		"Item-item_name-insert_after",
		"Item-item_group-insert_after",
		"Item-brand-insert_after",
		"Item-stock_uom-insert_after",
		"Item-cm_general_admin_section-collapsible",
		"Item-cm_general_admin_section-collapsed",
		"Item-description-insert_after",
		"Item-uoms-insert_after",
		"Item-section_break_11-hidden",
		"Item-unit_of_measure_conversion-hidden",
	]:
		if not frappe.db.exists("Property Setter", ps_name):
			frappe.throw(f"Smoke check failed: Property Setter missing: {ps_name}")
		print("Property Setter:", ps_name)

	def details_tab_sequence():
		seq = []
		in_tab = False
		for df in meta.fields:
			if df.fieldtype == "Tab Break" and df.fieldname:
				if df.fieldname == "details":
					in_tab = True
				else:
					if in_tab:
						break
			if in_tab:
				seq.append({"fieldname": df.fieldname, "fieldtype": df.fieldtype, "label": df.label})
		return seq

	seq = details_tab_sequence()
	pos = {row["fieldname"]: i for i, row in enumerate(seq) if row.get("fieldname")}
	for fn in [
		"cm_general_identity_section",
		"image",
		"column_break0",
		"item_code",
		"item_name",
		"item_group",
		"brand",
		"stock_uom",
		"cm_general_meta_panel",
		"cm_general_pricing_summary",
		"cm_general_attachments_section",
		"cm_general_admin_section",
		"description",
		"uoms",
	]:
		if fn not in pos:
			frappe.throw(f"Smoke check failed: missing from details tab sequence: {fn}")

	if not (pos["image"] < pos["column_break0"] < pos["item_code"]):
		frappe.throw("Smoke check failed: General tab must start with image (left) then column break then details")
	cat_brand_before_uom = max(pos["item_group"], pos["brand"]) < pos["stock_uom"]
	cat_brand_after_desc = min(pos["item_group"], pos["brand"]) > pos["cm_description_line_2"]
	if not (cat_brand_after_desc and cat_brand_before_uom):
		frappe.throw("Smoke check failed: Category + Brand must appear in the top-right profile (before UOM)")
	if not (pos["stock_uom"] < pos["cm_general_meta_panel"] < pos["cm_general_pricing_summary"] < pos["cm_general_attachments_section"]):
		frappe.throw("Smoke check failed: meta + pricing summary must appear before Attachments section")
	if not (pos["cm_general_attachments_section"] < pos["cm_general_admin_section"] < pos["description"]):
		frappe.throw("Smoke check failed: admin section must contain Description below attachments")
	if not (pos["cm_general_admin_section"] < pos["uoms"]):
		frappe.throw("Smoke check failed: admin section must contain UOMs below attachments")
	print("Contract 17 General overview layout OK")

	print("== Products Console: General pricing headline fields (outputs) ==")
	# General tab shows pricing headline via HTML; these source fields must remain outputs
	# (read-only) and keep the 3dp effective discount contract.
	for fn in ["cm_rrp_ex_vat", "cm_final_offer_inc_vat", "cm_discount_percent"]:
		df = meta.get_field(fn)
		if not df:
			frappe.throw(f"Smoke check failed: missing pricing field on Item meta: {fn}")
		print("Pricing field:", fn, "type=", df.fieldtype, "hidden=", int(getattr(df, "hidden", 0) or 0), "ro=", int(getattr(df, "read_only", 0) or 0))

	# Effective discount is stored output: must be read-only, hidden in the form, and 3dp.
	df = meta.get_field("cm_discount_percent")
	if int(getattr(df, "read_only", 0) or 0) != 1:
		frappe.throw("Smoke check failed: cm_discount_percent must be read-only (effective discount output)")
	if int(getattr(df, "hidden", 0) or 0) != 1:
		frappe.throw("Smoke check failed: cm_discount_percent must be hidden (displayed via headline/summary)")
	precision = getattr(df, "precision", None)
	if precision not in (3, "3"):
		frappe.throw(f"Smoke check failed: cm_discount_percent precision must be 3 (got {precision!r})")

	# Final offer inc VAT is a computed output.
	df = meta.get_field("cm_final_offer_inc_vat")
	if int(getattr(df, "read_only", 0) or 0) != 1:
		frappe.throw("Smoke check failed: cm_final_offer_inc_vat must be read-only (computed output)")

	print("== Products Console: Contract Reset Suppliers & Pricing ladder flow ==")
	# Verify standard purchase leftovers are isolated under a single low-priority section.
	ps_required = [
		"Item-purchase_uom-insert_after",
		"Item-lead_time_days-insert_after",
		"Item-supplier_items-insert_after",
		"Item-purchase_details_cb-hidden",
		"Item-supplier_details-hidden",
		"Item-column_break2-hidden",
		"Item-foreign_trade_details-hidden",
		"Item-column_break_59-hidden",
		"Item-cm_pricing_rounding_mode-hidden",
	]
	for ps_name in ps_required:
		if not frappe.db.exists("Property Setter", ps_name):
			frappe.throw(f"Smoke check failed: Property Setter missing: {ps_name}")
		print("Property Setter:", ps_name)

	def purchasing_tab_sequence():
		seq = []
		in_tab = False
		for df in meta.fields:
			if df.fieldtype == "Tab Break" and df.fieldname:
				if df.fieldname == "purchasing_tab":
					in_tab = True
				else:
					if in_tab:
						break
			if in_tab:
				seq.append({"fieldname": df.fieldname, "fieldtype": df.fieldtype, "label": df.label})
		return seq

	seq = purchasing_tab_sequence()
	pos = {row["fieldname"]: i for i, row in enumerate(seq) if row.get("fieldname")}

	for fn in [
		"cm_suppliers_pricing_section",
		"cm_supplier_price_pipeline_section",
		"cm_supplier_price_pipeline_grid",
		"cm_pricing_inputs_section",
		"cm_supplier_list_price_ex_vat",
		"cm_landed_additions_section",
		"cm_shipping_fee",
		"cm_calculated_steps_section",
		"cm_purchase_price_ex_vat",
		"cm_pricing_outputs_section",
		"cm_selling_summary_grid",
		"cm_rrp_ex_vat",
		"cm_final_offer_inc_vat",
		"cm_erpnext_purchase_controls_section",
		"min_order_qty",
	]:
		if fn not in pos:
			frappe.throw(f"Smoke check failed: missing from purchasing_tab sequence: {fn}")

	# Order: Suppliers -> Pipeline -> Inputs -> Landed -> Steps -> Selling -> Additional Purchase Controls.
	if not (
		pos["cm_suppliers_pricing_section"]
		< pos["cm_supplier_price_pipeline_section"]
		< pos["cm_pricing_inputs_section"]
		< pos["cm_landed_additions_section"]
		< pos["cm_calculated_steps_section"]
		< pos["cm_pricing_outputs_section"]
		< pos["cm_erpnext_purchase_controls_section"]
	):
		frappe.throw("Smoke check failed: Suppliers & Pricing major sections are not in the expected order")

	# Representative ladder order inside sections.
	if not (
		pos["cm_supplier_list_price_ex_vat"] < pos["cm_landed_additions_section"] < pos["cm_purchase_price_ex_vat"]
	):
		frappe.throw("Smoke check failed: ladder fields not ordered as Inputs -> Landed -> Calculated")
	if not (pos["cm_pricing_outputs_section"] < pos["cm_selling_summary_grid"] < pos["cm_rrp_ex_vat"]):
		frappe.throw("Smoke check failed: Selling summary grid must appear before RRP input")
	if not (pos["cm_rrp_ex_vat"] < pos["cm_final_offer_inc_vat"]):
		frappe.throw("Smoke check failed: Selling section must show RRP before offer outputs")

	# Leftover purchase controls should not pollute selling.
	if not (pos["cm_erpnext_purchase_controls_section"] < pos["min_order_qty"]):
		frappe.throw("Smoke check failed: min_order_qty must be under ERPNext Purchase Controls section")

	# Label sanity (non-pixel-perfect but ensures intent)
	labels = {row["fieldname"]: (row.get("label") or "") for row in seq if row.get("fieldname")}
	if (labels.get("cm_suppliers_pricing_section") or "").strip().lower() not in {"suppliers", "suppliers & pricing"}:
		frappe.throw("Smoke check failed: cm_suppliers_pricing_section label unexpected")
	if (labels.get("cm_pricing_inputs_section") or "").strip().lower() != "inputs":
		frappe.throw("Smoke check failed: cm_pricing_inputs_section label must be 'Inputs'")
	if (labels.get("cm_pricing_outputs_section") or "").strip().lower() != "selling":
		frappe.throw("Smoke check failed: cm_pricing_outputs_section label must be 'Selling'")
	if (labels.get("cm_erpnext_purchase_controls_section") or "").strip().lower() != "additional purchase controls":
		frappe.throw("Smoke check failed: bottom section label must be 'Additional Purchase Controls'")

	# No placeholder/dev wording in helper HTML fields.
	for fn in ["cm_inputs_missing_steps_help", "cm_landed_additions_help", "cm_calculated_steps_help"]:
		df = meta.get_field(fn)
		if not df:
			continue
		text = (getattr(df, "options", None) or "")
		banned = ["not yet", "current pricing model", "contract slice", "not modelled", "deterministic fields"]
		if any(b in text.lower() for b in banned):
			frappe.throw(f"Smoke check failed: placeholder/dev wording present in {fn}")

	print("Contract Reset Suppliers & Pricing ladder flow OK")

	print("== Products Console: Contract 10 catalogue pricing visibility ==")
	# Ensure selected pricing/identity fields are marked for list view (meta-based)
	for fn in ["cm_supplier_code", "cm_rrp_ex_vat", "cm_discount_percent"]:
		df = meta.get_field(fn)
		if not df:
			frappe.throw(f"Smoke check failed: missing list-view candidate field: {fn}")
		if not int(getattr(df, "in_list_view", 0) or 0):
			frappe.throw(f"Smoke check failed: {fn} must be in_list_view for catalogue scanning")
	print("Contract 10 catalogue columns present")

	print("== Products Console: Contract 9 Company VAT field exists ==")
	company_meta = frappe.get_meta("Company")
	if not company_meta.get_field("cm_vat_rate_percent"):
		frappe.throw("Smoke check failed: Company meta missing: cm_vat_rate_percent")
	print("Company.cm_vat_rate_percent present")

	print("== Products Console: Contract 9 pricing engine math ==")
	# Non-tile: roundup to whole euro
	res = compute_pricing(
		rrp_ex_vat=Decimal("100"),
		discount_percent=Decimal("10"),
		vat_rate_percent=Decimal("18"),
		rounding_mode="whole_euro_roundup",
	)
	if res["final_offer_inc_vat"] != Decimal("107"):
		frappe.throw("Smoke check failed: pricing non-tile roundup case failed")
	if res["effective_discount_percent"] != Decimal("9.322"):
		frappe.throw("Smoke check failed: pricing effective discount non-tile case failed")
	# Tile: keep 2 decimals
	res = compute_pricing(
		rrp_ex_vat=Decimal("10"),
		discount_percent=Decimal("12.5"),
		vat_rate_percent=Decimal("18"),
		rounding_mode="tile_decimal_pricing",
	)
	if res["final_offer_inc_vat"].quantize(Decimal("0.01")) != res["final_offer_inc_vat"]:
		frappe.throw("Smoke check failed: pricing tile 2dp case failed")
	if res["effective_discount_percent"] != Decimal("12.458"):
		frappe.throw("Smoke check failed: pricing effective discount tile case failed")

	# Profitability outputs (only when cost provided)
	res = compute_pricing(
		rrp_ex_vat=Decimal("100"),
		discount_percent=Decimal("10"),
		vat_rate_percent=Decimal("18"),
		rounding_mode="whole_euro_roundup",
		cost_ex_vat=Decimal("80"),
	)
	if res["profit_ex_vat"] != Decimal("10.68"):
		frappe.throw("Smoke check failed: pricing profit_ex_vat case failed")
	if res["margin_percent"] != Decimal("11.778"):
		frappe.throw("Smoke check failed: pricing margin_percent case failed")
	if res["markup_percent"] != Decimal("13.350"):
		frappe.throw("Smoke check failed: pricing markup_percent case failed")
	print("Pricing engine math OK")

	print("\nOK: Products Console smoke checks passed")


def discover(needle: str = "Sofa"):
	"""Read-only discovery helper for Contract 2.

	Purpose:
	- Confirm whether any "Sofa Pricing"-like assets exist in the DB
	- Confirm which standard ERPNext targets exist for workspace shortcuts

	This prints a compact JSON payload so it can be inspected in logs.
	"""
	frappe.set_user("Administrator")

	def like_names(doctype: str):
		return frappe.get_all(
			doctype,
			filters={"name": ["like", f"%{needle}%"]},
			pluck="name",
			limit=50,
		)

	result = {
		"needle": needle,
		"like": {dt: like_names(dt) for dt in ["DocType", "Report", "Page", "Workspace"]},
		"exists": {},
	}

	checks = [
		"Sofa Pricing",
		"Stock Reservation Entry",
		"Pick List",
		"Stock Reconciliation",
		"Stock Entry",
		"Stock Balance",
		"Item",
	]
	for name in checks:
		result["exists"][name] = {
			"DocType": bool(frappe.db.exists("DocType", name)),
			"Report": bool(frappe.db.exists("Report", name)),
			"Page": bool(frappe.db.exists("Page", name)),
			"Workspace": bool(frappe.db.exists("Workspace", name)),
		}

	print(json.dumps(result, indent=2, sort_keys=True))
	return result


def item_layout_summary():
	"""Print the current Item tab/section layout (read-only).

	Used to drive safe, explicit Property Setter / Custom Field changes.
	"""
	frappe.set_user("Administrator")
	meta = frappe.get_meta("Item")

	rows = []
	for df in meta.fields:
		if df.fieldtype in ("Tab Break", "Section Break"):
			rows.append(
				{
					"idx": df.idx,
					"fieldname": df.fieldname,
					"label": df.label,
					"fieldtype": df.fieldtype,
					"insert_after": getattr(df, "insert_after", None),
					"hidden": int(getattr(df, "hidden", 0) or 0),
					"depends_on": getattr(df, "depends_on", None),
				}
			)

	print(json.dumps({"doctype": "Item", "breaks": rows}, indent=2))
	return rows


def item_list_view_summary():
	"""Print Item fields that are currently marked as in_list_view.

	This approximates the default list view columns without relying on user-specific
	List View Settings.
	"""
	frappe.set_user("Administrator")
	meta = frappe.get_meta("Item")
	fields = []
	for df in meta.fields:
		if getattr(df, "in_list_view", 0):
			fields.append(
				{
					"idx": df.idx,
					"fieldname": df.fieldname,
					"label": df.label,
					"fieldtype": df.fieldtype,
					"options": getattr(df, "options", None),
				}
			)
	print(json.dumps({"doctype": "Item", "in_list_view": fields}, indent=2))
	return fields


def item_list_filters_summary():
	"""List Filter records for Item (shared, not per-user)."""
	frappe.set_user("Administrator")
	rows = frappe.get_all(
		"List Filter",
		filters={"reference_doctype": "Item"},
		fields=["name", "filter_name", "filters", "for_user"],
		order_by="modified desc",
		limit=100,
	)
	print(json.dumps({"reference_doctype": "Item", "list_filters": rows}, indent=2))
	return rows


def item_tab_field_summary(tab_fieldnames: list[str] | None = None):
	"""Summarize which fields are currently under each specified Tab Break.

	This is used to decide minimal, safe field moves.
	"""
	frappe.set_user("Administrator")
	meta = frappe.get_meta("Item")
	if not tab_fieldnames:
		tab_fieldnames = [
			"details",
			"purchasing_tab",
			"manufacturing",
			"inventory_section",
			"dashboard_tab",
			"variants_section",
		]

	# Build index lookup
	fields = list(meta.fields)
	pos = {df.fieldname: i for i, df in enumerate(fields) if df.fieldname}

	def slice_for_tab(tab_fn: str):
		start = pos.get(tab_fn)
		if start is None:
			return []
		end = len(fields)
		for i in range(start + 1, len(fields)):
			if fields[i].fieldtype == "Tab Break":
				end = i
				break
			
		rows = []
		for df in fields[start + 1 : end]:
			if not df.fieldname:
				continue
			rows.append(
				{
					"idx": df.idx,
					"fieldname": df.fieldname,
					"fieldtype": df.fieldtype,
					"label": df.label,
					"hidden": int(getattr(df, "hidden", 0) or 0),
					"reqd": int(getattr(df, "reqd", 0) or 0),
				}
			)
		return rows

	out = {tab: slice_for_tab(tab) for tab in tab_fieldnames}
	print(json.dumps({"doctype": "Item", "tabs": out}, indent=2))
	return out


def item_field_props(fieldnames: list[str] | None = None):
	"""Inspect key meta properties for specific Item fields (read-only)."""
	frappe.set_user("Administrator")
	meta = frappe.get_meta("Item")
	if not fieldnames:
		fieldnames = [
			"has_variants",
			"opening_stock",
			"valuation_rate",
			"variants_section",
			"inventory_settings_section",
		]

	pos = {df.fieldname: i for i, df in enumerate(meta.fields) if df.fieldname}
	rows = []
	for fn in fieldnames:
		df = meta.get_field(fn)
		if not df:
			rows.append({"fieldname": fn, "missing": True})
			continue
		rows.append(
			{
				"fieldname": fn,
				"fieldtype": df.fieldtype,
				"idx": getattr(df, "idx", None),
				"insert_after": getattr(df, "insert_after", None),
				"hidden": int(getattr(df, "hidden", 0) or 0),
				"depends_on": getattr(df, "depends_on", None),
				"meta_pos": pos.get(fn),
			}
		)

	print(json.dumps({"doctype": "Item", "fields": rows}, indent=2))
	return rows


def products_console_shortcuts_summary():
	"""Print Products Console shortcut labels and targets (read-only)."""
	frappe.set_user("Administrator")
	ws = frappe.get_doc("Workspace", "Products Console")
	rows = []
	for s in (ws.shortcuts or []):
		rows.append(
			{
				"label": s.label,
				"type": s.type,
				"link_to": s.link_to,
				"doc_view": s.doc_view,
				"report_ref_doctype": s.report_ref_doctype,
			}
		)
	print(json.dumps({"workspace": ws.name, "shortcuts": rows}, indent=2))
	return rows


def desk_entrypoint_capabilities():
	"""Detect if this environment has any standard DocTypes for role-based desk home.

	We do NOT change anything here; this is to avoid guessing when asked to make
	Products Console the default entry point.
	"""
	frappe.set_user("Administrator")
	check_doctypes = [
		"Role Home Page",
		"Homepage",
		"Portal Menu Item",
		"Workspace Settings",
		"List View Settings",
		"Navbar Settings",
	]
	exists = {dt: bool(frappe.db.exists("DocType", dt)) for dt in check_doctypes}
	print(json.dumps({"doctypes": exists}, indent=2, sort_keys=True))
	return exists


def stock_workspaces_summary():
	"""Read-only: list visible Stock-module workspaces and their ordering fields."""
	frappe.set_user("Administrator")
	rows = frappe.get_all(
		"Workspace",
		filters={"module": "Stock", "is_hidden": 0},
		fields=["name", "label", "sequence_id", "public"],
		order_by="sequence_id asc, name asc",
	)
	print(json.dumps({"module": "Stock", "workspaces": rows}, indent=2))
	return rows


def item_tab_content_audit():
	"""Evidence-based audit of Item tab contents from current meta.

	Reports, per approved tab:
	- visible standard fields/sections
	- cm_* structural fields
	- rough usability assessment (heuristic)
	"""
	frappe.set_user("Administrator")
	meta = frappe.get_meta("Item")

	approved_tabs = [
		("General", "details"),
		("Suppliers & Pricing", "purchasing_tab"),
		("Composition", "manufacturing"),
		("Stock", "inventory_section"),
		("Transactions", "dashboard_tab"),
		("Specs", "variants_section"),
	]

	fields = list(meta.fields)
	pos = {df.fieldname: i for i, df in enumerate(fields) if df.fieldname}

	def audit_slice(start_fieldname: str):
		start = pos.get(start_fieldname)
		if start is None:
			return []
		end = len(fields)
		for i in range(start + 1, len(fields)):
			if fields[i].fieldtype == "Tab Break":
				end = i
				break
		rows = []
		for df in fields[start + 1 : end]:
			if not df.fieldname:
				continue
			if df.fieldtype == "Column Break":
				continue
			hidden = int(getattr(df, "hidden", 0) or 0)
			if hidden:
				continue
			rows.append(
				{
					"fieldname": df.fieldname,
					"label": df.label,
					"fieldtype": df.fieldtype,
					"is_cm": bool(df.fieldname.startswith("cm_")),
					"depends_on": getattr(df, "depends_on", None),
					"reqd": int(getattr(df, "reqd", 0) or 0),
				}
			)
		return rows

	def assess(rows):
		# Count content fields (exclude breaks; HTML counts as content)
		input_count = 0
		for r in rows:
			if r["fieldtype"] in ("Section Break",):
				continue
			input_count += 1
		if input_count == 0:
			return "too empty"
		if input_count <= 5:
			return "sparse but acceptable"
		if input_count <= 18:
			return "usable"
		return "too cluttered"

	out = {}
	for tab_label, tab_fieldname in approved_tabs:
		rows = audit_slice(tab_fieldname)
		out[tab_label] = {
			"tab_fieldname": tab_fieldname,
			"rows": rows,
			"cm_structural_fields": [r for r in rows if r["is_cm"]],
			"assessment": assess(rows),
		}

	print(json.dumps({"doctype": "Item", "tabs": out}, indent=2))
	return out


def item_tab_field_dump(include_hidden: bool = True):
	"""Read-only: dump fields under each approved tab.

	When include_hidden=True, includes fields even if hidden in meta; this helps
	understand why a tab might look empty.
	"""
	frappe.set_user("Administrator")
	meta = frappe.get_meta("Item")
	approved_tab_fieldnames = [
		"details",
		"purchasing_tab",
		"manufacturing",
		"inventory_section",
		"dashboard_tab",
		"variants_section",
	]

	fields = list(meta.fields)
	pos = {df.fieldname: i for i, df in enumerate(fields) if df.fieldname}

	out = {}
	for tab_fieldname in approved_tab_fieldnames:
		start = pos.get(tab_fieldname)
		if start is None:
			out[tab_fieldname] = {"error": "tab fieldname not found"}
			continue
		end = len(fields)
		for i in range(start + 1, len(fields)):
			if fields[i].fieldtype == "Tab Break":
				end = i
				break
		rows = []
		for df in fields[start + 1 : end]:
			if not df.fieldname:
				continue
			hidden = int(getattr(df, "hidden", 0) or 0)
			if not include_hidden and hidden:
				continue
			rows.append(
				{
					"fieldname": df.fieldname,
					"label": df.label,
					"fieldtype": df.fieldtype,
					"hidden": hidden,
					"depends_on": getattr(df, "depends_on", None),
					"options": getattr(df, "options", None),
				}
			)
		out[tab_fieldname] = rows

	print(json.dumps({"doctype": "Item", "include_hidden": include_hidden, "tabs": out}, indent=2))
	return out


def transactions_targets_summary():
	"""Read-only: confirm standard DocTypes/Reports exist for Transactions guidance links."""
	frappe.set_user("Administrator")

	def exists(doctype: str, name: str) -> bool:
		if doctype == "Report":
			return bool(frappe.db.exists("Report", name))
		if doctype == "DocType":
			return bool(frappe.db.exists("DocType", name))
		return False

	targets = [
		("Report", "Stock Ledger"),
		("Report", "Stock Balance"),
		("DocType", "Item Price"),
		("DocType", "Purchase Order"),
		("DocType", "Sales Order"),
		("DocType", "Stock Reservation Entry"),
		("DocType", "Stock Entry"),
	]
	out = [{"type": t, "name": n, "exists": exists(t, n)} for t, n in targets]
	print(json.dumps({"targets": out}, indent=2))
	return out
