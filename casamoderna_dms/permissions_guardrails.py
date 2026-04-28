from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import date
from typing import Iterable

import frappe


KEY_DOCTYPES: tuple[str, ...] = (
	"Item",
	"Quotation",
	"Sales Order",
	"Supplier",
	"User",
	"Role",
)


CORE_ROLES: tuple[str, ...] = (
	"Administrator",
	"System Manager",
	"Desk User",
	"All",
	"Guest",
	"Customer",
	"Supplier",
)


@dataclass(frozen=True)
class PermissionsBaseline:
	site: str
	generated_on: str
	path: str
	role_count: int
	roles: list[str]
	referenced_roles_docperm: list[str]
	referenced_roles_has_role: list[str]
	missing_roles: list[str]
	docperm_count: int
	custom_docperm_count: int
	key_doctype_docperm_counts: dict[str, int]
	custom_docperm_table_exists: bool


def _sql_scalar(sql: str, params: object | None = None) -> int:
	rows = frappe.db.sql(sql, params or (), as_list=True)
	if not rows or not rows[0]:
		return 0
	val = rows[0][0]
	return int(val or 0)


def _site_out_dir() -> str:
	path = frappe.get_site_path("private", "files", "cm_stabilisation")
	os.makedirs(path, exist_ok=True)
	return path


def _distinct_roles_from_table(table: str) -> set[str]:
	rows = frappe.db.sql(
		f"SELECT DISTINCT role FROM `{table}` WHERE ifnull(role,'')!=''",
		as_list=True,
	)
	return {r[0] for r in rows if r and r[0]}


def _custom_docperm_table_exists() -> bool:
	# Prefer metadata check; fall back to safe SQL.
	try:
		return bool(frappe.db.exists("DocType", "Custom DocPerm"))
	except Exception:
		return False


def get_permissions_baseline() -> dict:
	"""Return a baseline snapshot dict without writing to disk."""
	frappe.set_user("Administrator")

	roles = sorted(set(frappe.get_all("Role", pluck="name")))
	role_count = len(roles)

	referenced_docperm = _distinct_roles_from_table("tabDocPerm")
	referenced_has_role = _distinct_roles_from_table("tabHas Role")
	referenced_docperm_list = sorted(referenced_docperm)
	referenced_has_role_list = sorted(referenced_has_role)

	referenced_all = referenced_docperm | referenced_has_role
	missing = sorted(r for r in referenced_all if r and r not in set(roles))

	docperm_count = _sql_scalar("SELECT COUNT(*) FROM `tabDocPerm`")

	custom_docperm_exists = _custom_docperm_table_exists()
	custom_docperm_count = 0
	if custom_docperm_exists:
		try:
			custom_docperm_count = _sql_scalar("SELECT COUNT(*) FROM `tabCustom DocPerm`")
		except Exception:
			# Table missing or renamed in older versions.
			custom_docperm_exists = False
			custom_docperm_count = 0

	key_counts: dict[str, int] = {}
	for dt in KEY_DOCTYPES:
		key_counts[dt] = _sql_scalar("SELECT COUNT(*) FROM `tabDocPerm` WHERE parent=%s", dt)

	return {
		"site": frappe.local.site,
		"generated_on": date.today().isoformat(),
		"tabRole_count": role_count,
		"roles": roles,
		"roles_referenced_by_tabDocPerm": referenced_docperm_list,
		"roles_referenced_by_tabHasRole": referenced_has_role_list,
		"missing_roles": missing,
		"tabDocPerm_count": docperm_count,
		"tabCustomDocPerm_count": custom_docperm_count,
		"key_doctype_docperm_counts": key_counts,
		"custom_docperm_table_exists": bool(custom_docperm_exists),
	}


def write_permissions_baseline_snapshot(date_tag: str | None = None) -> dict:
	"""Bench entrypoint: writes a role/permission baseline JSON and prints its path.

	Writes to: ./<site>/private/files/cm_stabilisation/permissions_baseline_<date>.json
	"""
	baseline = get_permissions_baseline()
	if date_tag is None:
		date_tag = baseline.get("generated_on") or date.today().isoformat()
	filename = f"permissions_baseline_{date_tag}.json"
	path = os.path.join(_site_out_dir(), filename)
	with open(path, "w", encoding="utf-8") as f:
		json.dump(baseline, f, ensure_ascii=False, indent=2, sort_keys=True, default=str)
	print(path)
	baseline["path"] = path
	return baseline


def get_missing_roles_referenced_by_permissions() -> list[str]:
	"""Return roles referenced by DocPerm/Has Role that are missing in tabRole."""
	frappe.set_user("Administrator")
	existing = set(frappe.get_all("Role", pluck="name"))
	referenced = _distinct_roles_from_table("tabDocPerm") | _distinct_roles_from_table("tabHas Role")
	return sorted(r for r in referenced if r and r not in existing)


def get_custom_docperm_count() -> int:
	"""Global Custom DocPerm count (0 if table/doctype absent)."""
	frappe.set_user("Administrator")
	if not _custom_docperm_table_exists():
		return 0
	try:
		return _sql_scalar("SELECT COUNT(*) FROM `tabCustom DocPerm`")
	except Exception:
		return 0


def assert_permissions_guardrails() -> dict:
	"""Hard-fail guardrails to prevent the 'empty permissions' incident.

	Raises frappe.ValidationError if:
	- Any Custom DocPerm exists (global)
	- Any roles referenced by DocPerm/Has Role are missing in tabRole
	- Any core roles are missing
	- Administrator user is missing

	Returns a small dict of evidence for logging.
	"""
	frappe.set_user("Administrator")
	evidence: dict[str, object] = {
		"site": frappe.local.site,
		"tabRole_count": int(_sql_scalar("SELECT COUNT(*) FROM `tabRole`")),
		"tabDocPerm_count": int(_sql_scalar("SELECT COUNT(*) FROM `tabDocPerm`")),
	}

	custom_docperm_count = get_custom_docperm_count()
	evidence["tabCustom DocPerm_count"] = int(custom_docperm_count)
	if custom_docperm_count > 0:
		raise frappe.ValidationError(
			"Permissions guardrail failed: Custom DocPerm rows exist globally (DocPerm-only policy). "
			f"Count={custom_docperm_count}."
		)

	missing_roles = get_missing_roles_referenced_by_permissions()
	evidence["missing_roles"] = missing_roles
	if missing_roles:
		raise frappe.ValidationError(
			"Permissions guardrail failed: roles referenced by DocPerm/Has Role are missing from tabRole: "
			+ ", ".join(missing_roles[:50])
			+ ("" if len(missing_roles) <= 50 else f" (+{len(missing_roles) - 50} more)")
		)

	missing_core_roles = [r for r in CORE_ROLES if not frappe.db.exists("Role", r)]
	evidence["missing_core_roles"] = missing_core_roles
	if missing_core_roles:
		raise frappe.ValidationError(
			"Permissions guardrail failed: core roles missing in tabRole: " + ", ".join(missing_core_roles)
		)

	# 'Administrator' is a User (not a Role), but the incident response requires it as a critical check.
	if not frappe.db.exists("User", "Administrator"):
		raise frappe.ValidationError("Permissions guardrail failed: User 'Administrator' is missing.")

	return evidence


def repair_missing_roles(commit: bool = False, limit: int = 1000) -> dict:
	"""Bench entrypoint (manual tool): create missing Role docs referenced by DocPerm/Has Role.

	- Does NOT touch DocPerm or assignments.
	- Dry-run by default.
	"""
	frappe.set_user("Administrator")

	missing = get_missing_roles_referenced_by_permissions()
	print("missing_roles =>", len(missing))
	for name in missing[:80]:
		print("  ", name)

	if not missing:
		return {"site": frappe.local.site, "missing": [], "created": 0, "commit": bool(commit)}

	if not commit:
		print("Dry-run only (commit=False). No DB changes applied.")
		return {"site": frappe.local.site, "missing": missing, "created": 0, "commit": False}

	created = 0
	for role_name in missing[:limit]:
		doc = frappe.get_doc(
			{
				"doctype": "Role",
				"role_name": role_name,
				"desk_access": 1,
				"disabled": 0,
				"is_custom": 0,
			}
		)

		# Website-only roles should not have desk access.
		if role_name in {"Customer", "Supplier", "Guest"}:
			doc.desk_access = 0

		doc.insert(ignore_permissions=True, ignore_if_duplicate=True)
		created += 1

	frappe.db.commit()
	frappe.clear_cache()
	print("created_roles =>", created)
	return {"site": frappe.local.site, "missing": missing, "created": created, "commit": True}
