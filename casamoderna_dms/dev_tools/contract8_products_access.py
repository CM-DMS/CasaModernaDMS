from __future__ import annotations

import json

import frappe


def discover():
	"""Contract 8: read-only discovery of category/image mechanisms + permissions.

	Prints a compact JSON payload so it can be logged and copied into a slice report.
	"""
	frappe.set_user("Administrator")

	item_meta = frappe.get_meta("Item")
	item_group_df = item_meta.get_field("item_group")

	category_like_fields = []
	for df in item_meta.fields:
		key = ((df.fieldname or "") + "::" + (df.label or "")).lower()
		if any(x in key for x in ("category", "categorie", "collection", "group")):
			category_like_fields.append(
				{
					"fieldname": df.fieldname,
					"label": df.label,
					"fieldtype": df.fieldtype,
					"options": getattr(df, "options", None),
					"hidden": int(getattr(df, "hidden", 0) or 0),
				}
			)

	like_doctypes = {}
	for needle in ("Category", "Item Group", "Product"):
		like_doctypes[needle] = frappe.get_all(
			"DocType",
			filters={"name": ["like", "%" + needle + "%"]},
			pluck="name",
			limit=50,
		)

	image_fields = []
	for df in item_meta.fields:
		if df.fieldtype in ("Attach", "Attach Image", "Image") or df.fieldname in ("image", "website_image"):
			image_fields.append(
				{
					"fieldname": df.fieldname,
					"label": df.label,
					"fieldtype": df.fieldtype,
					"options": getattr(df, "options", None),
					"hidden": int(getattr(df, "hidden", 0) or 0),
					"permlevel": int(getattr(df, "permlevel", 0) or 0),
				}
			)

	ps_docs = frappe.get_all(
		"Property Setter",
		filters={
			"doc_type": "Item",
			"field_name": ["in", ["image", "manufacturing", "attributes", "cm_stock_controls_section"]],
		},
		fields=["name", "field_name", "property", "value"],
		order_by="name asc",
	)

	def perms_for(doctype: str):
		rows = []
		rows.extend(
			frappe.get_all(
				"DocPerm",
				filters={"parent": doctype},
				fields=[
					"role",
					"permlevel",
					"read",
					"write",
					"create",
					"delete",
					"submit",
					"cancel",
					"amend",
					"report",
					"export",
					"import",
					"share",
					"print",
					"email",
				],
			)
		)
		if frappe.db.exists("DocType", "Custom DocPerm"):
			rows.extend(
				frappe.get_all(
					"Custom DocPerm",
					filters={"parent": doctype},
					fields=[
						"role",
						"permlevel",
						"read",
						"write",
						"create",
						"delete",
						"submit",
						"cancel",
						"amend",
						"report",
						"export",
						"import",
						"share",
						"print",
						"email",
					],
				)
			)

		dedup = {}
		for r in rows:
			key = (r.get("role"), int(r.get("permlevel") or 0))
			dedup[key] = r
		return sorted(dedup.values(), key=lambda x: (x.get("role") or "", int(x.get("permlevel") or 0)))

	perms = {}
	for dt in ("Item", "Item Group", "File"):
		if frappe.db.exists("DocType", dt):
			perms[dt] = perms_for(dt)

	roles_to_check = [
		"CasaModerna Products Console",
		"CasaModerna Product Maintainer",
		"System Manager",
	]
	roles_present = {r: bool(frappe.db.exists("Role", r)) for r in roles_to_check}

	users_with_products_console_role = []
	if frappe.db.exists("DocType", "Has Role"):
		users_with_products_console_role = frappe.get_all(
			"Has Role",
			filters={"role": "CasaModerna Products Console"},
			pluck="parent",
			limit=200,
		)

	result = {
		"category_mechanism": {
			"item_group_field": {
				"fieldtype": getattr(item_group_df, "fieldtype", None) if item_group_df else None,
				"options": getattr(item_group_df, "options", None) if item_group_df else None,
				"hidden": int(getattr(item_group_df, "hidden", 0) or 0) if item_group_df else None,
			},
			"category_like_fields_sample": category_like_fields[:25],
			"doctype_name_search": like_doctypes,
		},
		"image_mechanism": {
			"item_image_fields": image_fields,
			"item_property_setters": ps_docs,
		},
		"permission_model": {
			"doctypes_present": {"Custom DocPerm": bool(frappe.db.exists("DocType", "Custom DocPerm"))},
			"roles_present": roles_present,
			"users_with_products_console_role_count": len(users_with_products_console_role),
			"perms": perms,
		},
	}

	print(json.dumps(result, indent=2, sort_keys=True))
	return result


def inspect_custom_docperm(parent: str = "Item Group", limit: int = 20):
	"""Contract 8: inspect Custom DocPerm structure + sample records (read-only)."""
	frappe.set_user("Administrator")
	if not frappe.db.exists("DocType", "Custom DocPerm"):
		result = {"Custom DocPerm": False}
		print(json.dumps(result, indent=2, sort_keys=True))
		return result

	meta = frappe.get_meta("Custom DocPerm")
	fields = [
		{
			"fieldname": df.fieldname,
			"fieldtype": df.fieldtype,
			"label": df.label,
			"options": getattr(df, "options", None),
		}
		for df in meta.fields
		if df.fieldname
	]

	records = frappe.get_all(
		"Custom DocPerm",
		filters={"parent": parent},
		fields=["name", "parent", "role", "permlevel", "read", "write", "create", "delete"],
		order_by="role asc, permlevel asc",
		limit=limit,
	)

	result = {
		"Custom DocPerm": True,
		"meta_fields": fields,
		"sample_records": records,
	}
	print(json.dumps(result, indent=2, sort_keys=True))
	return result
