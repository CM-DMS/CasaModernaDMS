"""
Patch: CM Super Admin blanket full access across ALL doctypes.

Upserts a Custom DocPerm row for every non-child, non-virtual doctype so that
CM Super Admin always wins regardless of what standard DocPerm says.
Custom DocPerm takes precedence over standard DocPerm in Frappe's permission
resolution order, making this approach update-safe.
"""
from __future__ import annotations

import frappe


ROLE = "CM Super Admin"

FULL_PERMS = {
	"select": 1,
	"read": 1,
	"write": 1,
	"create": 1,
	"delete": 1,
	"submit": 1,
	"cancel": 1,
	"amend": 1,
	"report": 1,
	"export": 1,
	"import": 1,
	"share": 1,
	"print": 1,
	"email": 1,
}


def _upsert(parent: str) -> str:
	meta = frappe.get_meta("Custom DocPerm")
	valid_fields = {df.fieldname for df in meta.fields}

	existing = frappe.db.get_value(
		"Custom DocPerm",
		{"parent": parent, "role": ROLE, "permlevel": 0},
		"name",
	)

	perms = {k: v for k, v in FULL_PERMS.items() if k in valid_fields}

	if existing:
		for k, v in perms.items():
			frappe.db.set_value("Custom DocPerm", existing, k, v, update_modified=False)
		return existing

	doc = frappe.get_doc(
		{
			"doctype": "Custom DocPerm",
			"parent": parent,
			"parenttype": "DocType",
			"parentfield": "permissions",
			"role": ROLE,
			"permlevel": 0,
			"if_owner": 0,
			**perms,
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def execute():
	frappe.set_user("Administrator")

	if not frappe.db.exists("Role", ROLE):
		return {"skipped": True, "reason": f"Role '{ROLE}' not found"}

	doctypes = frappe.get_all(
		"DocType",
		filters={"istable": 0, "is_virtual": 0},
		fields=["name"],
		limit_page_length=0,
		order_by="name asc",
	)

	results = {"inserted": [], "updated": [], "errors": []}

	for dt in doctypes:
		name = dt["name"]
		try:
			existing_before = frappe.db.get_value(
				"Custom DocPerm",
				{"parent": name, "role": ROLE, "permlevel": 0},
				"name",
			)
			record_name = _upsert(name)
			if existing_before:
				results["updated"].append(name)
			else:
				results["inserted"].append(name)
		except Exception as e:
			results["errors"].append({"doctype": name, "error": str(e)})

	# Clear all permission caches
	frappe.clear_cache()

	return {
		"role": ROLE,
		"total_doctypes": len(doctypes),
		"inserted": len(results["inserted"]),
		"updated": len(results["updated"]),
		"errors": results["errors"],
	}
