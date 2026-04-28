from __future__ import annotations

import json
from decimal import Decimal

import frappe


def inspect():
	"""Contract 13 Phase A inspector.

	Prints *live* findings about how Item pricing currently flows into:
	- Quotation / Quotation Item
	- Sales Order / Sales Order Item

	This is intentionally read-only.
	"""
	frappe.set_user("Administrator")

	result: dict[str, object] = {
		"sitesafe": True,
		"doctypes": {},
		"client_scripts": {},
		"print_formats": {},
		"sample": {},
		"get_item_details": {},
	}

	for parent_dt in ["Quotation", "Sales Order"]:
		meta = frappe.get_meta(parent_dt)
		items_df = meta.get_field("items")
		child_dt = getattr(items_df, "options", None) if items_df else None
		result["doctypes"][parent_dt] = {
			"items_child_doctype": child_dt,
			"items_fieldtype": getattr(items_df, "fieldtype", None) if items_df else None,
		}

		if child_dt:
			child_meta = frappe.get_meta(child_dt)
			key_fields = [
				"item_code",
				"item_name",
				"qty",
				"uom",
				"rate",
				"price_list_rate",
				"discount_percentage",
				"discount_amount",
				"amount",
				"net_rate",
				"net_amount",
			]
			child_fields = {fn: (child_meta.get_field(fn).fieldtype if child_meta.get_field(fn) else None) for fn in key_fields}
			result["doctypes"][parent_dt]["row_key_fields"] = child_fields

			# Check whether any cm_* fields exist already on the row doctype.
			cm_fields = [df.fieldname for df in child_meta.fields if (df.fieldname or "").startswith("cm_")]
			result["doctypes"][parent_dt]["row_cm_fields"] = sorted(cm_fields)

	# Client scripts bound to these doctypes (if any)
	for dt in ["Quotation", "Sales Order"]:
		names = frappe.get_all("Client Script", filters={"dt": dt}, pluck="name")
		result["client_scripts"][dt] = names

	# Print formats - check discount token usage for CasaModerna print formats
	for pf in ["CasaModerna Quotation", "CasaModerna Sales Order"]:
		if frappe.db.exists("Print Format", pf):
			doc = frappe.get_doc("Print Format", pf)
			html = doc.html or ""
			result["print_formats"][pf] = {
				"exists": True,
				"disabled": int(getattr(doc, "disabled", 0) or 0),
				"has_row_discount_percentage": "row.discount_percentage" in html,
				"has_cm_effective_discount": "cm_effective_discount" in html,
			}
		else:
			result["print_formats"][pf] = {"exists": False}

	# Sample Item selection for inspection
	# Prefer an Item that already has CM pricing inputs populated.
	sample_item = frappe.get_all(
		"Item",
		filters={"cm_rrp_ex_vat": ["is", "set"]},
		fields=["name", "cm_rrp_ex_vat", "cm_discount_target_percent", "cm_discount_percent", "cm_pricing_rounding_mode"],
		limit=1,
	)
	if not sample_item:
		# Fall back to any non-disabled Item so we can still inspect the *current* ERPNext flow.
		sample_item = frappe.get_all(
			"Item",
			filters={"disabled": 0},
			fields=["name", "cm_rrp_ex_vat", "cm_discount_target_percent", "cm_discount_percent", "cm_pricing_rounding_mode"],
			limit=1,
		)

	result["sample"]["item_found"] = bool(sample_item)
	if sample_item:
		it = sample_item[0]
		result["sample"]["item"] = it

		# Try to simulate ERPNext item fetch logic for both doctypes
		try:
			from erpnext.stock.get_item_details import get_item_details

			default_company = frappe.db.get_single_value("Global Defaults", "default_company")
			selling_price_list = frappe.db.get_single_value("Selling Settings", "selling_price_list")

			for dt in ["Quotation", "Sales Order"]:
				args = {
					"doctype": dt,
					"item_code": it["name"],
					"company": default_company,
					"conversion_rate": 1,
					"price_list": selling_price_list,
					"selling_price_list": selling_price_list,
					"qty": 1,
					"uom": None,
				}
				details = get_item_details(args)
				result["get_item_details"][dt] = {
					"price_list_rate": details.get("price_list_rate"),
					"rate": details.get("rate"),
					"discount_percentage": details.get("discount_percentage"),
					"amount": details.get("amount"),
					"net_rate": details.get("net_rate"),
					"net_amount": details.get("net_amount"),
				}
		except Exception as e:
			result["get_item_details_error"] = repr(e)

	print(json.dumps(result, indent=2, sort_keys=True, default=str))
	return result
