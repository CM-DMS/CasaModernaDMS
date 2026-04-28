from __future__ import annotations

from typing import Any

import frappe


SCOPE_DOCTYPES = [
	"Supplier",
	"Supplier Group",
	"Contact",
	"Address",
	"Bank Account",
]

PERM_FIELDS = ["read", "write", "create", "delete", "submit", "cancel", "amend"]


def _ensure_docperm(parent: str, role: str, permlevel: int, perms: dict[str, int]) -> dict[str, Any]:
	"""Upsert a standard DocPerm row for (parent doctype, role, permlevel).

	Implementation detail: do NOT `save()` the parent DocType.
	Some environments may have legacy DocType.permissions rows pointing at
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
			frappe.db.set_value("DocPerm", name, k, v, update_modified=False)
		return {"doctype": parent, "role": role, "permlevel": permlevel, "perms": values, "action": "updated"}

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
		frappe.delete_doc("Custom DocPerm", r["name"], ignore_permissions=True, force=True)

	return {"deleted": len(rows), "names": [r["name"] for r in rows], "keys": rows}


def execute():
	"""Suppliers Contract: DocPerm-only governance for supplier-related doctypes.

	- Removes any Custom DocPerm shadow layer for Supplier/Supplier Group/Contact/Address/Bank Account.
	- Ensures CasaModerna supplier roles + CM Super Admin have standard DocPerm entries.
	"""
	frappe.set_user("Administrator")

	docperm_changes: list[dict[str, Any]] = []

	# Suppliers Console: read-only visibility across supplier profile.
	if frappe.db.exists("Role", "CasaModerna Suppliers Console"):
		for dt in ["Supplier", "Supplier Group", "Contact", "Address", "Bank Account"]:
			if frappe.db.exists("DocType", dt):
				docperm_changes.append(_ensure_docperm(dt, "CasaModerna Suppliers Console", 0, {"read": 1}))

	# Supplier Maintainer: maintain supplier master + manage contact/address; bank account is read-only for lookup.
	if frappe.db.exists("Role", "CasaModerna Supplier Maintainer"):
		for dt in ["Supplier", "Supplier Group"]:
			if frappe.db.exists("DocType", dt):
				docperm_changes.append(
					_ensure_docperm(dt, "CasaModerna Supplier Maintainer", 0, {"read": 1, "write": 1, "create": 1, "delete": 0})
				)
		for dt in ["Contact", "Address"]:
			if frappe.db.exists("DocType", dt):
				docperm_changes.append(
					_ensure_docperm(dt, "CasaModerna Supplier Maintainer", 0, {"read": 1, "write": 1, "create": 1, "delete": 0})
				)
		if frappe.db.exists("DocType", "Bank Account"):
			docperm_changes.append(_ensure_docperm("Bank Account", "CasaModerna Supplier Maintainer", 0, {"read": 1}))

	# CM Super Admin: operational recovery.
	if frappe.db.exists("Role", "CM Super Admin"):
		for dt in SCOPE_DOCTYPES:
			if frappe.db.exists("DocType", dt):
				docperm_changes.append(
					_ensure_docperm(
						dt,
						"CM Super Admin",
						0,
						{"read": 1, "write": 1, "create": 1, "delete": 1, "submit": 1, "cancel": 1, "amend": 1},
					)
				)

	deleted = _delete_custom_docperms_for_parents(SCOPE_DOCTYPES)

	for dt in SCOPE_DOCTYPES:
		try:
			frappe.clear_cache(doctype=dt)
		except Exception:
			pass
	frappe.clear_cache()

	return {"docperm_changes": docperm_changes, "custom_docperm_deleted": deleted}
