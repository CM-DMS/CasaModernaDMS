from __future__ import annotations

from typing import Any

import frappe


SCOPE_DOCTYPES = [
	"Item",
	"Item Group",
	"Company",
	"Customer",
	"Quotation",
	"Sales Order",
	"Delivery Note",
	"Sales Invoice",
	"File",
	"Workspace",
	"List Filter",
	"Print Format",
]

PERM_FIELDS = ["read", "write", "create", "delete", "submit", "cancel", "amend"]


def _ensure_docperm(parent: str, role: str, permlevel: int, perms: dict[str, int]) -> dict[str, Any]:
	"""Upsert a standard DocPerm row for (parent doctype, role, permlevel).

	Implementation detail: do NOT `save()` the parent DocType.
	Some environments may have broken legacy DocType.permissions rows pointing at
	deleted Roles; saving the DocType triggers link validation and will fail.
	"""
	permlevel = int(permlevel)
	meta = frappe.get_meta("DocPerm")

	def has_field(fieldname: str) -> bool:
		return bool(meta.has_field(fieldname))

	name = frappe.db.get_value("DocPerm", {"parent": parent, "role": role, "permlevel": permlevel}, "name")
	values = {f: int(perms.get(f, 0) or 0) for f in PERM_FIELDS}
	if has_field("select"):
		values["select"] = 1 if any(values.values()) else 0

	if name:
		for k, v in values.items():
			# db_set avoids touching/saving the parent DocType.
			frappe.db.set_value("DocPerm", name, k, v, update_modified=False)
		return {"doctype": parent, "role": role, "permlevel": permlevel, "perms": values, "action": "updated"}

	# Insert new DocPerm row as a child of the target DocType.
	doc = {
		"doctype": "DocPerm",
		"parent": parent,
		"parenttype": "DocType",
		"parentfield": "permissions",
		"role": role,
		"permlevel": permlevel,
	}
	doc.update(values)
	ins = frappe.get_doc(doc)
	ins.insert(ignore_permissions=True)
	return {"doctype": parent, "role": role, "permlevel": permlevel, "perms": values, "action": "inserted"}


def _delete_custom_docperms_for_parents(parents: list[str]) -> dict[str, Any]:
	if not frappe.db.exists("DocType", "Custom DocPerm"):
		return {"deleted": 0, "names": []}

	rows = frappe.get_all(
		"Custom DocPerm",
		filters={"parent": ["in", parents]},
		fields=["name", "parent", "role", "permlevel"],
		order_by="parent asc, role asc, permlevel asc, name asc",
		limit_page_length=0,
	)

	for r in rows:
		# Hard delete is safe here: we are removing a shadow layer, not core DocPerm.
		frappe.delete_doc("Custom DocPerm", r["name"], ignore_permissions=True, force=True)

	return {"deleted": len(rows), "names": [r["name"] for r in rows], "keys": rows}


def execute():
	"""Contract 17: remove Custom DocPerm shadowing and make standard DocPerm the only controller.

	Principle: preserve intended access while removing the parallel Custom DocPerm layer.
	"""
	frappe.set_user("Administrator")

	# Desired CasaModerna role permissions expressed as standard DocPerm.
	# NOTE: These are intentionally minimal and match existing Custom DocPerm intent.
	docperm_changes: list[dict[str, Any]] = []

	# Products Console: read-only catalog + categories
	if frappe.db.exists("Role", "CasaModerna Products Console"):
		docperm_changes.append(_ensure_docperm("Item", "CasaModerna Products Console", 0, {"read": 1}))
		docperm_changes.append(_ensure_docperm("Item Group", "CasaModerna Products Console", 0, {"read": 1}))

	# Product Maintainer: write existing Item (no create), manage Item Group, and support attachments.
	if frappe.db.exists("Role", "CasaModerna Product Maintainer"):
		docperm_changes.append(_ensure_docperm("Item", "CasaModerna Product Maintainer", 0, {"read": 1, "write": 1, "create": 0, "delete": 0}))
		docperm_changes.append(_ensure_docperm("Item Group", "CasaModerna Product Maintainer", 0, {"read": 1, "write": 1, "create": 1, "delete": 0}))
		# File: keep environment stable; grant explicit create/read (even though File often has All).
		if frappe.db.exists("DocType", "File"):
			docperm_changes.append(_ensure_docperm("File", "CasaModerna Product Maintainer", 0, {"read": 1, "create": 1}))

	# Sales Console: allow draft selling work + customer creation.
	if frappe.db.exists("Role", "CasaModerna Sales Console"):
		docperm_changes.append(_ensure_docperm("Company", "CasaModerna Sales Console", 0, {"read": 1}))
		docperm_changes.append(_ensure_docperm("Item", "CasaModerna Sales Console", 0, {"read": 1}))
		docperm_changes.append(_ensure_docperm("Item Group", "CasaModerna Sales Console", 0, {"read": 1}))
		docperm_changes.append(_ensure_docperm("Customer", "CasaModerna Sales Console", 0, {"read": 1, "write": 1, "create": 1}))
		docperm_changes.append(_ensure_docperm("Quotation", "CasaModerna Sales Console", 0, {"read": 1, "write": 1, "create": 1, "submit": 1}))
		docperm_changes.append(_ensure_docperm("Sales Order", "CasaModerna Sales Console", 0, {"read": 1, "write": 1, "create": 1, "submit": 1}))
		# Visibility only (derived-only enforcement is handled by server-side validation).
		docperm_changes.append(_ensure_docperm("Delivery Note", "CasaModerna Sales Console", 0, {"read": 1}))
		docperm_changes.append(_ensure_docperm("Sales Invoice", "CasaModerna Sales Console", 0, {"read": 1}))

	# CM Super Admin: must retain full access for operational recovery (as required by stabilisation gate).
	if frappe.db.exists("Role", "CM Super Admin"):
		for dt in [
			"Item",
			"Item Group",
			"Customer",
			"Quotation",
			"Sales Order",
			"Delivery Note",
			"Sales Invoice",
			"File",
			"Company",
			"Workspace",
			"List Filter",
			"Print Format",
		]:
			if frappe.db.exists("DocType", dt):
				docperm_changes.append(
					_ensure_docperm(
						dt,
						"CM Super Admin",
						0,
						{"read": 1, "write": 1, "create": 1, "delete": 1, "submit": 1, "cancel": 1, "amend": 1},
					)
				)

	# Remove shadow layer for scoped doctypes.
	deleted = _delete_custom_docperms_for_parents(SCOPE_DOCTYPES)

	# Clear cache for affected doctypes
	for dt in SCOPE_DOCTYPES:
		try:
			frappe.clear_cache(doctype=dt)
		except Exception:
			pass
	frappe.clear_cache()

	return {"docperm_changes": docperm_changes, "custom_docperm_deleted": deleted}
