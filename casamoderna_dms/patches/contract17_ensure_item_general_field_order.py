import json

import frappe


def _upsert_doctype_field_order_property_setter(doctype: str, field_order: list[str], module: str | None = None):
	value = json.dumps(field_order)
	name = f"{doctype}-field_order"

	if frappe.db.exists("Property Setter", name):
		ps = frappe.get_doc("Property Setter", name)
		ps.value = value
		ps.save(ignore_permissions=True)
		return

	ps = frappe.new_doc("Property Setter")
	ps.doctype_or_field = "DocType"
	ps.doc_type = doctype
	ps.property = "field_order"
	ps.property_type = "Text"
	ps.value = value
	ps.module = module or "Stock"
	ps.insert(ignore_permissions=True)


def execute():
	"""Contract 17: enforce V1-like General tab layout on Item.

	Why: `insert_after` on standard fields is not reliably reflected in the runtime
	meta sequence; `field_order` is the canonical safe way to enforce ordering.

	Target overview:
	- Left: large Image
	- Right: compact identity/details + pricing summary
	- Bottom: attachments panel
	- Low priority: admin/system fields under a collapsed section
	"""
	frappe.clear_cache(doctype="Item")
	meta = frappe.get_meta("Item")
	order = [df.fieldname for df in meta.fields if getattr(df, "fieldname", None)]

	# Required anchors (custom fields created via fixtures)
	required = [
		"details",
		"cm_general_identity_section",
		"cm_general_meta_panel",
		"cm_general_pricing_summary",
		"cm_general_attachments_section",
		"cm_general_attachments_panel",
		"cm_general_admin_section",
	]
	if any(r not in order for r in required):
		# Fixtures may not have been imported yet; fail softly.
		return

	def present(fields: list[str]) -> list[str]:
		return [f for f in fields if f in order]

	# Overview: left image, then right details.
	overview = present(
		[
			"cm_general_identity_section",
			"image",
			"column_break0",
			"item_code",
			"item_name",
			"cm_given_name",
			"cm_description_line_1",
			"cm_description_line_2",
			"brand",
			"item_group",
			"stock_uom",
			"cm_general_meta_panel",
			"cm_general_pricing_summary",
		]
	)

	attachments = present(["cm_general_attachments_section", "cm_general_attachments_panel"])

	admin = present(
		[
			"cm_general_admin_section",
			"section_break_11",
			"description",
			"unit_of_measure_conversion",
			"uoms",
			"disabled",
			"allow_alternative_item",
			"is_stock_item",
			"has_variants",
			"opening_stock",
			"valuation_rate",
			"standard_rate",
			"is_fixed_asset",
			"auto_create_assets",
			"is_grouped_asset",
			"asset_category",
			"asset_naming_series",
			"over_delivery_receipt_allowance",
			"over_billing_allowance",
		]
	)

	# Remove existing occurrences of our arranged fields.
	arranged = set(overview + attachments + admin)
	order = [f for f in order if f not in arranged]

	# Insert our layout right after the `details` tab break.
	insert_after = "details"
	if insert_after in order:
		at = order.index(insert_after) + 1
	else:
		# Fallback: place at start.
		at = 0

	for i, f in enumerate(overview + attachments + admin):
		order.insert(at + i, f)

	_upsert_doctype_field_order_property_setter("Item", order, module="Stock")
	frappe.clear_cache(doctype="Item")
