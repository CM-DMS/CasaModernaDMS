from __future__ import annotations

from collections import defaultdict
import os

import frappe


SCOPE_DOCTYPES = [
	"Item",
	"Item Group",
	"File",
	"Quotation",
	"Sales Order",
	"Quotation Item",
	"Sales Order Item",
	"Workspace",
	"List Filter",
	"Print Format",
	"Company",
	"Customer",
	"Delivery Note",
	"Sales Invoice",
]

PERM_FIELDS = ["read", "write", "create", "delete", "submit", "cancel", "amend"]


def _rows_by_parent(rows: list[dict]) -> dict[str, list[dict]]:
	out: dict[str, list[dict]] = defaultdict(list)
	for r in rows:
		p = r.get("parent")
		if not p:
			continue
		out[p].append(r)
	return {k: v for k, v in sorted(out.items())}


def _summarize(rows: list[dict]) -> list[dict]:
	"""Reduce DocPerm/Custom DocPerm rows to per-(role, permlevel) rights."""
	dedup: dict[tuple[str, int], dict] = {}
	for r in rows:
		role = (r.get("role") or "").strip() or "<none>"
		pl = int(r.get("permlevel") or 0)
		key = (role, pl)
		entry = dedup.get(key) or {"role": role, "permlevel": pl}
		for f in PERM_FIELDS:
			entry[f] = max(int(entry.get(f) or 0), int(r.get(f) or 0))
		dedup[key] = entry
	return sorted(dedup.values(), key=lambda x: (x.get("role") or "", int(x.get("permlevel") or 0)))


def inventory() -> dict:
	"""Contract 17 inventory: permission layers impacting scoped doctypes."""
	frappe.set_user("Administrator")

	# Standard DocPerm
	docperms = frappe.get_all(
		"DocPerm",
		filters={"parent": ["in", SCOPE_DOCTYPES]},
		fields=["name", "parent", "role", "permlevel", *PERM_FIELDS],
		order_by="parent asc, role asc, permlevel asc, name asc",
	)

	# Custom DocPerm (shadow layer)
	custom_docperms_all = []
	custom_docperms_scoped = []
	if frappe.db.exists("DocType", "Custom DocPerm"):
		custom_docperms_all = frappe.get_all(
			"Custom DocPerm",
			fields=["name", "parent", "role", "permlevel", *PERM_FIELDS],
			order_by="parent asc, role asc, permlevel asc, name asc",
			limit_page_length=0,
		)
		custom_docperms_scoped = [r for r in custom_docperms_all if r.get("parent") in set(SCOPE_DOCTYPES)]

	# User Permissions + Role Profiles
	user_permissions = []
	if frappe.db.exists("DocType", "User Permission"):
		user_permissions = frappe.get_all(
			"User Permission",
			fields=["name", "user", "allow", "for_value", "apply_to_all_doctypes"],
			order_by="user asc, allow asc, for_value asc, name asc",
			limit_page_length=0,
		)
	role_profiles = []
	if frappe.db.exists("DocType", "Role Profile"):
		for rp in frappe.get_all("Role Profile", fields=["name"], order_by="name asc"):
			doc = frappe.get_doc("Role Profile", rp["name"])
			role_profiles.append({"name": doc.name, "roles": sorted({r.role for r in (doc.roles or []) if r.role})})

	# Shape per doctype
	by_dt_docperm = _rows_by_parent(docperms)
	by_dt_custom = _rows_by_parent(custom_docperms_scoped)
	out = {
		"site": frappe.local.site,
		"scope_doctypes": SCOPE_DOCTYPES,
		"docperm": {dt: _summarize(rows) for dt, rows in by_dt_docperm.items()},
		"custom_docperm_scoped": {dt: _summarize(rows) for dt, rows in by_dt_custom.items()},
		"custom_docperm_counts": {
			"total": len(custom_docperms_all),
			"scoped": len(custom_docperms_scoped),
			"scoped_doctypes": sorted({r.get('parent') for r in (custom_docperms_scoped or []) if r.get('parent')}),
		},
		"user_permissions": user_permissions,
		"role_profiles": role_profiles,
	}
	return out


def run() -> dict:
	res = inventory()
	# Also write a site file for auditability
	try:
		path = frappe.get_site_path(
			"private",
			"files",
			"cm_stabilisation",
			f"contract17_permissions_inventory_{frappe.utils.today()}.json",
		)
		os.makedirs(os.path.dirname(path), exist_ok=True)
		payload = frappe.as_json(res, indent=2)
		with open(path, "w", encoding="utf-8") as f:
			f.write(payload)
		res["written_to"] = path
	except Exception as e:  # noqa: BLE001
		res["write_error"] = str(e)
	return res
