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
	"""Corrective rebuild: enforce a V1-like commercial ladder flow on Item > Suppliers & Pricing.

	This is a deterministic layout patch (field_order), not a schema change.
	"""
	frappe.clear_cache(doctype="Item")
	meta = frappe.get_meta("Item")
	fields_by_name = {df.fieldname: df for df in meta.fields if getattr(df, "fieldname", None)}
	order = [df.fieldname for df in meta.fields if getattr(df, "fieldname", None)]

	tab = "purchasing_tab"
	if tab not in order:
		return

	start = order.index(tab)
	end = len(order)
	for i in range(start + 1, len(order)):
		df = fields_by_name.get(order[i])
		if df and df.fieldtype == "Tab Break":
			end = i
			break

	desired = [
		tab,
		"cm_suppliers_pricing_section",
		"cm_supplier_name",
		"cm_supplier_code",
		"cm_supplier_variant_description",
		"cm_supplier_item_code",
		"cm_supplier_item_name",
		"cm_supplier_currency",
		"cm_supplier_pack",
		"purchase_uom",
		"cm_suppliers_col_break",
		"lead_time_days",
		"cm_supplier_price_pipeline_section",
		"cm_supplier_price_pipeline_banner",
		"cm_pricing_ops_help",
		"cm_pricing_inputs_section",
		"cm_inputs_missing_steps_help",
		"cm_supplier_list_price_ex_vat",
		"cm_increase_before_percent",
		"cm_discount_1_percent",
		"cm_discount_2_percent",
		"cm_discount_3_percent",
		"cm_increase_after_percent",
		"cm_cost_ex_vat",
		"cm_pricing_mode_ui",
		"cm_discount_target_percent",
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
		"cm_pricing_outputs_section",
		"cm_rrp_ex_vat",
		"cm_rrp_inc_vat",
		"cm_discounted_inc_vat",
		"cm_final_offer_inc_vat",
		"cm_final_offer_ex_vat",
		"cm_rounding_delta",
		"cm_discount_percent",
		"cm_profit_ex_vat",
		"cm_margin_percent",
		"cm_markup_percent",
		"cm_erpnext_purchase_controls_section",
	]

	# The Supplier Items table is standard ERPNext; keep it in the low-priority section.
	if "supplier_items" in order:
		desired.append("supplier_items")

	current_tab_range = order[start:end]
	desired_present = [f for f in desired if f in order]
	leftovers = [f for f in current_tab_range if f not in desired_present]
	new_range = desired_present + leftovers

	order = order[:start] + new_range + order[end:]
	_upsert_doctype_field_order_property_setter("Item", order, module="Stock")
	frappe.clear_cache(doctype="Item")
