import frappe


def execute():
	"""Stabilisation gate: ensure Product Maintainer can create File for attachments.

	Why: Item image upload/replacement requires File create permission.
	"""
	frappe.set_user("Administrator")

	# Upsert by logical key (parent+role+permlevel) to avoid creating duplicates.
	parent = "File"
	role = "CasaModerna Product Maintainer"
	permlevel = 0

	existing = frappe.get_all(
		"Custom DocPerm",
		filters={"parent": parent, "role": role, "permlevel": permlevel},
		fields=["name"],
		order_by="name asc",
		limit=1,
	)
	if existing:
		doc = frappe.get_doc("Custom DocPerm", existing[0]["name"])
	else:
		name = "cm_pm_file_0"
		doc = frappe.new_doc("Custom DocPerm")
		doc.name = name
		doc.parent = parent
		doc.parenttype = "DocType"
		doc.parentfield = "permissions"
		doc.role = role
		doc.permlevel = permlevel
		doc.if_owner = 0

	# Minimal, safe grants: allow create/read to upload attachments.
	doc.select = 1
	doc.read = 1
	doc.create = 1
	doc.write = 0
	doc.delete = 0
	doc.submit = 0
	doc.cancel = 0
	doc.amend = 0
	# Keep other flags as-is if present.

	if doc.is_new():
		doc.insert(ignore_permissions=True)
	else:
		doc.save(ignore_permissions=True)

	frappe.clear_cache(doctype="File")
