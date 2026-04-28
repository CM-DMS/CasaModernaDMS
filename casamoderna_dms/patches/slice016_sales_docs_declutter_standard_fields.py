from __future__ import annotations

import frappe


STRUCTURAL_FIELDTYPES = {
	"Section Break",
	"Tab Break",
	"Column Break",
	"HTML",
	"Fold",
	"Heading",
	"Button",
	"Table",
	"Table MultiSelect",
}


def _upsert_docfield_prop(dt: str, fieldname: str, prop: str, prop_type: str, value) -> None:
	name = f"{dt}-{fieldname}-{prop}"
	if frappe.db.exists("Property Setter", name):
		ps = frappe.get_doc("Property Setter", name)
		ps.value = str(value)
		ps.property_type = prop_type
		ps.save(ignore_permissions=True)
		return

	ps = frappe.new_doc("Property Setter")
	ps.doctype_or_field = "DocField"
	ps.doc_type = dt
	ps.field_name = fieldname
	ps.property = prop
	ps.property_type = prop_type
	ps.value = str(value)
	ps.insert(ignore_permissions=True)


def _hide_field_if_safe(dt: str, meta, fieldname: str) -> None:
	df = meta.get_field(fieldname)
	if not df:
		return
	if getattr(df, "fieldtype", None) in STRUCTURAL_FIELDTYPES:
		return
	# Never hide CasaModerna fields.
	if fieldname.startswith("cm_"):
		return
	# Avoid hiding required fields.
	if int(getattr(df, "reqd", 0) or 0) == 1:
		return
	# Avoid hiding fields that may become mandatory via dynamic rules.
	if (getattr(df, "mandatory_depends_on", None) or "").strip():
		return

	_upsert_docfield_prop(dt, fieldname, "hidden", "Check", 1)


def _apply_declutter(dt: str, keep_fields: set[str], always_hide: set[str]) -> dict:
	meta = frappe.get_meta(dt)
	present = {df.fieldname for df in meta.fields if getattr(df, "fieldname", None)}

	hidden = []
	skipped_required = []

	# 1) Always-hide: known clutter fields.
	for fn in sorted(always_hide):
		if fn not in present:
			continue
		df = meta.get_field(fn)
		if df and int(getattr(df, "reqd", 0) or 0) == 1:
			skipped_required.append(fn)
			continue
		_hide_field_if_safe(dt, meta, fn)
		hidden.append(fn)

	# 2) Hide any other visible standard fields not in keep_fields.
	for df in meta.fields:
		fn = getattr(df, "fieldname", None)
		if not fn:
			continue
		if fn in keep_fields:
			continue
		if fn.startswith("cm_"):
			continue
		if getattr(df, "fieldtype", None) in STRUCTURAL_FIELDTYPES:
			continue
		if int(getattr(df, "hidden", 0) or 0) == 1:
			continue
		if int(getattr(df, "reqd", 0) or 0) == 1:
			skipped_required.append(fn)
			continue
		if (getattr(df, "mandatory_depends_on", None) or "").strip():
			continue
		_hide_field_if_safe(dt, meta, fn)
		hidden.append(fn)

	return {"doctype": dt, "hidden_count": len(set(hidden)), "skipped_required": sorted(set(skipped_required))}


def execute():
	"""Slice 016: Sales docs declutter — hide unused ERPNext standard fields.

	Constraints:
	- UI-only (Property Setters on DocFields)
	- No business logic/workflow/numbering changes
	- No permission/DocPerm changes
	
	Goal:
	- Reduce clutter by hiding non-required standard inputs not used in CasaModerna flow,
	  keeping only the basic working surface (Customer + Doc Info/Notes + Products + Totals/Attachments).
	"""
	frappe.set_user("Administrator")

	# Fields we intentionally keep visible per doctype.
	keep_common = {
		"customer",
		"customer_name",
		"transaction_date",
		"posting_date",
		"due_date",
		"delivery_date",
		"valid_till",
		"items",
		"taxes",
		"taxes_and_charges",
		"total",
		"net_total",
		"total_taxes_and_charges",
		"grand_total",
		"rounded_total",
		"rounding_adjustment",
		"discount_amount",
		"additional_discount_percentage",
		"apply_discount_on",
		"notes",
		"terms",
		"terms_and_conditions",
		"tc_name",
		"contact_person",
		"contact_display",
		"customer_address",
		"address_display",
		"territory",
		"shipping_address_name",
		"shipping_address",
		"company",
		"company_address",
		"company_contact_person",
		"po_no",
		"po_date",
		"sales_person",
		"sales_person_name",
		"sales_partner",
		"remarks",
		"is_return",
		"return_against",
	}

	# Always-hide fields across doctypes when present.
	always_hide_common = {
		"naming_series",
		"amended_from",
		"scan_barcode",
		"last_scanned_warehouse",
		"set_warehouse",
		"set_target_warehouse",
		"ignore_pricing_rule",
		"conversion_rate",
		"price_list_currency",
		"plc_conversion_rate",
		"base_total",
		"base_net_total",
		"base_total_taxes_and_charges",
		"base_grand_total",
		"base_rounded_total",
		"base_rounding_adjustment",
		"base_in_words",
		"in_words",
		"tax_category",
		"shipping_rule",
		"incoterm",
		"named_place",
		"set_posting_time",
		"posting_time",
		"project",
		"cost_center",
		"tax_id",
	}

	results = []

	# Quotation
	results.append(
		_apply_declutter(
			"Quotation",
			keep_fields=set(keep_common)
			| {
				"quotation_to",
				"party_name",
				"order_type",
				"selling_price_list",
				"currency",
				"total_qty",
				"total_net_weight",
			},
			always_hide=always_hide_common,
		)
	)

	# Sales Order
	results.append(
		_apply_declutter(
			"Sales Order",
			keep_fields=set(keep_common)
			| {
				"order_type",
				"selling_price_list",
				"currency",
				"workflow_state",
				"status",
				"skip_delivery_note",
				"reserve_stock",
				"total_qty",
				"total_net_weight",
			},
			always_hide=always_hide_common,
		)
	)

	# Delivery Note
	results.append(
		_apply_declutter(
			"Delivery Note",
			keep_fields=set(keep_common)
			| {
				"selling_price_list",
				"currency",
				"total_qty",
				"total_net_weight",
				"issue_credit_note",
			},
			always_hide=always_hide_common,
		)
	)

	# Sales Invoice
	results.append(
		_apply_declutter(
			"Sales Invoice",
			keep_fields=set(keep_common)
			| {
				"selling_price_list",
				"currency",
				"update_stock",
				"company_tax_id",
				"is_pos",
				"pos_profile",
				"is_debit_note",
				"update_outstanding_for_self",
				"update_billed_amount_in_sales_order",
				"update_billed_amount_in_delivery_note",
				"total_qty",
				"total_net_weight",
			},
			always_hide=always_hide_common
			| {
				"is_consolidated",
			},
		)
	)

	# POS Invoice
	results.append(
		_apply_declutter(
			"POS Invoice",
			keep_fields=set(keep_common)
			| {
				"selling_price_list",
				"currency",
				"pos_profile",
				"is_pos",
				"consolidated_invoice",
				"update_billed_amount_in_sales_order",
				"update_billed_amount_in_delivery_note",
				"total_billing_amount",
				"paid_amount",
				"change_amount",
				"total_qty",
				"total_net_weight",
			},
			always_hide=always_hide_common,
		)
	)

	# CM Proforma
	results.append(
		_apply_declutter(
			"CM Proforma",
			keep_fields={
				"quotation",
				"sales_order",
				"customer",
				"customer_name",
				"currency",
				"customer_address",
				"shipping_address_name",
				"contact_person",
				"net_total",
				"total_taxes_and_charges",
				"grand_total",
				"rounded_total",
				"notes",
			},
			always_hide={"naming_series"},
		)
	)

	frappe.clear_cache()
	frappe.logger("casamoderna_dms").info({"slice": "016", "patch": __name__, "results": results})
