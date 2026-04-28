from __future__ import annotations

import json

import frappe


SUPPLIER_RELATED_DOCTYPES = [
	"Supplier",
	"Supplier Group",
	"Contact",
	"Address",
	"Bank Account",
]


def _doctype_summary(dt: str) -> dict:
	meta = frappe.get_meta(dt)
	fields = []
	for df in meta.fields:
		fields.append(
			{
				"fieldname": df.fieldname,
				"fieldtype": df.fieldtype,
				"label": df.label,
				"options": getattr(df, "options", None),
				"reqd": int(getattr(df, "reqd", 0) or 0),
				"hidden": int(getattr(df, "hidden", 0) or 0),
				"read_only": int(getattr(df, "read_only", 0) or 0),
				"in_list_view": int(getattr(df, "in_list_view", 0) or 0),
				"insert_after": getattr(df, "insert_after", None),
			}
		)
	return {
		"doctype": dt,
		"title_field": getattr(meta, "title_field", None),
		"search_fields": getattr(meta, "search_fields", None),
		"autoname": getattr(meta, "autoname", None),
		"fields": fields,
	}


def _docperm_rows(dt: str) -> list[dict]:
	return frappe.get_all(
		"DocPerm",
		filters={"parent": dt},
		fields=[
			"name",
			"parent",
			"role",
			"permlevel",
			"read",
			"write",
			"create",
			"delete",
			"submit",
			"cancel",
			"amend",
		],
		order_by="role asc, permlevel asc, name asc",
	)


def _custom_docperm_rows(dt: str) -> list[dict]:
	if not frappe.db.exists("DocType", "Custom DocPerm"):
		return []
	return frappe.get_all(
		"Custom DocPerm",
		filters={"parent": dt},
		fields=[
			"name",
			"parent",
			"role",
			"permlevel",
			"read",
			"write",
			"create",
			"delete",
			"submit",
			"cancel",
			"amend",
		],
		order_by="role asc, permlevel asc, name asc",
		limit_page_length=0,
	)


def _supplier_dynamic_links_sample(limit: int = 20) -> dict:
	"""Evidence: how Contact/Address link to Supplier via Dynamic Link."""
	out: dict = {"contact_links": [], "address_links": []}
	if frappe.db.exists("DocType", "Dynamic Link"):
		out["contact_links"] = frappe.get_all(
			"Dynamic Link",
			filters={"link_doctype": "Supplier", "parenttype": "Contact"},
			fields=["parent", "link_name", "link_doctype"],
			limit=limit,
			order_by="modified desc",
		)
		out["address_links"] = frappe.get_all(
			"Dynamic Link",
			filters={"link_doctype": "Supplier", "parenttype": "Address"},
			fields=["parent", "link_name", "link_doctype"],
			limit=limit,
			order_by="modified desc",
		)
	return out


def audit() -> dict:
	frappe.set_user("Administrator")

	meta = {dt: _doctype_summary(dt) for dt in SUPPLIER_RELATED_DOCTYPES if frappe.db.exists("DocType", dt)}

	# List filters / workspace evidence
	list_filters = frappe.get_all(
		"List Filter",
		filters={"reference_doctype": "Supplier"},
		fields=["name", "reference_doctype", "filters", "modified", "owner"],
		order_by="name asc",
		limit_page_length=0,
	)
	workspaces = frappe.get_all(
		"Workspace",
		filters={"name": ["like", "%Supplier%"]},
		fields=["name", "module", "public", "modified"],
		order_by="name asc",
	)

	# Permissions snapshot
	docperms = {dt: _docperm_rows(dt) for dt in SUPPLIER_RELATED_DOCTYPES if frappe.db.exists("DocType", dt)}
	custom_docperms = {dt: _custom_docperm_rows(dt) for dt in SUPPLIER_RELATED_DOCTYPES if frappe.db.exists("DocType", dt)}

	# Payment/banking linkage evidence: presence of likely fields
	bank_link_fields = {}
	if frappe.db.exists("DocType", "Supplier"):
		supplier_meta = frappe.get_meta("Supplier")
		for fn in [
			"payment_terms",
			"payment_terms_template",
			"default_bank_account",
			"default_payment_mode",
			"mode_of_payment",
			"tax_id",
			"supplier_name",
			"supplier_group",
			"supplier_type",
			"website",
			"disabled",
		]:
			bank_link_fields[fn] = bool(supplier_meta.get_field(fn))

	return {
		"site": frappe.local.site,
		"doctypes": SUPPLIER_RELATED_DOCTYPES,
		"meta": meta,
		"dynamic_links_sample": _supplier_dynamic_links_sample(),
		"list_filters_supplier": list_filters,
		"workspaces_like_supplier": workspaces,
		"docperms": docperms,
		"custom_docperms": custom_docperms,
		"supplier_field_presence": bank_link_fields,
	}


def run() -> dict:
	res = audit()
	print(json.dumps(res, indent=2, ensure_ascii=False, default=str))
	return res
