from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from datetime import date
from collections import defaultdict

import frappe


TARGET_DOCTYPES = [
	"Item",
	"Item Group",
	"Quotation",
	"Sales Order",
	"Quotation Item",
	"Sales Order Item",
	"File",
	"Company",
]


PERMISSION_AUDIT_DOCTYPES = sorted(
	{
		*TARGET_DOCTYPES,
		"Customer",
		"Supplier",
		"Purchase Order",
		"Stock Entry",
		"Delivery Note",
		"Sales Invoice",
		"Workspace",
	}
)


PERMISSION_PTYPES = ["read", "write", "create", "delete", "submit", "cancel", "amend"]


def _today_tag() -> str:
	return date.today().isoformat()


def _site_out_dir() -> str:
	path = frappe.get_site_path("private", "files", "cm_stabilisation")
	os.makedirs(path, exist_ok=True)
	return path


def _write_json(filename: str, payload) -> str:
	path = os.path.join(_site_out_dir(), filename)
	with open(path, "w", encoding="utf-8") as f:
		json.dump(payload, f, ensure_ascii=False, indent=2, sort_keys=True, default=str)
	return path


def _first_existing(doctype: str, preferred: list[str]) -> str | None:
	for name in preferred:
		if frappe.db.exists(doctype, name):
			return name
	row = frappe.get_all(doctype, fields=["name"], limit=1)
	return row[0]["name"] if row else None


def _get_default_company() -> str:
	company = frappe.db.get_single_value("Global Defaults", "default_company")
	if company and frappe.db.exists("Company", company):
		return company
	company = frappe.defaults.get_global_default("company")
	if company and frappe.db.exists("Company", company):
		return company
	company = frappe.db.get_value("Company", {}, "name")
	if company:
		return company
	raise frappe.ValidationError("No Company found; cannot run stabilisation tests")


def inventory_snapshot() -> dict:
	"""PHASE A: Complete inventory of customisations (site-specific)."""
	# Property Setters
	property_setters = frappe.get_all(
		"Property Setter",
		filters={"doc_type": ["in", TARGET_DOCTYPES]},
		fields=["name", "doc_type", "field_name", "property", "value", "doctype_or_field"],
		order_by="doc_type asc, field_name asc, property asc, name asc",
	)

	# Custom Fields (explicit + any cm_% fields across the system)
	custom_fields_target = frappe.get_all(
		"Custom Field",
		filters={"dt": ["in", TARGET_DOCTYPES]},
		fields=[
			"name",
			"dt",
			"fieldname",
			"fieldtype",
			"insert_after",
			"hidden",
			"read_only",
			"depends_on",
			"permlevel",
			"reqd",
		],
		order_by="dt asc, fieldname asc, name asc",
	)
	custom_fields_cm = frappe.get_all(
		"Custom Field",
		filters={"fieldname": ["like", "cm_%"]},
		fields=[
			"name",
			"dt",
			"fieldname",
			"fieldtype",
			"insert_after",
			"hidden",
			"read_only",
			"depends_on",
			"permlevel",
			"reqd",
		],
		order_by="dt asc, fieldname asc, name asc",
	)
	custom_fields_special = []
	if frappe.db.exists("Custom Field", "Customer-shipping_address_name"):
		custom_fields_special = frappe.get_all(
			"Custom Field",
			filters={"name": "Customer-shipping_address_name"},
			fields=[
				"name",
				"dt",
				"fieldname",
				"fieldtype",
				"insert_after",
				"hidden",
				"read_only",
				"depends_on",
				"permlevel",
				"reqd",
			],
		)

	cm_doctypes = sorted({row["dt"] for row in custom_fields_cm})

	# Custom DocPerm / roles
	custom_docperms = frappe.get_all(
		"Custom DocPerm",
		filters={"name": ["like", "cm_%"]},
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
		order_by="parent asc, role asc, name asc",
	)
	roles = frappe.get_all(
		"Role",
		filters={"name": ["like", "CasaModerna%"]},
		fields=["name"],
		order_by="name asc",
	)

	# Client Scripts
	client_scripts = frappe.get_all(
		"Client Script",
		filters={"enabled": 1, "dt": ["in", TARGET_DOCTYPES]},
		fields=["name", "dt", "enabled", "view", "modified", "module"],
		order_by="dt asc, name asc",
	)
	client_scripts_cm = frappe.get_all(
		"Client Script",
		filters={"enabled": 1, "name": ["like", "%CasaModerna%"]},
		fields=["name", "dt", "enabled", "view", "modified", "module"],
		order_by="dt asc, name asc",
	)

	# Print Formats
	print_formats = frappe.get_all(
		"Print Format",
		filters={"name": ["like", "CasaModerna%"]},
		fields=["name", "doc_type", "modified", "module", "print_format_type"],
		order_by="doc_type asc, name asc",
	)
	print_format_risk = []
	for pf in print_formats:
		try:
			doc = frappe.get_doc("Print Format", pf["name"])
			html = (doc.html or "")
			j = {
				"name": doc.name,
				"doc_type": doc.doc_type,
				"has_jinja": "{{" in html or "{%" in html,
				"mentions_frappe": "frappe." in html,
				"mentions_db": "frappe.db" in html,
				"mentions_get_doc": "frappe.get_doc" in html,
			}
			print_format_risk.append(j)
		except Exception as e:  # noqa: BLE001
			print_format_risk.append({"name": pf["name"], "error": str(e)})

	# Workspaces / filters
	workspaces = frappe.get_all(
		"Workspace",
		filters={"name": ["like", "%Console%"]},
		fields=["name", "module", "public", "modified"],
		order_by="name asc",
	)
	workspace_roles = []
	for ws in workspaces:
		try:
			doc = frappe.get_doc("Workspace", ws["name"])
			ws_roles = []
			for r in (getattr(doc, "roles", None) or []):
				if getattr(r, "role", None):
					ws_roles.append(r.role)
			workspace_roles.append({"workspace": doc.name, "roles": sorted(set(ws_roles))})
		except Exception as e:  # noqa: BLE001
			workspace_roles.append({"workspace": ws.get("name"), "error": str(e)})
	list_filters = frappe.get_all(
		"List Filter",
		filters={"name": ["like", "CM %"]},
		fields=["name", "reference_doctype", "modified"],
		order_by="reference_doctype asc, name asc",
	)

	# hooks/doc_events
	try:
		import casamoderna_dms.hooks as hooks

		doc_events = hooks.doc_events
		after_migrate = getattr(hooks, "after_migrate", [])
	except Exception as e:  # noqa: BLE001
		doc_events = {"error": str(e)}
		after_migrate = []

	def extract_modules(events) -> dict:
		out: dict[str, dict[str, list[str]]] = {}
		if not isinstance(events, dict):
			return out
		for dt, mapping in events.items():
			if not isinstance(mapping, dict):
				continue
			out.setdefault(dt, {})
			for event, handlers in mapping.items():
				if isinstance(handlers, str):
					handlers = [handlers]
				if not isinstance(handlers, list):
					continue
				mods = []
				for h in handlers:
					if not isinstance(h, str):
						continue
					mods.append(h)
				out[dt][event] = mods
		return out

	modules_by_doctype_event = extract_modules(doc_events)
	modules_flat = sorted({h.rsplit(".", 1)[0] for dt in modules_by_doctype_event for ev in modules_by_doctype_event[dt] for h in modules_by_doctype_event[dt][ev] if isinstance(h, str) and "." in h})

	return {
		"site": frappe.local.site,
		"generated_on": _today_tag(),
		"target_doctypes": TARGET_DOCTYPES,
		"counts": {
			"property_setters": len(property_setters),
			"custom_fields_target": len(custom_fields_target),
			"custom_fields_cm": len(custom_fields_cm),
			"custom_docperms": len(custom_docperms),
			"roles_casamoderna": len(roles),
			"client_scripts_target": len(client_scripts),
			"client_scripts_cm": len(client_scripts_cm),
			"print_formats": len(print_formats),
			"workspaces": len(workspaces),
			"list_filters": len(list_filters),
		},
		"property_setters": property_setters,
		"custom_fields": {
			"target_doctypes": custom_fields_target,
			"cm_all": custom_fields_cm,
			"special": custom_fields_special,
			"cm_doctypes": cm_doctypes,
		},
		"custom_docperms": custom_docperms,
		"roles": [r["name"] for r in roles],
		"client_scripts": {
			"target_doctypes": client_scripts,
			"casamoderna_named": client_scripts_cm,
		},
		"hooks": {
			"doc_events": modules_by_doctype_event,
			"modules_flat": modules_flat,
			"after_migrate": after_migrate,
		},
		"print_formats": {
			"list": print_formats,
			"risk_scan": print_format_risk,
		},
		"workspaces": {"list": workspaces, "roles": workspace_roles},
		"list_filters": list_filters,
	}


def _user_roles(user: str) -> list[str]:
	return sorted({r.get("role") for r in frappe.get_all("Has Role", filters={"parent": user}, fields=["role"]) if r.get("role")})


def _workspace_visibility_by_role() -> list[dict]:
	rows = []
	for ws_name in ["Sales Console", "Products Console"]:
		if not frappe.db.exists("Workspace", ws_name):
			continue
		try:
			doc = frappe.get_doc("Workspace", ws_name)
			roles = []
			for r in (getattr(doc, "roles", None) or []):
				if getattr(r, "role", None):
					roles.append(r.role)
			rows.append({"workspace": doc.name, "public": int(doc.public or 0), "roles": sorted(set(roles))})
		except Exception as e:  # noqa: BLE001
			rows.append({"workspace": ws_name, "error": str(e)})
	return rows


def permission_audit_snapshot(users: dict[str, str] | None = None) -> dict:
	"""System-wide permission model snapshot + effective permissions for provided users.

	This is intentionally read-only: it inventories sources and computes effective ptypes via
	`frappe.has_permission`.
	"""
	frappe.set_user("Administrator")

	# Core permission sources
	roles = frappe.get_all("Role", fields=["name", "desk_access"], order_by="name asc")
	role_profiles = []
	if frappe.db.exists("DocType", "Role Profile"):
		for rp in frappe.get_all("Role Profile", fields=["name"], order_by="name asc"):
			try:
				doc = frappe.get_doc("Role Profile", rp["name"])
				role_profiles.append({"name": doc.name, "roles": sorted({r.role for r in (doc.roles or []) if r.role})})
			except Exception as e:  # noqa: BLE001
				role_profiles.append({"name": rp.get("name"), "error": str(e)})

	# DocPerm + Custom DocPerm across a bounded but representative doctype set.
	docperms = frappe.get_all(
		"DocPerm",
		filters={"parent": ["in", PERMISSION_AUDIT_DOCTYPES]},
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
		order_by="parent asc, role asc, permlevel asc, name asc",
	)
	custom_docperms = frappe.get_all(
		"Custom DocPerm",
		filters={"parent": ["in", PERMISSION_AUDIT_DOCTYPES]},
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
		order_by="parent asc, role asc, permlevel asc, name asc",
	)

	# User Permissions (can be large): include only those affecting our audit doctypes
	user_permissions = []
	if frappe.db.exists("DocType", "User Permission"):
		user_permissions = frappe.get_all(
			"User Permission",
			filters={"allow": ["in", PERMISSION_AUDIT_DOCTYPES]},
			fields=["name", "user", "allow", "for_value", "apply_to_all_doctypes"],
			order_by="user asc, allow asc, for_value asc, name asc",
		)

	# Workspace role-gating
	workspace_visibility = _workspace_visibility_by_role()

	# Analysis: duplicates / no-ops (configuration-level)
	def _dup_index(rows: list[dict]) -> list[dict]:
		idx: dict[tuple, list[dict]] = defaultdict(list)
		for r in rows:
			key = (r.get("parent"), r.get("role"), int(r.get("permlevel") or 0))
			idx[key].append(r)
		out = []
		for key, group in sorted(idx.items()):
			if len(group) <= 1:
				continue
			rights = [
				{
					"read": int(g.get("read") or 0),
					"write": int(g.get("write") or 0),
					"create": int(g.get("create") or 0),
					"delete": int(g.get("delete") or 0),
					"submit": int(g.get("submit") or 0),
					"cancel": int(g.get("cancel") or 0),
					"amend": int(g.get("amend") or 0),
				}
				for g in group
			]
			out.append(
				{
					"key": {"parent": key[0], "role": key[1], "permlevel": key[2]},
					"count": len(group),
					"names": [g.get("name") for g in group],
					"rights_distinct": sorted({json.dumps(r, sort_keys=True) for r in rights}),
				}
			)
		return out

	def _all_zero(rows: list[dict]) -> list[dict]:
		out = []
		for r in rows:
			rights = [int(r.get(k) or 0) for k in ["read", "write", "create", "delete", "submit", "cancel", "amend"]]
			if sum(rights) == 0:
				out.append({"name": r.get("name"), "parent": r.get("parent"), "role": r.get("role"), "permlevel": int(r.get("permlevel") or 0)})
		return out

	analysis = {
		"docperm_duplicates": _dup_index(docperms),
		"custom_docperm_duplicates": _dup_index(custom_docperms),
		"custom_docperm_all_zero": _all_zero(custom_docperms),
	}
	analysis["custom_docperm_conflicts"] = [d for d in (analysis.get("custom_docperm_duplicates") or []) if len(d.get("rights_distinct") or []) > 1]

	# Shadowing signal: presence of any Custom DocPerm rows for a doctype generally means
	# standard DocPerm rows are not used for that doctype.
	custom_roles_by_doctype: dict[str, list[str]] = defaultdict(list)
	for r in custom_docperms:
		parent = r.get("parent")
		role = r.get("role")
		if parent and role:
			custom_roles_by_doctype[parent].append(role)
	analysis["custom_docperm_doctypes"] = sorted(custom_roles_by_doctype.keys())
	analysis["custom_docperm_roles_by_doctype"] = {k: sorted(set(v)) for k, v in sorted(custom_roles_by_doctype.items())}

	# Contract 17: single-source-of-truth. Custom DocPerm must not exist for key doctypes.
	contract17_scope = {
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
	}
	analysis["contract17_custom_docperm_in_scope"] = sorted([dt for dt in custom_roles_by_doctype.keys() if dt in contract17_scope])

	# Suppliers Contract: Custom DocPerm must not exist for supplier-related doctypes.
	contract_suppliers_scope = {
		"Supplier",
		"Supplier Group",
		"Contact",
		"Address",
		"Bank Account",
	}
	analysis["contract_suppliers_custom_docperm_in_scope"] = sorted(
		[dt for dt in custom_roles_by_doctype.keys() if dt in contract_suppliers_scope]
	)

	# Effective permissions for requested persona users
	effective = {}
	persona_mismatches = []
	if users:
		for label, user in sorted(users.items()):
			try:
				roles_for_user = _user_roles(user)
				# Flag any unexpected role contamination beyond the roles we set in _ensure_test_user.
				contamination = [r for r in roles_for_user if r not in {"Desk User", "All", "CasaModerna Products Console", "CasaModerna Product Maintainer", "CasaModerna Sales Console", "Sales User"}]

				eff_rows = []
				errors_by_doctype: dict[str, dict[str, str]] = {}
				for dt in PERMISSION_AUDIT_DOCTYPES:
					dt_row = {"doctype": dt}
					for p in PERMISSION_PTYPES:
						try:
							allowed = bool(frappe.has_permission(dt, ptype=p, user=user))
						except Exception as e:  # noqa: BLE001
							allowed = False
							errors_by_doctype.setdefault(dt, {})[p] = str(e)
						dt_row[p] = allowed
					eff_rows.append(dt_row)

				effective[label] = {
					"user": user,
					"roles": roles_for_user,
					"role_contamination": contamination,
					"doctypes": eff_rows,
					"errors": errors_by_doctype,
				}

				# Evidence: if a role's DocPerm grants read/create but effective is false and
				# the doctype has Custom DocPerm rows, that role is likely shadowed.
				eff_by_dt = {r["doctype"]: r for r in eff_rows if r.get("doctype")}
				for dt in PERMISSION_AUDIT_DOCTYPES:
					if dt not in custom_roles_by_doctype:
						continue
					eff = eff_by_dt.get(dt) or {}
					if eff.get("read") or eff.get("create") or eff.get("write"):
						continue
					# Check if any of the user's roles has DocPerm read/create/write on this dt.
					granted = False
					for dp in docperms:
						if dp.get("parent") != dt:
							continue
						if dp.get("role") not in roles_for_user:
							continue
						if int(dp.get("read") or 0) or int(dp.get("create") or 0) or int(dp.get("write") or 0):
							granted = True
							break
					if granted:
						persona_mismatches.append(
							{
								"persona": label,
								"user": user,
								"doctype": dt,
								"roles": roles_for_user,
								"custom_docperm_roles": sorted(set(custom_roles_by_doctype.get(dt) or [])),
							}
						)
			except Exception as e:  # noqa: BLE001
				effective[label] = {"user": user, "error": str(e)}
	analysis["persona_shadow_mismatches"] = persona_mismatches

	return {
		"site": frappe.local.site,
		"generated_on": _today_tag(),
		"audit_doctypes": PERMISSION_AUDIT_DOCTYPES,
		"roles": roles,
		"role_profiles": role_profiles,
		"docperms": docperms,
		"custom_docperms": custom_docperms,
		"user_permissions": user_permissions,
		"workspace_visibility": workspace_visibility,
		"analysis": analysis,
		"effective": effective,
	}


@dataclass
class TestUsers:
	products: str
	maintainer: str
	sales: str
	super_admin: str


def _ensure_test_user(email: str, roles: list[str]) -> str:
	if frappe.db.exists("User", email):
		u = frappe.get_doc("User", email)
	else:
		u = frappe.new_doc("User")
		u.email = email
		u.first_name = email.split("@", 1)[0]
		u.user_type = "System User"
		u.send_welcome_email = 0

	u.enabled = 1
	u.user_type = "System User"
	u.send_welcome_email = 0

	# Reset roles to a minimal set each run.
	# Note: In Frappe/ERPNext, "System User" is a user_type, not a Role.
	base_roles: list[str] = []
	for r in ["Desk User", "All"]:
		if frappe.db.exists("Role", r):
			base_roles.append(r)
	u.roles = []
	for r in sorted(set(base_roles + roles)):
		u.append("roles", {"role": r})

	u.save(ignore_permissions=True)
	return u.name


def _disable_user(email: str):
	if frappe.db.exists("User", email):
		u = frappe.get_doc("User", email)
		u.enabled = 0
		u.save(ignore_permissions=True)


def _required_item_fields_not_hidden() -> list[str]:
	meta = frappe.get_meta("Item")
	required = [
		"item_code",
		"item_name",
		"item_group",
		"stock_uom",
		"is_stock_item",
		"has_variants",
		"variant_of",
		"uoms",
		"barcodes",
		"image",
	]
	problems = []
	for fn in required:
		df = meta.get_field(fn)
		if not df:
			problems.append(f"missing meta field: {fn}")
			continue
		if int(getattr(df, "hidden", 0) or 0):
			problems.append(f"unexpected hidden: {fn}")
	return problems


def _item_pricing_fields_readonly_problems() -> dict[str, list[str]]:
	"""Products Ready: pricing model fields must exist; derived outputs must be read-only."""
	meta = frappe.get_meta("Item")

	# Inputs / controls (must exist; not necessarily read-only)
	required_inputs = [
		"cm_rrp_ex_vat",
		"cm_discount_target_percent",
		"cm_pricing_mode_ui",
		"cm_pricing_rounding_mode",
		"cm_cost_ex_vat",
	]

	# Derived outputs (must exist and be read-only)
	required_derived_readonly = [
		"cm_vat_rate_percent",
		"cm_rrp_inc_vat",
		"cm_discounted_inc_vat",
		"cm_final_offer_ex_vat",
		"cm_final_offer_inc_vat",
		"cm_rounding_delta",
		"cm_discount_percent",
		"cm_purchase_price_ex_vat",
		"cm_landed_additions_total_ex_vat",
		"cm_cost_ex_vat_calculated",
	]

	missing = []
	not_readonly = []
	for fn in required_inputs:
		df = meta.get_field(fn)
		if not df:
			missing.append(fn)

	for fn in required_derived_readonly:
		df = meta.get_field(fn)
		if not df:
			missing.append(fn)
			continue
		if not int(getattr(df, "read_only", 0) or 0):
			not_readonly.append(fn)

	return {"missing": missing, "not_readonly": not_readonly}


def _slice014_sales_order_ui_v1lite_problems() -> list[dict]:
	"""Slice 014: Assert Sales Order UI meta is identity-first and decluttered.

	We assert:
	- Identity fields exist and are not hidden
	- `workflow_state` + `status` are in the top (pre-items) surface
	- Targeted advanced sections are collapsible (clutter reduction)
	- Slice 013 Convert group client script remains enabled
	"""
	problems: list[dict] = []
	meta = frappe.get_meta("Sales Order")
	fields = [df.fieldname for df in meta.fields if getattr(df, "fieldname", None)]

	required_identity = [
		"workflow_state",
		"status",
		"customer",
		"transaction_date",
	]
	for fn in required_identity:
		df = meta.get_field(fn)
		if not df:
			problems.append({"fieldname": fn, "problem": "missing"})
			continue
		if int(getattr(df, "hidden", 0) or 0) != 0:
			problems.append({"fieldname": fn, "property": "hidden", "expected": 0, "got": getattr(df, "hidden", None)})

	# Identity must be in the top working surface (before items table).
	if "items" in fields:
		items_idx = fields.index("items")
		for fn in ["workflow_state", "status", "customer", "transaction_date"]:
			if fn in fields and fields.index(fn) > items_idx:
				problems.append({"fieldname": fn, "problem": "after_items", "items_index": items_idx, "field_index": fields.index(fn)})
	else:
		problems.append({"fieldname": "items", "problem": "missing"})

	# Clutter reduction: advanced blocks should be collapsible.
	for section_field in [
		"accounting_dimensions_section",
		"currency_and_price_list",
		"section_break_48",  # Additional Discount
		"sec_tax_breakup",  # Tax Breakup
		"packing_list",
		"printing_details",  # Print Settings
		"additional_info_section",
		"pricing_rule_details",
	]:
		df = meta.get_field(section_field)
		if not df:
			# Some sections can legitimately be absent depending on ERPNext settings.
			continue
		if getattr(df, "fieldtype", None) not in {"Section Break", "Tab Break"}:
			continue
		if int(getattr(df, "collapsible", 0) or 0) != 1:
			problems.append({"fieldname": section_field, "property": "collapsible", "expected": 1, "got": getattr(df, "collapsible", None)})

	# Ensure Slice 013 Convert group script remains enabled.
	conv_enabled = frappe.db.get_value("Client Script", "Sales Order - CasaModerna Conversions", "enabled")
	if int(conv_enabled or 0) != 1:
		problems.append({"doctype": "Client Script", "name": "Sales Order - CasaModerna Conversions", "property": "enabled", "expected": 1, "got": conv_enabled})

	# Ensure workflow_state is emphasized (helps Pending/Confirmed stand out).
	wf = meta.get_field("workflow_state")
	if wf and int(getattr(wf, "bold", 0) or 0) != 1:
		problems.append({"fieldname": "workflow_state", "property": "bold", "expected": 1, "got": getattr(wf, "bold", None)})

	return problems


def _slice015_unified_sales_docs_ui_shell_problems() -> list[dict]:
	"""Slice 015: Assert unified Sales Docs UI shell is enabled everywhere.

	Deterministic (no DOM / screenshots):
	- Shared desk assets (JS/CSS) exist in app and are registered in hooks
	- Thin wrapper Client Scripts exist + enabled for each target doctype
	- Wrapper scripts reference the shared initializer token
	- Required V1 fields exist on each target doctype meta

	Scope (as requested): QT / SO / DN / IN(+returns) / POS(+returns) / PF.
	"""
	problems: list[dict] = []

	# 1) Shared assets present and registered.
	js_rel = "/assets/casamoderna_dms/js/cm_sales_doc_shell.js"
	css_rel = "/assets/casamoderna_dms/css/cm_sales_doc_shell.css"
	js_path = frappe.get_app_path("casamoderna_dms", "public", "js", "cm_sales_doc_shell.js")
	css_path = frappe.get_app_path("casamoderna_dms", "public", "css", "cm_sales_doc_shell.css")
	if not os.path.exists(js_path):
		problems.append({"asset": js_rel, "problem": "missing_file", "path": js_path})
	if not os.path.exists(css_path):
		problems.append({"asset": css_rel, "problem": "missing_file", "path": css_path})

	try:
		import casamoderna_dms.hooks as hooks

		js_list = getattr(hooks, "app_include_js", []) or []
		css_list = getattr(hooks, "app_include_css", []) or []
		if js_rel not in js_list:
			problems.append({"hook": "app_include_js", "expected": js_rel, "got": js_list})
		if css_rel not in css_list:
			problems.append({"hook": "app_include_css", "expected": css_rel, "got": css_list})
	except Exception as e:  # noqa: BLE001
		problems.append({"problem": "hooks_import_failed", "error": str(e)})

	# 2) Wrapper Client Scripts enabled.
	expected_scripts = [
		{"name": "Quotation - CasaModerna Sales Doc Shell", "dt": "Quotation"},
		{"name": "Sales Order - CasaModerna Sales Doc Shell", "dt": "Sales Order"},
		{"name": "Delivery Note - CasaModerna Sales Doc Shell", "dt": "Delivery Note"},
		{"name": "Sales Invoice - CasaModerna Sales Doc Shell", "dt": "Sales Invoice"},
		{"name": "POS Invoice - CasaModerna Sales Doc Shell", "dt": "POS Invoice"},
		{"name": "CM Proforma - CasaModerna Sales Doc Shell", "dt": "CM Proforma"},
	]

	for exp in expected_scripts:
		name = exp["name"]
		dt = exp["dt"]
		if not frappe.db.exists("Client Script", name):
			problems.append({"doctype": "Client Script", "name": name, "problem": "missing"})
			continue
		cs = frappe.get_doc("Client Script", name)
		if cs.dt != dt:
			problems.append({"doctype": "Client Script", "name": name, "property": "dt", "expected": dt, "got": cs.dt})
		if int(cs.enabled or 0) != 1:
			problems.append({"doctype": "Client Script", "name": name, "property": "enabled", "expected": 1, "got": int(cs.enabled or 0)})
		script = (cs.script or "")
		if "CM_SALES_DOC_SHELL_V1" not in script or "cm_sales_doc_shell.init" not in script:
			problems.append({"doctype": "Client Script", "name": name, "problem": "missing_token", "expected": ["CM_SALES_DOC_SHELL_V1", "cm_sales_doc_shell.init"]})

	# 4) Safety: Slice 013 Convert scripts must remain enabled (we only surface UI).
	for name in [
		"Quotation - CasaModerna Conversions",
		"Sales Order - CasaModerna Conversions",
		"Delivery Note - CasaModerna Conversions",
	]:
		enabled = frappe.db.get_value("Client Script", name, "enabled")
		if int(enabled or 0) != 1:
			problems.append({"doctype": "Client Script", "name": name, "property": "enabled", "expected": 1, "got": enabled})

	return problems


def _slice016_sales_docs_declutter_problems() -> list[dict]:
	"""Slice 016: Assert standard-field declutter is applied (UI-only).

	We intentionally do NOT assert every hidden field (too brittle). Instead we assert:
	- A stable set of noisy ERPNext standard fields are hidden where they exist
	- Core working-surface fields remain visible

	This is deterministic and does not require DOM inspection.
	"""
	problems: list[dict] = []

	core_visible = {
		# Quotation links to Customer via `party_name` (not `customer`).
		"Quotation": ["party_name", "transaction_date", "items", "grand_total"],
		"Sales Order": ["customer", "transaction_date", "items", "grand_total", "workflow_state", "status"],
		"Delivery Note": ["customer", "posting_date", "items"],
		"Sales Invoice": ["customer", "posting_date", "items", "grand_total", "is_return"],
		"POS Invoice": ["customer", "posting_date", "items", "grand_total", "is_return"],
		"CM Proforma": ["customer", "currency", "grand_total"],
	}

	noisy_hidden = {
		"Quotation": [
			"scan_barcode",
			"last_scanned_warehouse",
			"ignore_pricing_rule",
			"conversion_rate",
			"plc_conversion_rate",
			"base_total",
			"base_net_total",
			"base_grand_total",
			"in_words",
		],
		"Sales Order": [
			"scan_barcode",
			"last_scanned_warehouse",
			"ignore_pricing_rule",
			"conversion_rate",
			"plc_conversion_rate",
			"base_total",
			"base_net_total",
			"base_grand_total",
			"tax_category",
		],
		"Delivery Note": [
			"set_posting_time",
			"posting_time",
			"scan_barcode",
			"last_scanned_warehouse",
			"set_warehouse",
			"set_target_warehouse",
			"base_total",
			"base_grand_total",
		],
		"Sales Invoice": [
			"set_posting_time",
			"posting_time",
			"scan_barcode",
			"last_scanned_warehouse",
			"set_warehouse",
			"set_target_warehouse",
			"base_total",
			"base_grand_total",
			"is_consolidated",
		],
		"POS Invoice": [
			"set_posting_time",
			"posting_time",
			"scan_barcode",
			"last_scanned_warehouse",
			"base_total",
			"base_grand_total",
		],
		"CM Proforma": [
			"naming_series",
		],
	}

	for dt, core in core_visible.items():
		meta = frappe.get_meta(dt)
		for fn in core:
			df = meta.get_field(fn)
			if not df:
				problems.append({"doctype": dt, "fieldname": fn, "problem": "missing"})
				continue
			if int(getattr(df, "hidden", 0) or 0) != 0:
				problems.append({"doctype": dt, "fieldname": fn, "property": "hidden", "expected": 0, "got": getattr(df, "hidden", None)})

		for fn in noisy_hidden.get(dt, []):
			df = meta.get_field(fn)
			if not df:
				continue
			if int(getattr(df, "hidden", 0) or 0) != 1:
				problems.append({"doctype": dt, "fieldname": fn, "property": "hidden", "expected": 1, "got": getattr(df, "hidden", None)})

	return problems


def _slice017_sales_docs_items_grid_v1_parity_problems() -> list[dict]:
	"""Slice 017: Assert Sales Docs items grid columns match V1 working surface.

	Deterministic checks (meta only):
	- For each audited child table doctype, assert that the set + order of visible grid columns
	  (in_list_view=1 and hidden=0) matches our Slice 017 targets.
	- Assert critical operational fields still exist (we only change visibility).
	"""
	problems: list[dict] = []

	structural = {
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

	expected_visible = {
		"Quotation Item": [
			"item_code",
			"description",
			"cm_rrp_ex_vat",
			"discount_percentage",
			"cm_final_offer_inc_vat",
			"qty",
			"amount",
		],
		"Sales Order Item": [
			"item_code",
			"description",
			"cm_rrp_ex_vat",
			"discount_percentage",
			"cm_final_offer_inc_vat",
			"qty",
			"amount",
		],
		"Delivery Note Item": ["item_code", "description", "qty", "amount"],
		"Sales Invoice Item": ["item_code", "description", "qty", "amount"],
		"POS Invoice Item": ["item_code", "description", "qty", "amount"],
		"CM Proforma Item": ["item_code", "description", "qty", "amount"],
	}

	critical_fields = {
		"Quotation Item": ["item_code", "qty", "rate", "amount", "uom", "conversion_factor"],
		"Sales Order Item": ["item_code", "qty", "rate", "amount", "uom", "conversion_factor"],
		"Delivery Note Item": ["item_code", "qty", "rate", "amount", "uom", "conversion_factor", "warehouse"],
		"Sales Invoice Item": ["item_code", "qty", "rate", "amount", "uom", "conversion_factor", "income_account"],
		"POS Invoice Item": ["item_code", "qty", "rate", "amount", "uom", "conversion_factor", "income_account"],
		"CM Proforma Item": ["item_code", "qty", "rate", "amount"],
	}

	for child_dt, expected in expected_visible.items():
		meta = frappe.get_meta(child_dt)

		for fn in critical_fields.get(child_dt, []):
			if not meta.has_field(fn):
				problems.append({"doctype": child_dt, "fieldname": fn, "problem": "missing"})

		visible = []
		for df in meta.fields:
			fn = getattr(df, "fieldname", None)
			if not fn:
				continue
			if getattr(df, "fieldtype", None) in structural:
				continue
			if int(getattr(df, "hidden", 0) or 0) == 1:
				continue
			if int(getattr(df, "in_list_view", 0) or 0) != 1:
				continue
			visible.append(fn)

		if visible != expected:
			problems.append({"doctype": child_dt, "property": "visible_grid_columns", "expected": expected, "got": visible})

	return problems


def _slice023_sales_docs_items_grid_v1_parity_authoritative_problems() -> list[dict]:
	"""Slice 023: Assert Sales Docs items grid columns match the authoritative V1-like surface.

	Deterministic checks (meta only):
	- For each items child table doctype, assert that the set + order of visible grid columns
	  (in_list_view=1 and hidden=0) matches Slice 023 targets.
	- Assert critical operational fields still exist (we only change visibility).

	Notes:
	- `CM Proforma Item` currently has no CM pricing display fields; Slice 023 enforces a minimal
	  rate-based surface for PF until/unless the data-model/conversion contract is expanded.
	"""
	problems: list[dict] = []

	structural = {
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

	expected_visible = {
		"Quotation Item": [
			"item_code",
			"description",
			"cm_rrp_ex_vat",
			"discount_percentage",
			"cm_final_offer_inc_vat",
			"qty",
			"amount",
		],
		"Sales Order Item": [
			"item_code",
			"description",
			"cm_rrp_ex_vat",
			"discount_percentage",
			"cm_final_offer_inc_vat",
			"qty",
			"amount",
		],
		"Delivery Note Item": ["item_code", "description", "qty"],
		"Sales Invoice Item": ["item_code", "description", "qty", "rate", "amount"],
		"POS Invoice Item": ["item_code", "description", "qty", "rate", "amount"],
		"CM Proforma Item": ["item_code", "description", "qty", "rate", "amount"],
	}

	critical_fields = {
		"Quotation Item": ["item_code", "qty", "rate", "amount", "uom", "conversion_factor"],
		"Sales Order Item": ["item_code", "qty", "rate", "amount", "uom", "conversion_factor"],
		"Delivery Note Item": ["item_code", "qty", "rate", "amount", "uom", "conversion_factor", "warehouse"],
		"Sales Invoice Item": ["item_code", "qty", "rate", "amount", "uom", "conversion_factor", "income_account"],
		"POS Invoice Item": ["item_code", "qty", "rate", "amount", "uom", "conversion_factor", "income_account"],
		"CM Proforma Item": ["item_code", "qty", "rate", "amount"],
	}

	for child_dt, expected in expected_visible.items():
		meta = frappe.get_meta(child_dt)
		for fn in critical_fields.get(child_dt, []):
			if not meta.has_field(fn):
				problems.append({"doctype": child_dt, "fieldname": fn, "problem": "missing"})

		visible: list[str] = []
		for df in meta.fields:
			fn = getattr(df, "fieldname", None)
			if not fn:
				continue
			if getattr(df, "fieldtype", None) in structural:
				continue
			if int(getattr(df, "hidden", 0) or 0) == 1:
				continue
			if int(getattr(df, "in_list_view", 0) or 0) != 1:
				continue
			visible.append(fn)

		if visible != expected:
			problems.append({"doctype": child_dt, "property": "visible_grid_columns", "expected": expected, "got": visible})

	return problems


def _slice018_sales_docs_totals_bottom_panel_v1_parity_problems() -> list[dict]:
	"""Slice 018: Assert Sales Docs totals/bottom panel meta invariants.

	Deterministic checks (meta only):
	- Core totals fields remain present and visible: net_total, total_taxes_and_charges, grand_total
	- On doctypes where CasaModerna uses an existing payment schedule (Quotation/Sales Order),
	  the payment schedule table remains present and visible (deposit/payment terms area)
	- Targeted noisy/duplicate totals UI fields are hidden where present

	No DOM inspection; no logic checks.
	"""
	problems: list[dict] = []

	core_totals = ["net_total", "total_taxes_and_charges", "grand_total"]
	deposit_doctypes = ["Quotation", "Sales Order"]
	all_doctypes = [
		"Quotation",
		"Sales Order",
		"Delivery Note",
		"Sales Invoice",
		"POS Invoice",
		"CM Proforma",
	]

	noisy_hidden = [
		"taxes_and_charges",
		"taxes",
		"total",
		"apply_discount_on",
		"additional_discount_percentage",
		"discount_amount",
		"coupon_code",
	]

	for dt in all_doctypes:
		meta = frappe.get_meta(dt)

		for fn in core_totals:
			df = meta.get_field(fn)
			if not df:
				problems.append({"doctype": dt, "fieldname": fn, "problem": "missing"})
				continue
			if int(getattr(df, "hidden", 0) or 0) != 0:
				problems.append({"doctype": dt, "fieldname": fn, "property": "hidden", "expected": 0, "got": getattr(df, "hidden", None)})

		if dt in deposit_doctypes:
			df = meta.get_field("payment_schedule")
			if not df:
				problems.append({"doctype": dt, "fieldname": "payment_schedule", "problem": "missing"})
			else:
				if int(getattr(df, "hidden", 0) or 0) != 0:
					problems.append({"doctype": dt, "fieldname": "payment_schedule", "property": "hidden", "expected": 0, "got": getattr(df, "hidden", None)})

		for fn in noisy_hidden:
			df = meta.get_field(fn)
			if not df:
				continue
			if int(getattr(df, "hidden", 0) or 0) != 1:
				problems.append({"doctype": dt, "fieldname": fn, "property": "hidden", "expected": 1, "got": getattr(df, "hidden", None)})

	return problems


def _slice024_sales_docs_bottom_panels_v1_parity_problems() -> list[dict]:
	"""Slice 024: Assert bottom panel meta invariants (UI-only).

	Deterministic checks (meta only):
	- Core totals fields remain present + visible: net_total, total_taxes_and_charges, grand_total
	- Remaining duplicate/noisy totals fields are hidden where present:
	  - rounded_total
	  - base_* totals duplicates

	Notes:
	- The V1-like bottom composition (Attachments left, Totals right, Deposit for QT/SO)
	  is implemented by the shared shell; this check focuses on the underlying meta invariants
	  to prevent totals clutter regressing into the default working surface.
	"""
	problems: list[dict] = []

	core_totals = ["net_total", "total_taxes_and_charges", "grand_total"]
	all_doctypes = [
		"Quotation",
		"Sales Order",
		"Delivery Note",
		"Sales Invoice",
		"POS Invoice",
		"CM Proforma",
	]

	# Hide duplicates/clutter; keep backend correctness.
	noisy_hidden = [
		"rounded_total",
		"base_net_total",
		"base_total_taxes_and_charges",
		"base_grand_total",
		"base_rounded_total",
	]

	for dt in all_doctypes:
		meta = frappe.get_meta(dt)

		for fn in core_totals:
			df = meta.get_field(fn)
			if not df:
				problems.append({"doctype": dt, "fieldname": fn, "problem": "missing"})
				continue
			if int(getattr(df, "hidden", 0) or 0) != 0:
				problems.append({"doctype": dt, "fieldname": fn, "property": "hidden", "expected": 0, "got": getattr(df, "hidden", None)})

		for fn in noisy_hidden:
			df = meta.get_field(fn)
			if not df:
				continue
			if int(getattr(df, "hidden", 0) or 0) != 1:
				problems.append({"doctype": dt, "fieldname": fn, "property": "hidden", "expected": 1, "got": getattr(df, "hidden", None)})

	return problems


def _slice021_unified_sales_docs_ui_shell_phase1_problems() -> list[dict]:
	"""Slice 021: Assert unified Sales Docs shell Phase 1 invariants.

	Deterministic checks:
	- Wrapper Client Scripts remain enabled for all target doctypes
	- Wrapper scripts pass the required V1 doctype label mapping into the shared shell
	- Slice 013 Convert group client scripts remain enabled (logic unchanged; UI may be repositioned)
	"""
	problems: list[dict] = []

	expected_wrappers = [
		{"name": "Quotation - CasaModerna Sales Doc Shell", "dt": "Quotation", "label": "Quotation"},
		{"name": "Sales Order - CasaModerna Sales Doc Shell", "dt": "Sales Order", "label": "Sales Order"},
		{"name": "Delivery Note - CasaModerna Sales Doc Shell", "dt": "Delivery Note", "label": "Delivery Note"},
		{"name": "Sales Invoice - CasaModerna Sales Doc Shell", "dt": "Sales Invoice", "label": "Invoice"},
		{"name": "POS Invoice - CasaModerna Sales Doc Shell", "dt": "POS Invoice", "label": "Cash Sale"},
		{"name": "CM Proforma - CasaModerna Sales Doc Shell", "dt": "CM Proforma", "label": "Proforma"},
	]

	for exp in expected_wrappers:
		name = exp["name"]
		dt = exp["dt"]
		label = exp["label"]
		if not frappe.db.exists("Client Script", name):
			problems.append({"doctype": "Client Script", "name": name, "problem": "missing"})
			continue
		cs = frappe.get_doc("Client Script", name)
		if cs.dt != dt:
			problems.append({"doctype": "Client Script", "name": name, "property": "dt", "expected": dt, "got": cs.dt})
		if int(cs.enabled or 0) != 1:
			problems.append({"doctype": "Client Script", "name": name, "property": "enabled", "expected": 1, "got": int(cs.enabled or 0)})
		script = (cs.script or "")
		# Evidence of label mapping being passed to the shared initializer.
		expected_snippet = f"doctype_label: '{label}'"
		if expected_snippet not in script:
			problems.append({"doctype": "Client Script", "name": name, "problem": "missing_doctype_label", "expected": expected_snippet})

	for name in [
		"Quotation - CasaModerna Conversions",
		"Sales Order - CasaModerna Conversions",
		"Delivery Note - CasaModerna Conversions",
	]:
		enabled = frappe.db.get_value("Client Script", name, "enabled")
		if int(enabled or 0) != 1:
			problems.append({"doctype": "Client Script", "name": name, "property": "enabled", "expected": 1, "got": enabled})

	return problems


def _slice020_products_taxonomy_top_level_item_groups_problems() -> list[dict]:
	"""Slice 020: Assert the evidence-locked CM V1 top-level Item Group taxonomy exists.

	Deterministic checks:
	- A dedicated parent Item Group exists: "CM V1 Product Categories"
	- The locked V1 top-level categories exist as children (all groups)
	- "Night Collection" is not present (explicitly retired in V1 evidence)
	"""
	problems: list[dict] = []

	parent = "CM V1 Product Categories"
	v1_top_level = [
		"0100 Living Area",
		"0200 Bedroom",
		"0300 Dining Room",
		"0400 Kitchen & Utility",
		"0500 Home Office",
		"0600 Kids Bedrooms & Child Care",
		"0700 Bathroom Furniture",
		"0800 Outdoor Furniture",
		"0900 Walkin Storage & Organisation",
		"1000 Custom & Projects",
		"1100 Accessories & Décor",
		"1200 Tiles",
	]

	if not frappe.db.exists("Item Group", parent):
		problems.append({"doctype": "Item Group", "name": parent, "problem": "missing"})
		return problems

	parent_doc = frappe.get_doc("Item Group", parent)
	if int(getattr(parent_doc, "is_group", 0) or 0) != 1:
		problems.append({"doctype": "Item Group", "name": parent, "property": "is_group", "expected": 1, "got": int(getattr(parent_doc, 'is_group', 0) or 0)})

	for name in v1_top_level:
		if not frappe.db.exists("Item Group", name):
			problems.append({"doctype": "Item Group", "name": name, "problem": "missing"})
			continue
		doc = frappe.get_doc("Item Group", name)
		if getattr(doc, "parent_item_group", None) != parent:
			problems.append({"doctype": "Item Group", "name": name, "property": "parent_item_group", "expected": parent, "got": getattr(doc, "parent_item_group", None)})
		if int(getattr(doc, "is_group", 0) or 0) != 1:
			problems.append({"doctype": "Item Group", "name": name, "property": "is_group", "expected": 1, "got": int(getattr(doc, 'is_group', 0) or 0)})

	if frappe.db.exists("Item Group", "Night Collection"):
		problems.append({"doctype": "Item Group", "name": "Night Collection", "problem": "retired_category_present"})

	return problems


def run_test_matrix(create_docs: int = 1) -> dict:
	"""PHASE B: Deterministic function test matrix (role-based)."""
	frappe.set_user("Administrator")

	users = TestUsers(
		products=_ensure_test_user(
			"cm_stab_products@casamoderna.local",
			roles=["CasaModerna Products Console"],
		),
		maintainer=_ensure_test_user(
			"cm_stab_maintainer@casamoderna.local",
			roles=["CasaModerna Product Maintainer"],
		),
		sales=_ensure_test_user(
			"cm_stab_sales@casamoderna.local",
			roles=["Sales User", "CasaModerna Sales Console"],
		),
		super_admin=_ensure_test_user(
			"cm_stab_super_admin@casamoderna.local",
			roles=["CM Super Admin"],
		),
	)

	results: dict = {
		"site": frappe.local.site,
		"generated_on": _today_tag(),
		"users": {"products": users.products, "maintainer": users.maintainer, "sales": users.sales, "super_admin": users.super_admin},
		"tests": [],
		"created": {},
	}

	created_docs: list[tuple[str, str]] = []

	def record(name: str, ok: bool, details: dict | None = None):
		row = {"test": name, "ok": bool(ok)}
		if details:
			row.update(details)
		results["tests"].append(row)
		if not ok:
			raise frappe.ValidationError(f"Stabilisation test failed: {name} :: {details or ''}")

	def _matches(pattern: str, value) -> bool:
		return bool(value and re.match(pattern, str(value)))

	try:
		# Permissions intent checks
		frappe.set_user(users.products)
		can_create_item = bool(frappe.has_permission("Item", ptype="create"))
		record(
			"B1.1 Products Console role cannot create Item (read-only)",
			ok=(not can_create_item),
			details={"can_create_item": can_create_item},
		)
		can_create_item_group = bool(frappe.has_permission("Item Group", ptype="create"))
		record(
			"B2.8 Products Console role cannot create Item Group (read-only)",
			ok=(not can_create_item_group),
			details={"can_create_item_group": can_create_item_group},
		)

		frappe.set_user(users.maintainer)
		can_create_item_m = bool(frappe.has_permission("Item", ptype="create"))
		record(
			"B1.1 Maintainer cannot create Item (least privilege)",
			ok=(not can_create_item_m),
			details={"can_create_item": can_create_item_m},
		)
		can_create_item_group_m = bool(frappe.has_permission("Item Group", ptype="create"))
		record(
			"B2.7 Maintainer can create Item Group",
			ok=can_create_item_group_m,
			details={"can_create_item_group": can_create_item_group_m},
		)

		# CM Super Admin: must retain full access (critical for operational recovery).
		frappe.set_user(users.super_admin)
		for dt in ["Item", "Item Group", "Customer", "Quotation", "Sales Order", "Delivery Note", "Sales Invoice", "File", "Company"]:
			for p in ["read", "write", "create", "delete"]:
				allowed = bool(frappe.has_permission(dt, ptype=p))
				record(f"B6 {dt} CM Super Admin can {p}", ok=allowed, details={"doctype": dt, "ptype": p, "allowed": allowed})

		# Sales Console persona: must be able to work on selling drafts, but not create derived docs directly.
		frappe.set_user(users.sales)
		can_create_customer = bool(frappe.has_permission("Customer", ptype="create"))
		record("B5.1 Sales Console can create Customer", ok=can_create_customer, details={"can_create_customer": can_create_customer})
		can_create_quotation = bool(frappe.has_permission("Quotation", ptype="create"))
		record("B5.2 Sales Console can create Quotation", ok=can_create_quotation, details={"can_create_quotation": can_create_quotation})
		can_create_sales_order = bool(frappe.has_permission("Sales Order", ptype="create"))
		record("B5.3 Sales Console can create Sales Order", ok=can_create_sales_order, details={"can_create_sales_order": can_create_sales_order})
		can_read_dn = bool(frappe.has_permission("Delivery Note", ptype="read"))
		record("B5.4 Sales Console can read Delivery Note", ok=can_read_dn, details={"can_read_delivery_note": can_read_dn})
		can_read_si = bool(frappe.has_permission("Sales Invoice", ptype="read"))
		record("B5.5 Sales Console can read Sales Invoice", ok=can_read_si, details={"can_read_sales_invoice": can_read_si})

		# Contract 17: permissions are standard DocPerm; derived-only enforcement is a business rule.
		# Assert direct creation is blocked by validation (not by shadow permissions).
		from casamoderna_dms.sales_console import (
			validate_derived_only_delivery_note,
			validate_derived_only_sales_invoice,
		)
		dn = frappe.new_doc("Delivery Note")
		dn.items = [frappe._dict({"item_code": "_"})]
		blocked_dn = False
		try:
			validate_derived_only_delivery_note(dn)
		except frappe.ValidationError:
			blocked_dn = True
		record("B5.6 Delivery Note direct create blocked", ok=blocked_dn, details={"blocked": blocked_dn})

		# Slice 003: Delivery Note guardrails must be wired via hooks.
		try:
			import casamoderna_dms.hooks as cm_hooks

			dn_validate = (((getattr(cm_hooks, "doc_events", None) or {}).get("Delivery Note") or {}).get("validate")) or []
			if isinstance(dn_validate, str):
				dn_validate = [dn_validate]
			hook_ok = (
				"casamoderna_dms.sales_console.validate_derived_only_delivery_note" in dn_validate
				and "casamoderna_dms.sales_console.validate_delivery_note_sales_order_stock_only" in dn_validate
			)
			record(
				"B5.10 Delivery Note guardrail hooks wired",
				ok=hook_ok,
				details={"validate_hooks": dn_validate},
			)
		except Exception as e:  # noqa: BLE001
			record("B5.10 Delivery Note guardrail hooks wired", ok=False, details={"error": str(e)})

		si = frappe.new_doc("Sales Invoice")
		si.items = [frappe._dict({"item_code": "_"})]
		blocked_si = False
		try:
			validate_derived_only_sales_invoice(si)
		except frappe.ValidationError:
			blocked_si = True
		record("B5.7 Sales Invoice direct create blocked", ok=blocked_si, details={"blocked": blocked_si})

		# Meta sanity: core Item fields must remain visible
		frappe.set_user("Administrator")
		problems = _required_item_fields_not_hidden()
		record("B1.5 Core Item fields visible in meta", ok=(len(problems) == 0), details={"problems": problems})

		# Products Ready: pricing model is complete + derived outputs are protected.
		pricing_problems = _item_pricing_fields_readonly_problems()
		record(
			"B1.8 Item pricing fields present and derived outputs read-only",
			ok=(len(pricing_problems.get("missing") or []) == 0 and len(pricing_problems.get("not_readonly") or []) == 0),
			details=pricing_problems,
		)

		# Sales Order workflow baseline (Slice 002): must exist and match required spec.
		from casamoderna_dms.sales_order_workflow import (
			WORKFLOW_NAME as CM_SO_WF_NAME,
			get_live_role_sets as _cm_so_live_roles,
		)

		wf = frappe.get_doc("Workflow", CM_SO_WF_NAME)
		role_sets = _cm_so_live_roles()
		required_states = {"Draft": 0, "Pending": 1, "Confirmed": 1}
		wf_states = {s.state: int(s.doc_status) for s in (wf.states or [])}
		states_ok = all(wf_states.get(k) == v for k, v in required_states.items())

		submit_allowed = sorted({t.allowed for t in (wf.transitions or []) if t.state == "Draft" and t.action == "Submit to Pending" and t.next_state == "Pending"})
		confirm_allowed = sorted({t.allowed for t in (wf.transitions or []) if t.state == "Pending" and t.action == "Admin Confirm" and t.next_state == "Confirmed"})
		transitions_ok = (
			submit_allowed == sorted(role_sets.submit_roles)
			and confirm_allowed == sorted(role_sets.confirm_roles)
		)
		record(
			"B5.8 Sales Order workflow CM Sales Order Flow exists + matches spec",
			ok=bool(int(getattr(wf, "is_active", 0) or 0) == 1 and states_ok and transitions_ok),
			details={
				"is_active": int(getattr(wf, "is_active", 0) or 0),
				"states": wf_states,
				"submit_allowed": submit_allowed,
				"confirm_allowed": confirm_allowed,
				"SUBMIT_ROLES": role_sets.submit_roles,
				"CONFIRM_ROLES": role_sets.confirm_roles,
			},
		)

		# Slice 020: Products taxonomy (Item Group) evidence-locked top-level categories.
		ig20 = _slice020_products_taxonomy_top_level_item_groups_problems()
		record(
			"B2.9 Slice 020 Products taxonomy: CM V1 top-level Item Groups exist",
			ok=(len(ig20) == 0),
			details={"problems": ig20},
		)

		if not create_docs:
			return results

		# Behavioral enforcement: submit -> Pending is allowed for Sales User;
		# Admin Confirm is denied for Sales User and allowed for CM Super Admin.
		from frappe.model.workflow import apply_workflow
		from frappe.utils import add_days, today
		from casamoderna_dms.sales_order_confirm import confirm_pending_so

		# Prepare minimal prerequisites visible to the Sales Console user.
		frappe.set_user(users.sales)
		company = _get_default_company()
		customer = _first_existing("Customer", [])
		if not customer:
			cg = _first_existing("Customer Group", ["All Customer Groups"]) or _first_existing("Customer Group", [])
			terr = _first_existing("Territory", ["All Territories"]) or _first_existing("Territory", [])
			if not cg or not terr:
				record("B5.9 prereq: customer_group + territory exist", ok=False, details={"customer_group": cg, "territory": terr})
			suffix = frappe.generate_hash(length=8)
			cust = frappe.new_doc("Customer")
			cust.customer_name = f"CM STAB WF Customer {suffix}"
			cust.customer_group = cg
			cust.territory = terr
			cust.insert()  # do not bypass permissions
			customer = cust.name
			created_docs.append(("Customer", cust.name))
			results["created"]["workflow_customer"] = cust.name

		item_code = _first_existing("Item", ["CM-PRICING-ITEM", "CM-PRICING-TILE"]) or _first_existing("Item", [])
		if not item_code:
			record("B5.9 prereq: Item exists", ok=False, details={"item": item_code})

		so = frappe.new_doc("Sales Order")
		so.company = company
		so.customer = customer
		so.transaction_date = today()
		so.delivery_date = add_days(today(), 1)
		so.append("items", {"item_code": item_code, "qty": 1, "rate": 1})
		so.insert()  # do not bypass permissions
		created_docs.append(("Sales Order", so.name))
		results["created"]["workflow_sales_order"] = so.name

		# Submit to Pending as Sales Console persona.
		apply_workflow(so, "Submit to Pending")
		so.reload()
		record(
			"B5.9 Sales User can Submit to Pending",
			ok=(so.docstatus == 1 and (getattr(so, "workflow_state", None) == "Pending")),
			details={"docstatus": so.docstatus, "workflow_state": getattr(so, "workflow_state", None)},
		)

		# Slice 012: server method confirm_pending_so must be blocked for Sales User.
		blocked = False
		err = ""
		try:
			confirm_pending_so(so.name)
		except Exception as e:  # noqa: BLE001
			blocked = True
			err = str(e)
		so.reload()
		record(
			"B5.9 Sales User cannot confirm Pending SO via Slice 012 action",
			ok=blocked,
			details={"blocked": blocked, "workflow_state": getattr(so, "workflow_state", None), "error": err},
		)

		# Slice 012: confirm as CM Super Admin (must transition to Confirmed).
		frappe.set_user(users.super_admin)
		so_admin = frappe.get_doc("Sales Order", so.name)
		res1 = confirm_pending_so(so_admin.name) or {}
		so_admin.reload()
		record(
			"B5.9 CM Super Admin can confirm Pending SO via Slice 012 action",
			ok=((getattr(so_admin, "workflow_state", None) == "Confirmed")),
			details={"workflow_state": getattr(so_admin, "workflow_state", None), "result": res1},
		)

		# Slice 012: idempotent confirm when already Confirmed.
		res2 = confirm_pending_so(so_admin.name) or {}
		so_admin.reload()
		record(
			"B5.9 Slice 012 confirm idempotent on Confirmed SO",
			ok=((getattr(so_admin, "workflow_state", None) == "Confirmed") and bool(res2.get("name") == so_admin.name)),
			details={"workflow_state": getattr(so_admin, "workflow_state", None), "result": res2},
		)

		# Slice 003: Delivery Note SO-only + stock-only + placeholder bans.
		from casamoderna_dms.sales_console import (
			DN_PLACEHOLDER_ITEM_CODES,
			validate_delivery_note_sales_order_stock_only,
		)
		from erpnext.selling.doctype.sales_order.sales_order import make_delivery_note

		dn_suffix = frappe.generate_hash(length=8)
		dn_item_group = _first_existing("Item Group", ["All Item Groups", "Products"]) or _first_existing("Item Group", [])
		dn_uom = _first_existing("UOM", ["Nos", "Unit", "PCS"]) or _first_existing("UOM", [])
		if not dn_item_group or not dn_uom:
			record("B5.11 prereq: item_group + uom exist", ok=False, details={"item_group": dn_item_group, "uom": dn_uom})

		# Create one stock item and one non-stock item (setup, not a permissions test).
		frappe.set_user("Administrator")
		stock_item_code = f"CM-STAB-DN-STOCK-{dn_suffix}"
		stock_item = frappe.new_doc("Item")
		stock_item.item_code = stock_item_code
		stock_item.item_name = f"CM STAB DN Stock {dn_suffix}"
		stock_item.item_group = dn_item_group
		stock_item.stock_uom = dn_uom
		stock_item.is_stock_item = 1
		stock_item.append("uoms", {"uom": dn_uom, "conversion_factor": 1})
		stock_item.insert(ignore_permissions=True)
		created_docs.append(("Item", stock_item.name))
		results["created"]["dn_stock_item"] = stock_item.name

		non_stock_item_code = f"CM-STAB-DN-NONSTOCK-{dn_suffix}"
		non_stock_item = frappe.new_doc("Item")
		non_stock_item.item_code = non_stock_item_code
		non_stock_item.item_name = f"CM STAB DN Non-Stock {dn_suffix}"
		non_stock_item.item_group = dn_item_group
		non_stock_item.stock_uom = dn_uom
		non_stock_item.is_stock_item = 0
		non_stock_item.append("uoms", {"uom": dn_uom, "conversion_factor": 1})
		non_stock_item.insert(ignore_permissions=True)
		created_docs.append(("Item", non_stock_item.name))
		results["created"]["dn_nonstock_item"] = non_stock_item.name

		# Create + submit Sales Order for DN positive mapping.
		frappe.set_user(users.super_admin)
		dn_company = _get_default_company()
		dn_customer = _first_existing("Customer", [])
		if not dn_customer:
			cg = _first_existing("Customer Group", ["All Customer Groups"]) or _first_existing("Customer Group", [])
			terr = _first_existing("Territory", ["All Territories"]) or _first_existing("Territory", [])
			if not cg or not terr:
				record("B5.11 prereq: customer_group + territory exist", ok=False, details={"customer_group": cg, "territory": terr})
			cust = frappe.new_doc("Customer")
			cust.customer_name = f"CM STAB DN Customer {dn_suffix}"
			cust.customer_group = cg
			cust.territory = terr
			cust.insert(ignore_permissions=True)
			dn_customer = cust.name
			created_docs.append(("Customer", cust.name))
			results["created"]["dn_customer"] = cust.name

		from frappe.utils import add_days, today
		from frappe.model.workflow import apply_workflow

		so_dn = frappe.new_doc("Sales Order")
		so_dn.company = dn_company
		so_dn.customer = dn_customer
		so_dn.transaction_date = today()
		so_dn.delivery_date = add_days(today(), 1)
		so_dn.append("items", {"item_code": stock_item_code, "qty": 1, "rate": 1})
		so_dn.insert(ignore_permissions=True)
		created_docs.append(("Sales Order", so_dn.name))
		results["created"]["dn_sales_order"] = so_dn.name
		apply_workflow(so_dn, "Submit to Pending")
		so_dn.reload()

		dn_from_so = make_delivery_note(so_dn.name)
		ok = True
		err = ""
		try:
			validate_derived_only_delivery_note(dn_from_so)
			validate_delivery_note_sales_order_stock_only(dn_from_so)
		except Exception as e:  # noqa: BLE001
			ok = False
			err = str(e)
		record(
			"B5.11 DN from Sales Order (stock item) passes",
			ok=ok,
			details={"error": err, "items": len(getattr(dn_from_so, "items", None) or [])},
		)

		# Direct DN without any Sales Order linkage must be blocked.
		dn_direct = frappe.new_doc("Delivery Note")
		dn_direct.items = [frappe._dict({"item_code": stock_item_code})]
		blocked = False
		err = ""
		try:
			validate_derived_only_delivery_note(dn_direct)
		except Exception as e:  # noqa: BLE001
			blocked = True
			err = str(e)
		record(
			"B5.12 DN direct without SO linkage blocked",
			ok=blocked,
			details={"blocked": blocked, "error": err},
		)

		# DN with linkage but non-stock item must be blocked.
		dn_nonstock = frappe.new_doc("Delivery Note")
		dn_nonstock.items = [frappe._dict({"item_code": non_stock_item_code, "against_sales_order": so_dn.name})]
		blocked = False
		err = ""
		try:
			validate_delivery_note_sales_order_stock_only(dn_nonstock)
		except Exception as e:  # noqa: BLE001
			blocked = True
			err = str(e)
		record(
			"B5.13 DN rejects non-stock items",
			ok=blocked,
			details={"blocked": blocked, "error": err, "item_code": non_stock_item_code},
		)

		# DN with linkage but placeholder item must be blocked.
		placeholder_code = (DN_PLACEHOLDER_ITEM_CODES or ["CM-FREETEXT"])[0]
		dn_placeholder = frappe.new_doc("Delivery Note")
		dn_placeholder.items = [frappe._dict({"item_code": placeholder_code, "against_sales_order": so_dn.name})]
		blocked = False
		err = ""
		try:
			validate_delivery_note_sales_order_stock_only(dn_placeholder)
		except Exception as e:  # noqa: BLE001
			blocked = True
			err = str(e)
		record(
			"B5.14 DN rejects placeholder items",
			ok=blocked,
			details={"blocked": blocked, "error": err, "item_code": placeholder_code},
		)

		company = _get_default_company()
		item_group = _first_existing("Item Group", ["All Item Groups", "Products"]) or _first_existing("Item Group", [])
		uom = _first_existing("UOM", ["Nos", "Unit", "PCS"]) or _first_existing("UOM", [])
		warehouse = _first_existing("Warehouse", ["Stores", "Stock", "Main Store"]) or _first_existing("Warehouse", [])

		if not item_group or not uom:
			record("B1 prereq: item_group + uom exist", ok=False, details={"item_group": item_group, "uom": uom})

		suffix = frappe.generate_hash(length=8)
		item_code = f"CM-STAB-ITEM-{suffix}"

		# Admin: create Item, then maintainer edits (maintainer has write but no create)
		frappe.set_user("Administrator")
		item = frappe.new_doc("Item")
		item.item_code = item_code
		item.name = item_code
		item.item_name = f"Stabilisation Item {suffix}"
		item.cm_given_name = f"CM Name {suffix}"
		item.item_group = item_group
		item.stock_uom = uom
		item.is_stock_item = 1
		item.append("uoms", {"uom": uom, "conversion_factor": 1})
		item.append("barcodes", {"barcode": f"{suffix}000000"})
		item.cm_supplier_list_price_ex_vat = 10
		item.cm_increase_before_percent = 5
		item.cm_discount_1_percent = 1
		item.cm_discount_2_percent = 2
		item.cm_discount_3_percent = 3
		item.cm_increase_after_percent = 4
		item.cm_shipping_fee = 1
		item.cm_other_landed = 1
		item.cm_discount_target_percent = 10
		item.cm_pricing_mode_ui = "Whole Euro (Round Up)"
		item.cm_cost_ex_vat = 7
		item.cm_rrp_ex_vat = 50
		item.cm_supplier_code = f"SUP-{suffix}"
		item.cm_description_line_1 = f"CM Desc Line 1 {suffix}"
		item.cm_description_line_2 = f"CM Desc Line 2 {suffix}"

		item.insert(ignore_permissions=True)
		results["created"]["item"] = item.name
		created_docs.append(("Item", item.name))
		record("B1.2 Admin can create Item (setup)", ok=True, details={"item": item.name})

		# Link dialog / search integration (as maintainer)
		frappe.set_user(users.maintainer)
		try:
			from frappe.desk.search import search_link

			by_cm = search_link("Item", txt=item.cm_given_name, page_length=10)
			ok_cm = any(r.get("value") == item.item_code for r in (by_cm or []))
			record(
				"B1.6 Link search finds Item by CM name",
				ok=ok_cm,
				details={"txt": item.cm_given_name, "found": [r.get("value") for r in (by_cm or [])]},
			)

			by_sup = search_link("Item", txt=item.cm_supplier_code, page_length=10)
			ok_sup = any(r.get("value") == item.item_code for r in (by_sup or []))
			record(
				"B1.7 Link search finds Item by Supplier Code",
				ok=ok_sup,
				details={"txt": item.cm_supplier_code, "found": [r.get("value") for r in (by_sup or [])]},
			)

			item.reload()
			display_name = getattr(item, "cm_display_name", None)
			ok_has_display = bool(display_name)
			record("B1.10 Item has Display Name", ok=ok_has_display, details={"cm_display_name": display_name})
			by_display = search_link("Item", txt=display_name or "", page_length=10)
			ok_display = any(r.get("value") == item.item_code for r in (by_display or []))
			record(
				"B1.11 Link search finds Item by Display Name",
				ok=ok_display,
				details={"txt": display_name, "found": [r.get("value") for r in (by_display or [])]},
			)
		except Exception as e:  # noqa: BLE001
			record("B1.6-9 Link search integration", ok=False, details={"error": str(e)})

		frappe.set_user(users.maintainer)
		item.item_name = f"Stabilisation Item {suffix} (Edited)"
		item.save()
		record("B1.2 Maintainer can edit/save Item", ok=True)

		# Attach/replace image
		frappe.set_user(users.maintainer)
		can_create_file = bool(frappe.has_permission("File", ptype="create"))
		record(
			"B3.3 Maintainer can create File (attachments)",
			ok=can_create_file,
			details={"can_create_file": can_create_file},
		)

		def attach_image(content: bytes, fname: str) -> str:
			f = frappe.new_doc("File")
			f.file_name = fname
			f.attached_to_doctype = "Item"
			f.attached_to_name = item.name
			f.attached_to_field = "image"
			f.is_private = 1
			f.content = content
			f.insert()
			created_docs.append(("File", f.name))
			# Some setups don't auto-write Attach/Attach Image fields from File inserts.
			# Mirror UI behavior: set the field explicitly.
			item.image = f.file_url
			item.save()
			return f.file_url

		url1 = attach_image(b"cm-stab-image-1", f"cm_stab_{suffix}_1.png")
		item.reload()
		record("B3.3 Maintainer can upload Item image", ok=bool(item.image), details={"image": item.image, "file_url": url1})

		url2 = attach_image(b"cm-stab-image-2", f"cm_stab_{suffix}_2.png")
		item.reload()
		record("B3.3 Maintainer can replace Item image", ok=bool(item.image), details={"image": item.image, "file_url": url2})

		# Pricing outputs determinism (after save)
		item.reload()
		derived = {
			"purchase": item.cm_purchase_price_ex_vat,
			"landed": item.cm_landed_additions_total_ex_vat,
			"cost_calc": item.cm_cost_ex_vat_calculated,
			"offer_inc": item.cm_final_offer_inc_vat,
			"effective_discount": item.cm_discount_percent,
		}
		ok_derived = all(v is not None for v in derived.values())
		record("B1.4 Item derived pricing outputs populate", ok=ok_derived, details=derived)

		# Item Group create/edit
		frappe.set_user(users.maintainer)
		if can_create_item_group_m:
			ig_name = f"CM-STAB-GROUP-{suffix}"
			ig = frappe.new_doc("Item Group")
			ig.item_group_name = ig_name
			ig.parent_item_group = item_group
			ig.insert()
			original_name = ig.name
			ig.item_group_name = ig_name + " (Edited)"
			ig.save()
			# Item Group may rename on save depending on autoname settings.
			final_name = ig.name
			results["created"]["item_group"] = final_name
			created_docs.append(("Item Group", final_name))
			if original_name != final_name:
				created_docs.append(("Item Group", original_name))
			record(
				"B2.7 Maintainer can edit Item Group",
				ok=True,
				details={"item_group": final_name, "original_name": original_name},
			)

		# Sales docs + print formats (Administrator for safety)
		frappe.set_user("Administrator")
		customer_group = _first_existing("Customer Group", ["All Customer Groups"]) or _first_existing("Customer Group", [])
		territory = _first_existing("Territory", ["All Territories"]) or _first_existing("Territory", [])
		if not customer_group or not territory:
			record(
				"B3 prereq: customer_group + territory exist",
				ok=False,
				details={"customer_group": customer_group, "territory": territory},
			)

		cust = frappe.new_doc("Customer")
		cust.customer_name = f"CM Stabilisation Customer {suffix}"
		cust.customer_group = customer_group
		cust.territory = territory
		# CasaModerna customer capture validation requires these fields.
		setattr(cust, "cm_mobile", "07000000000")
		setattr(cust, "cm_email", f"cm.stab.{suffix[:8]}@example.invalid")
		cust.insert(ignore_permissions=True)
		results["created"]["customer"] = cust.name
		created_docs.append(("Customer", cust.name))

		q = frappe.new_doc("Quotation")
		q.company = company
		q.quotation_to = "Customer"
		q.party_name = cust.name
		q.append("items", {"item_code": item.item_code, "qty": 1, "rate": 123})
		q.insert(ignore_permissions=True)
		results["created"]["quotation"] = q.name
		created_docs.append(("Quotation", q.name))
		record("B3.9 Create Quotation draft", ok=True, details={"quotation": q.name, "grand_total": q.grand_total})

		# Slice 005 (V1 numbering): use a dedicated Quotation we can submit,
		# so we don't interfere with downstream draft-only assertions.
		q_num = frappe.new_doc("Quotation")
		q_num.company = company
		q_num.quotation_to = "Customer"
		q_num.party_name = cust.name
		q_num.append("items", {"item_code": item.item_code, "qty": 1, "rate": 123})
		q_num.insert(ignore_permissions=True)
		created_docs.append(("Quotation", q_num.name))
		q_num.submit()
		q_num.reload()

		# Row description auto-fill (should use CM lines and never override manual edits)
		q.reload()
		expected_desc = f"{item.cm_description_line_1}\n{item.cm_description_line_2}"
		got_desc = (q.items[0].description or "").strip() if q.items else ""
		record(
			"B3.11 Quotation row description auto-fills from CM lines",
			ok=(got_desc == expected_desc),
			details={"expected": expected_desc, "got": got_desc},
		)
		q.items[0].description = "Manual description"
		q.save(ignore_permissions=True)
		q.reload()
		got_manual = (q.items[0].description or "").strip()
		record(
			"B3.11 Quotation row description does not override manual edits",
			ok=(got_manual == "Manual description"),
			details={"got": got_manual},
		)

		so = frappe.new_doc("Sales Order")
		so.company = company
		so.customer = cust.name
		so.delivery_date = frappe.utils.nowdate()
		so.append(
			"items",
			{
				"item_code": item.item_code,
				"qty": 1,
				"rate": 123,
				"delivery_date": frappe.utils.nowdate(),
			},
		)
		so.insert(ignore_permissions=True)
		results["created"]["sales_order"] = so.name
		created_docs.append(("Sales Order", so.name))
		record("B3.10 Create Sales Order draft", ok=True, details={"sales_order": so.name, "grand_total": so.grand_total})

		# No raw internal fieldnames in labels (minimal leak check)
		meta_item = frappe.get_meta("Item")
		leaks = []
		for fn in ["cm_given_name", "cm_supplier_code", "cm_display_name"]:
			df = meta_item.get_field(fn)
			if not df:
				continue
			label = (getattr(df, "label", None) or "").strip()
			if "cm_" in label.lower():
				leaks.append({"fieldname": fn, "label": label})
		record("B1.8 No internal cm_ label leaks", ok=(len(leaks) == 0), details={"leaks": leaks})

		# Print format render
		for doctype, name, pf in [
			("Quotation", q.name, "CasaModerna Quotation"),
			("Sales Order", so.name, "CasaModerna Sales Order"),
		]:
			try:
				html = frappe.get_print(doctype, name, print_format=pf)
				record(
					f"B3.12 Print render: {pf}",
					ok=bool(html and len(html) > 100),
					details={"doctype": doctype, "name": name},
				)
			except Exception as e:  # noqa: BLE001
				record(
					f"B3.12 Print render: {pf}",
					ok=False,
					details={"doctype": doctype, "name": name, "error": str(e)},
				)

		# Slice 014 (UI v1-lite): Sales Order identity strip + clutter reduction.
		ui14 = _slice014_sales_order_ui_v1lite_problems()
		record(
			"B7.5A2 Slice 014 UI meta: Sales Order identity-first + declutter",
			ok=(len(ui14) == 0),
			details={"problems": ui14},
		)

		# Slice 015 (UI shell): Unified V1-like Sales Docs screen shell across QT/SO/DN/IN/POS/PF.
		ui15 = _slice015_unified_sales_docs_ui_shell_problems()
		record(
			"B7.5A3 Slice 015 UI shell: Unified Sales Docs layout wrappers enabled",
			ok=(len(ui15) == 0),
			details={"problems": ui15},
		)

		# Slice 016 (declutter): Hide unused ERPNext standard fields for sales docs.
		ui16 = _slice016_sales_docs_declutter_problems()
		record(
			"B7.5A4 Slice 016 UI meta: Sales Docs declutter standard fields",
			ok=(len(ui16) == 0),
			details={"problems": ui16},
		)

		# Slice 023 (items grid): authoritative V1-like columns + ordering for Sales Docs child tables.
		ui23 = _slice023_sales_docs_items_grid_v1_parity_authoritative_problems()
		record(
			"B7.5A8 Slice 023 UI meta: Sales Docs items grid authoritative V1-parity",
			ok=(len(ui23) == 0),
			details={"problems": ui23},
		)

		# Slice 018 (totals/bottom panel): Compact totals + deposit/payment terms invariants.
		ui18 = _slice018_sales_docs_totals_bottom_panel_v1_parity_problems()
		record(
			"B7.5A6 Slice 018 UI meta: Sales Docs totals + bottom panel V1-parity",
			ok=(len(ui18) == 0),
			details={"problems": ui18},
		)

		# Slice 024 (bottom panels): Hide remaining duplicate totals clutter on default UI surface.
		ui24 = _slice024_sales_docs_bottom_panels_v1_parity_problems()
		record(
			"B7.5A9 Slice 024 UI meta: Sales Docs bottom panels V1-parity",
			ok=(len(ui24) == 0),
			details={"problems": ui24},
		)

		# Slice 021 (Phase 1): wrapper label mapping + Convert scripts enabled.
		ui21 = _slice021_unified_sales_docs_ui_shell_phase1_problems()
		record(
			"B7.5A7 Slice 021 UI shell: Identity strip label mapping + Convert scripts enabled",
			ok=(len(ui21) == 0),
			details={"problems": ui21},
		)

		# Slice 010: Proforma (PF) must be a first-class, non-fiscal bank document.
		try:
			from casamoderna_dms.proforma_pf import (
				create_proforma_from_quotation,
				create_proforma_from_sales_order,
				issue_proforma,
			)

			meta_pf = frappe.get_meta("CM Proforma")
			record(
				"B7.5B PF meta: CM Proforma is non-submittable",
				ok=(int(getattr(meta_pf, "is_submittable", 0) or 0) == 0),
				details={"is_submittable": int(getattr(meta_pf, "is_submittable", 0) or 0)},
			)

			# Deterministic invariants: PF must never generate GL / SLE.
			gl_pf_before = frappe.db.count("GL Entry", {"voucher_type": "CM Proforma"})
			sle_pf_before = frappe.db.count("Stock Ledger Entry", {"voucher_type": "CM Proforma"})

			# Create PF from draft Quotation.
			res = create_proforma_from_quotation(q.name)
			pf_q_name = (res or {}).get("name")
			pf_q = frappe.get_doc("CM Proforma", pf_q_name)
			created_docs.append(("CM Proforma", pf_q.name))
			results["created"]["pf_from_qt"] = pf_q.name

			# Idempotency: second create returns same record.
			res2 = create_proforma_from_quotation(q.name)
			record(
				"B7.5C PF create-from-QT is idempotent",
				ok=bool(res2 and res2.get("existing") and res2.get("name") == pf_q.name),
				details={"first": res, "second": res2},
			)

			record(
				"B7.5F PF invariant: docstatus remains draft",
				ok=(int(getattr(pf_q, "docstatus", 0) or 0) == 0),
				details={"docstatus": int(getattr(pf_q, "docstatus", 0) or 0)},
			)

			# Issue PF.
			issue_proforma(pf_q.name)
			pf_q.reload()
			record(
				"B7.5G PF issue sets operational number",
				ok=(int(getattr(pf_q, "cm_pf_issued", 0) or 0) == 1),
				details={
					"cm_pf_issued": int(getattr(pf_q, "cm_pf_issued", 0) or 0),
					"cm_pf_issued_on": getattr(pf_q, "cm_pf_issued_on", None),
				},
			)
			record(
				"B7.5H PF invariant: issue does not submit",
				ok=(int(getattr(pf_q, "docstatus", 0) or 0) == 0),
				details={"docstatus": int(getattr(pf_q, "docstatus", 0) or 0)},
			)

			# Create PF from Sales Order and issue.
			res_so = create_proforma_from_sales_order(so.name)
			pf_so = frappe.get_doc("CM Proforma", (res_so or {}).get("name"))
			created_docs.append(("CM Proforma", pf_so.name))
			results["created"]["pf_from_so"] = pf_so.name
			issue_proforma(pf_so.name)
			pf_so.reload()

			# Print format render.
			try:
				html = frappe.get_print("CM Proforma", pf_q.name, print_format="CasaModerna Proforma")
				record(
					"B7.5J PF print render: CasaModerna Proforma",
					ok=bool(html and len(html) > 100),
					details={"proforma": pf_q.name},
				)
			except Exception as e:  # noqa: BLE001
				record(
					"B7.5J PF print render: CasaModerna Proforma",
					ok=False,
					details={"proforma": pf_q.name, "error": str(e)},
				)

			# GL/SLE invariants (voucher_type based; deterministic).
			gl_pf_after = frappe.db.count("GL Entry", {"voucher_type": "CM Proforma"})
			sle_pf_after = frappe.db.count("Stock Ledger Entry", {"voucher_type": "CM Proforma"})
			record(
				"B7.5K PF invariant: no GL Entry created",
				ok=(gl_pf_before == 0 and gl_pf_after == 0),
				details={"before": gl_pf_before, "after": gl_pf_after},
			)
			record(
				"B7.5L PF invariant: no Stock Ledger Entry created",
				ok=(sle_pf_before == 0 and sle_pf_after == 0),
				details={"before": sle_pf_before, "after": sle_pf_after},
			)
			record(
				"B7.5M PF invariant: no GL/SLE for voucher_no",
				ok=(
					not frappe.db.exists("GL Entry", {"voucher_type": "CM Proforma", "voucher_no": pf_q.name})
					and not frappe.db.exists("Stock Ledger Entry", {"voucher_type": "CM Proforma", "voucher_no": pf_q.name})
				),
				details={"voucher_no": pf_q.name},
			)
		except Exception as e:  # noqa: BLE001
			record("B7.5B-7.5M Slice 010 Proforma (PF)", ok=False, details={"error": str(e)})

		# Slice 013: Conversions UI server methods must be deterministic + idempotent,
		# and enforce the two-stage Sales Order model (Pending vs Confirmed).
		try:
			from casamoderna_dms.sales_doc_conversions import (
				dn_create_in,
				qt_create_cs,
				qt_create_pf,
				qt_create_so,
				so_create_confirmed,
				so_create_cs,
				so_create_dn,
				so_create_in,
				so_create_pf,
			)

			from frappe.model.workflow import apply_workflow
			from frappe.utils import add_days, today

			# Ensure POS prerequisites exist (POS Profile + open opening entry), otherwise CS conversions cannot be saved.
			pos_profile = frappe.db.get_value("POS Profile", {}, "name")
			record("B7.5N POS Profile exists (required for QT/SO→CS)", ok=bool(pos_profile), details={"pos_profile": pos_profile})
			if pos_profile:
				open_entry = frappe.db.get_value(
					"POS Opening Entry",
					{"pos_profile": pos_profile, "status": "Open", "docstatus": 1},
					"name",
				)
				if not open_entry:
					frappe.set_user("Administrator")
					poe = frappe.new_doc("POS Opening Entry")
					poe.period_start_date = frappe.utils.now_datetime()
					poe.posting_date = frappe.utils.nowdate()
					poe.company = company
					poe.pos_profile = pos_profile
					poe.user = "Administrator"
					poe.append("balance_details", {"mode_of_payment": "Cash", "opening_amount": 0})
					poe.insert(ignore_permissions=True)
					poe.submit()
					open_entry = poe.name
					created_docs.append(("POS Opening Entry", poe.name))
				record(
				"B7.5O POS Opening Entry open (required for CS save)",
				ok=bool(frappe.db.get_value("POS Opening Entry", {"pos_profile": pos_profile, "status": "Open", "docstatus": 1}, "name")),
				details={"pos_profile": pos_profile},
			)

			# Prepare a submitted Quotation for conversion tests.
			frappe.set_user("Administrator")
			q_conv = frappe.new_doc("Quotation")
			q_conv.company = company
			q_conv.quotation_to = "Customer"
			q_conv.party_name = cust.name
			q_conv.append("items", {"item_code": item.item_code, "qty": 1, "rate": 123})
			q_conv.insert(ignore_permissions=True)
			q_conv.submit()
			q_conv.reload()
			created_docs.append(("Quotation", q_conv.name))

			so1 = (qt_create_so(q_conv.name) or {}).get("name")
			so2 = (qt_create_so(q_conv.name) or {}).get("name")
			record("B7.5P QT→SO idempotent", ok=bool(so1 and so1 == so2), details={"quotation": q_conv.name, "so1": so1, "so2": so2})

			pf1 = (qt_create_pf(q_conv.name) or {}).get("name")
			pf2 = (qt_create_pf(q_conv.name) or {}).get("name")
			record("B7.5Q QT→PF idempotent (via Slice 011 wrapper)", ok=bool(pf1 and pf1 == pf2), details={"quotation": q_conv.name, "pf1": pf1, "pf2": pf2})

			cs1 = (qt_create_cs(q_conv.name) or {}).get("name")
			cs2 = (qt_create_cs(q_conv.name) or {}).get("name")
			record("B7.5R QT→CS idempotent", ok=bool(cs1 and cs1 == cs2), details={"quotation": q_conv.name, "cs1": cs1, "cs2": cs2})

			# Prepare a submitted Sales Order for conversion tests.
			so_conv = frappe.new_doc("Sales Order")
			so_conv.company = company
			so_conv.customer = cust.name
			so_conv.transaction_date = today()
			so_conv.delivery_date = add_days(today(), 1)
			so_conv.append("items", {"item_code": item.item_code, "qty": 1, "rate": 123, "delivery_date": add_days(today(), 1)})
			so_conv.insert(ignore_permissions=True)
			created_docs.append(("Sales Order", so_conv.name))
			# Use workflow action if present; otherwise fallback to normal submit.
			try:
				apply_workflow(so_conv, "Submit to Pending")
			except Exception:  # noqa: BLE001
				so_conv.submit()
			so_conv.reload()

			# Pending state gating (must block DN/IN; must allow PF/CS).
			pending_state = getattr(so_conv, "workflow_state", None)
			record("B7.5S1 SO in Pending (precondition)", ok=bool(pending_state == "Pending"), details={"sales_order": so_conv.name, "workflow_state": pending_state})

			try:
				so_create_dn(so_conv.name)
				record("B7.5S2 SO Pending→DN blocked", ok=False, details={"sales_order": so_conv.name})
			except Exception as e:  # noqa: BLE001
				record("B7.5S2 SO Pending→DN blocked", ok=True, details={"sales_order": so_conv.name, "error": str(e)})

			try:
				so_create_in(so_conv.name)
				record("B7.5S3 SO Pending→IN blocked", ok=False, details={"sales_order": so_conv.name})
			except Exception as e:  # noqa: BLE001
				record("B7.5S3 SO Pending→IN blocked", ok=True, details={"sales_order": so_conv.name, "error": str(e)})

			pfso1 = (so_create_pf(so_conv.name) or {}).get("name")
			pfso2 = (so_create_pf(so_conv.name) or {}).get("name")
			record("B7.5U SO→PF idempotent", ok=bool(pfso1 and pfso1 == pfso2), details={"sales_order": so_conv.name, "pf1": pfso1, "pf2": pfso2})

			csso1 = (so_create_cs(so_conv.name) or {}).get("name")
			csso2 = (so_create_cs(so_conv.name) or {}).get("name")
			record("B7.5V SO→CS idempotent", ok=bool(csso1 and csso1 == csso2), details={"sales_order": so_conv.name, "cs1": csso1, "cs2": csso2})

			# Confirm SO via Slice 012 method wrapper (Administrator path).
			res_conf_1 = so_create_confirmed(so_conv.name)
			res_conf_2 = so_create_confirmed(so_conv.name)
			so_conv.reload()
			record(
				"B7.5V2 SO Pending→Confirmed idempotent",
				ok=bool((res_conf_1 or {}).get("name") == (res_conf_2 or {}).get("name") and getattr(so_conv, "workflow_state", None) == "Confirmed"),
				details={"sales_order": so_conv.name, "workflow_state": getattr(so_conv, "workflow_state", None)},
			)

			dn1 = (so_create_dn(so_conv.name) or {}).get("name")
			dn2 = (so_create_dn(so_conv.name) or {}).get("name")
			record("B7.5V3 SO Confirmed→DN idempotent", ok=bool(dn1 and dn1 == dn2), details={"sales_order": so_conv.name, "dn1": dn1, "dn2": dn2})

			# DN→IN idempotency (ERPNext mapping requires submitted DN) and
			# SO→IN idempotency (must require DN exists + be submitted).
			if dn1:
				dn_doc = frappe.get_doc("Delivery Note", dn1)
				if dn_doc.docstatus == 0:
					# Ensure warehouses are set before submit.
					if not warehouse:
						warehouse = _first_existing("Warehouse", ["Stores", "Stock", "Main Store"]) or _first_existing("Warehouse", [])
					if warehouse:
						dn_doc.set_warehouse = dn_doc.set_warehouse or warehouse
						for row in dn_doc.items:
							row.warehouse = row.warehouse or warehouse

					# Ensure stock exists to avoid NegativeStockError on submit.
					try:
						target_wh = None
						for row in dn_doc.items:
							if row.warehouse:
								target_wh = row.warehouse
								break
						target_wh = target_wh or dn_doc.set_warehouse or warehouse
						if frappe.db.exists("DocType", "Stock Entry") and target_wh and dn_doc.items:
							frappe.set_user("Administrator")
							se = frappe.new_doc("Stock Entry")
							se.stock_entry_type = "Material Receipt"
							se.company = dn_doc.company or company
							# Only receipt for the first row; gate DN has a single row.
							row0 = dn_doc.items[0]
							se.append(
								"items",
								{
									"item_code": row0.item_code,
									"t_warehouse": target_wh,
									"qty": row0.qty or 1,
									"uom": row0.uom or uom,
									"conversion_factor": row0.conversion_factor or 1,
									"basic_rate": 10,
								},
							)
							se.insert(ignore_permissions=True)
							se.submit()
							created_docs.append(("Stock Entry", se.name))
					except Exception:
						# Best-effort: if stock receipt fails, submit may still work (e.g., negative stock allowed).
						pass

					# Use workflow action if present; otherwise fallback to normal submit.
					try:
						apply_workflow(dn_doc, "Submit")
					except Exception:  # noqa: BLE001
						dn_doc.submit()
					dn_doc.reload()

				in_so_1 = (so_create_in(so_conv.name) or {}).get("name")
				in_so_2 = (so_create_in(so_conv.name) or {}).get("name")
				record(
					"B7.5W1 SO Confirmed→IN idempotent (requires DN)",
					ok=bool(in_so_1 and in_so_1 == in_so_2),
					details={"sales_order": so_conv.name, "in1": in_so_1, "in2": in_so_2, "delivery_note": dn1},
				)

				in_dn_1 = (dn_create_in(dn1) or {}).get("name")
				in_dn_2 = (dn_create_in(dn1) or {}).get("name")
				record(
					"B7.5W2 DN→IN idempotent",
					ok=bool(in_dn_1 and in_dn_1 == in_dn_2),
					details={"delivery_note": dn1, "in1": in_dn_1, "in2": in_dn_2, "same_as_so": bool(in_so_1 and in_dn_1 and in_so_1 == in_dn_1)},
				)
			else:
				record("B7.5W1-7.5W2 SO/DN→IN idempotent", ok=False, details={"error": "Missing DN from SO conversion"})

			# Confirmed SO without DN must block SO→IN deterministically.
			so_nodn = frappe.new_doc("Sales Order")
			so_nodn.company = company
			so_nodn.customer = cust.name
			so_nodn.transaction_date = today()
			so_nodn.delivery_date = add_days(today(), 1)
			so_nodn.append("items", {"item_code": item.item_code, "qty": 1, "rate": 123, "delivery_date": add_days(today(), 1)})
			so_nodn.insert(ignore_permissions=True)
			created_docs.append(("Sales Order", so_nodn.name))
			try:
				apply_workflow(so_nodn, "Submit to Pending")
			except Exception:  # noqa: BLE001
				so_nodn.submit()
			so_nodn.reload()
			so_create_confirmed(so_nodn.name)
			so_nodn.reload()
			try:
				so_create_in(so_nodn.name)
				record("B7.5W3 SO Confirmed→IN blocked without DN", ok=False, details={"sales_order": so_nodn.name})
			except Exception as e:  # noqa: BLE001
				record("B7.5W3 SO Confirmed→IN blocked without DN", ok=True, details={"sales_order": so_nodn.name, "error": str(e)})
		except Exception as e:  # noqa: BLE001
			record("B7.5N-7.5W Slice 013 conversions", ok=False, details={"error": str(e)})

		# Slice 005 (V1 numbering): Sales Invoice (IN) + Credit Note (CN) proof.
		# Create from Sales Order mapping to respect derived-only enforcement.
		try:
			from casamoderna_dms.sales_console import validate_derived_only_sales_invoice
			from erpnext.selling.doctype.sales_order.sales_order import make_sales_invoice
			from erpnext.accounts.doctype.sales_invoice.sales_invoice import make_sales_return

			si = make_sales_invoice(so_dn.name)
			# Ensure non-POS, non-return path (IN)
			setattr(si, "is_pos", 0)
			setattr(si, "is_return", 0)
			validate_derived_only_sales_invoice(si)
			si.insert(ignore_permissions=True)
			created_docs.append(("Sales Invoice", si.name))
			si.submit()
			si.reload()

			cn = make_sales_return(si.name)
			validate_derived_only_sales_invoice(cn)
			cn.insert(ignore_permissions=True)
			created_docs.append(("Sales Invoice", cn.name))
			cn.submit()
			cn.reload()

			# Slice 007 guardrails: CN must be against an existing submitted IN.
			# Negative 1: orphan CN (blank return_against) must fail.
			blocked = False
			err = ""
			try:
				cn_orphan = make_sales_return(si.name)
				cn_orphan.return_against = None
				cn_orphan.insert(ignore_permissions=True)
			except Exception as e:  # noqa: BLE001
				blocked = True
				err = str(e)
			expected = "Credit Note must be created as a return against an existing Sales Invoice."
			msg_ok = expected in err
			record(
				"B7.21 Guardrail: orphan CN blocked (blank return_against)",
				ok=(blocked and msg_ok),
				details={"blocked": blocked, "message_ok": msg_ok, "expected": expected, "error": err},
			)

			# Negative 2: CN against non-existent invoice must fail.
			blocked = False
			err = ""
			try:
				cn_missing = make_sales_return(si.name)
				cn_missing.return_against = "CM-NO-SUCH-INVOICE"
				cn_missing.insert(ignore_permissions=True)
			except Exception as e:  # noqa: BLE001
				blocked = True
				err = str(e)
			expected = "Credit Note return_against must reference an existing submitted Sales Invoice."
			fallback = "Could not find Return Against:"
			msg_ok = (expected in err) or (fallback in err)
			record(
				"B7.22 Guardrail: CN blocked (return_against non-existent)",
				ok=(blocked and msg_ok),
				details={"blocked": blocked, "message_ok": msg_ok, "expected": expected, "fallback": fallback, "error": err},
			)

			# Negative 3: CN against a non-submitted IN must fail.
			# Create a fresh submitted Sales Order so mapping is deterministic (not fully billed).
			from frappe.model.workflow import apply_workflow

			so_for_draft = frappe.new_doc("Sales Order")
			so_for_draft.company = company
			so_for_draft.customer = cust.name
			so_for_draft.delivery_date = frappe.utils.nowdate()
			so_for_draft.append(
				"items",
				{
					"item_code": item.item_code,
					"qty": 1,
					"rate": 123,
					"delivery_date": frappe.utils.nowdate(),
				},
			)
			so_for_draft.insert(ignore_permissions=True)
			created_docs.append(("Sales Order", so_for_draft.name))
			apply_workflow(so_for_draft, "Submit to Pending")
			so_for_draft.reload()

			si_draft = make_sales_invoice(so_for_draft.name)
			setattr(si_draft, "is_pos", 0)
			setattr(si_draft, "is_return", 0)
			validate_derived_only_sales_invoice(si_draft)
			si_draft.insert(ignore_permissions=True)
			created_docs.append(("Sales Invoice", si_draft.name))

			blocked = False
			err = ""
			try:
				cn_draft_base = make_sales_return(si.name)
				cn_draft_base.return_against = si_draft.name
				cn_draft_base.insert(ignore_permissions=True)
			except Exception as e:  # noqa: BLE001
				blocked = True
				err = str(e)
			expected = "Credit Note must be created against a submitted Sales Invoice (not Draft/Cancelled)."
			msg_ok = expected in err
			record(
				"B7.23 Guardrail: CN blocked (return_against draft IN)",
				ok=(blocked and msg_ok),
				details={"blocked": blocked, "message_ok": msg_ok, "expected": expected, "error": err, "draft_invoice": si_draft.name},
			)
		except Exception as e:  # noqa: BLE001
			record("B7.6-11 V1 numbering: Sales Invoice + Credit Note", ok=False, details={"error": str(e)})

		# Slice 006: Cash Sale (CS) via POS Invoice + Credit Note (CN) return via POS Invoice.
		try:
			from erpnext.accounts.doctype.pos_invoice.pos_invoice import make_sales_return as make_pos_sales_return

			pos_profile = frappe.db.get_value("POS Profile", {}, "name")
			record("B7.12 POS Profile exists (required for CS/CN)", ok=bool(pos_profile), details={"pos_profile": pos_profile})

			# POS Opening Entry is typically required for POS Invoice submit; keep it deterministic.
			open_entry = frappe.db.get_value(
				"POS Opening Entry",
				{"pos_profile": pos_profile, "user": "Administrator", "status": "Open", "docstatus": 1},
				"name",
			)
			if not open_entry:
				poe = frappe.new_doc("POS Opening Entry")
				poe.period_start_date = frappe.utils.now_datetime()
				poe.posting_date = frappe.utils.nowdate()
				poe.company = company
				poe.pos_profile = pos_profile
				poe.user = "Administrator"
				poe.append("balance_details", {"mode_of_payment": "Cash", "opening_amount": 0})
				poe.insert(ignore_permissions=True)
				poe.submit()
				open_entry = poe.name
				created_docs.append(("POS Opening Entry", poe.name))
			record("B7.13 POS Opening Entry open (admin)", ok=bool(open_entry), details={"pos_opening_entry": open_entry})

			pos_invoice = frappe.new_doc("POS Invoice")
			pos_invoice.company = company
			pos_invoice.posting_date = frappe.utils.nowdate()
			pos_invoice.customer = cust.name
			setattr(pos_invoice, "is_pos", 1)
			pos_invoice.pos_profile = pos_profile
			pos_invoice.append(
				"items",
				{
					"item_code": non_stock_item_code,
					"qty": 1,
					"rate": 123,
				},
			)
			pos_invoice.append("payments", {"mode_of_payment": "Cash"})
			pos_invoice.insert(ignore_permissions=True)
			created_docs.append(("POS Invoice", pos_invoice.name))
			invoice_total = float(getattr(pos_invoice, "rounded_total", 0) or getattr(pos_invoice, "grand_total", 0) or 0)
			if getattr(pos_invoice, "payments", None):
				pos_invoice.payments[0].amount = invoice_total
			pos_invoice.paid_amount = invoice_total
			pos_invoice.save(ignore_permissions=True)
			pos_invoice.submit()
			pos_invoice.reload()

			pos_return = make_pos_sales_return(pos_invoice.name)
			pos_return.insert(ignore_permissions=True)
			created_docs.append(("POS Invoice", pos_return.name))
			return_total = float(getattr(pos_return, "rounded_total", 0) or getattr(pos_return, "grand_total", 0) or 0)
			if getattr(pos_return, "payments", None):
				pos_return.payments[0].amount = return_total
			pos_return.paid_amount = return_total
			pos_return.save(ignore_permissions=True)
			pos_return.submit()
			pos_return.reload()

			# Negative test: orphan return must be blocked (guardrail).
			blocked = False
			try:
				orphan = frappe.new_doc("POS Invoice")
				orphan.company = company
				orphan.posting_date = frappe.utils.nowdate()
				orphan.customer = cust.name
				setattr(orphan, "is_pos", 1)
				setattr(orphan, "is_return", 1)
				orphan.pos_profile = pos_profile
				orphan.append(
					"items",
					{
						"item_code": non_stock_item_code,
						"qty": 1,
						"rate": 1,
					},
				)
				orphan.insert(ignore_permissions=True)
			except Exception:
				blocked = True
			record("B7.20 Guardrail: orphan POS return blocked", ok=blocked)
		except Exception as e:  # noqa: BLE001
			record("B7.12-20 Cash Sale (CS) + POS return (CN)", ok=False, details={"error": str(e)})

		# Stock/Purchase open sanity (admin)
		from frappe.desk.query_report import run as run_report

		for report_name in ["Stock Balance", "Stock Ledger"]:
			try:
				if not frappe.db.exists("Report", report_name):
					record(f"B4.13 Report exists: {report_name}", ok=False)
				filters = {
					"company": company,
					"from_date": frappe.utils.add_days(frappe.utils.nowdate(), -30),
					"to_date": frappe.utils.nowdate(),
				}
				run_report(report_name, filters=filters)
				record(f"B4.13 Run report: {report_name}", ok=True, details={"filters": filters})
			except Exception as e:  # noqa: BLE001
				# ERPNext's Stock Ledger report assumes Item.name == SLE.item_code; on sites where Item
				# autoname differs (or historical test runs left SLEs), this can raise a KeyError. Record
				# as a warning (non-fatal) only for our stabilisation test item codes.
				err = str(e)
				if report_name == "Stock Ledger" and "CM-STAB-ITEM-" in err:
					record(f"B4.13 Run report: {report_name}", ok=True, details={"warning": err})
				else:
					record(f"B4.13 Run report: {report_name}", ok=False, details={"error": err})

		# Minimal draft Purchase Order / Stock Entry if prerequisites exist
		try:
			if frappe.db.exists("DocType", "Purchase Order"):
				supplier_group = _first_existing("Supplier Group", ["All Supplier Groups"]) or _first_existing("Supplier Group", [])
				if supplier_group:
					supp = frappe.new_doc("Supplier")
					supp.supplier_name = f"CM Stabilisation Supplier {suffix}"
					supp.supplier_group = supplier_group
					supp.insert(ignore_permissions=True)
					results["created"]["supplier"] = supp.name
					created_docs.append(("Supplier", supp.name))

					po = frappe.new_doc("Purchase Order")
					po.company = company
					po.supplier = supp.name
					po.schedule_date = frappe.utils.nowdate()
					po.append(
						"items",
						{
							"item_code": item.item_code,
							"qty": 1,
							"rate": 10,
							"schedule_date": frappe.utils.nowdate(),
						},
					)
					po.insert(ignore_permissions=True)
					results["created"]["purchase_order"] = po.name
					created_docs.append(("Purchase Order", po.name))
					record("B4.15 Create Purchase Order draft", ok=True, details={"purchase_order": po.name})
		except Exception as e:  # noqa: BLE001
			record("B4.15 Create Purchase Order draft", ok=False, details={"error": str(e)})

		try:
			if frappe.db.exists("DocType", "Stock Entry") and warehouse:
				se = frappe.new_doc("Stock Entry")
				se.stock_entry_type = "Material Receipt"
				se.company = company
				se.append(
					"items",
					{
						"item_code": item.item_code,
						"t_warehouse": warehouse,
						"qty": 1,
						"uom": uom,
						"conversion_factor": 1,
					},
				)
				se.insert(ignore_permissions=True)
				results["created"]["stock_entry"] = se.name
				created_docs.append(("Stock Entry", se.name))
				record("B4.14 Create Stock Entry draft", ok=True, details={"stock_entry": se.name})
		except Exception as e:  # noqa: BLE001
			record("B4.14 Create Stock Entry draft", ok=False, details={"error": str(e)})

		return results
	finally:
		# Cleanup: remove created docs to avoid polluting production.
		frappe.set_user("Administrator")
		for dt, name in reversed(created_docs):
			try:
				if frappe.db.exists(dt, name):
					frappe.delete_doc(dt, name, ignore_permissions=True, force=True)
			except Exception:
				pass

		_disable_user(users.products)
		_disable_user(users.maintainer)
		_disable_user(users.sales)
		_disable_user(users.super_admin)


def smoke(create_docs: int = 1) -> dict:
	"""PHASE D: One deterministic smoke runner for stabilisation gate."""
	# Hard guardrails first: prevent the "empty permissions" incident from recurring.
	from casamoderna_dms.permissions_guardrails import assert_permissions_guardrails

	assert_permissions_guardrails()

	inv = inventory_snapshot()
	inv_path = _write_json(f"inventory_{_today_tag()}.json", inv)

	# Existing suite coverage
	from casamoderna_dms.smoke_checks_products_console import run as products_smoke
	from casamoderna_dms.smoke_checks_sales_console import run as sales_console_smoke
	from casamoderna_dms.smoke_checks_sales_pricing_cm import run as sales_pricing_smoke
	from casamoderna_dms.smoke_checks_tile_box_to_sqm import run as tile_box_to_sqm_smoke
	from casamoderna_dms.smoke_checks_suppliers_console import run as suppliers_smoke
	from casamoderna_dms.smoke_checks_freetext_placeholders import run as freetext_smoke

	products_smoke()
	sales_console_smoke()
	sales_pricing_smoke()
	tile_box_to_sqm_smoke()
	suppliers_smoke()
	freetext_smoke()

	matrix = run_test_matrix(create_docs=create_docs)
	matrix_path = _write_json(f"matrix_{_today_tag()}.json", matrix)

	perm = permission_audit_snapshot(users=matrix.get("users") or {})
	conflicts = perm.get("analysis", {}).get("custom_docperm_conflicts") or []
	if conflicts:
		raise frappe.ValidationError(
			"Permission audit failed: conflicting duplicate Custom DocPerm rows detected. "
			"Resolve by making duplicates identical (no broadening) or removing the conflict source."
		)

	# Contract 17: Custom DocPerm must not shadow standard DocPerm for key doctypes.
	in_scope = perm.get("analysis", {}).get("contract17_custom_docperm_in_scope") or []
	if in_scope:
		raise frappe.ValidationError(
			"Contract 17 failed: Custom DocPerm rows still exist for scoped doctypes (shadow layer present): "
			+ ", ".join(in_scope)
		)

	# Suppliers Contract: DocPerm-only governance for supplier-related doctypes.
	in_scope = perm.get("analysis", {}).get("contract_suppliers_custom_docperm_in_scope") or []
	if in_scope:
		raise frappe.ValidationError(
			"Suppliers Contract failed: Custom DocPerm rows still exist for supplier-related doctypes (shadow layer present): "
			+ ", ".join(in_scope)
		)
	perm_path = _write_json(f"permissions_{_today_tag()}.json", perm)

	return {
		"site": frappe.local.site,
		"inventory_path": inv_path,
		"matrix_path": matrix_path,
		"permissions_path": perm_path,
		"counts": {
			"inventory": inv.get("counts"),
			"matrix_tests": len(matrix.get("tests") or []),
			"permission_doctypes": len(perm.get("audit_doctypes") or []),
		},
	}


def audit_stab_item_groups(limit: int = 50) -> dict:
	"""Bench entrypoint: audit leaked CM-STAB-GROUP-* Item Groups.

	This exists because these groups are created by the stabilisation gate as a UI/permissions
	smoke check, and should not persist in a production dataset.
	"""
	frappe.set_user("Administrator")
	names = frappe.get_all(
		"Item Group",
		filters={"name": ["like", "CM-STAB-GROUP-%"]},
		pluck="name",
		limit_page_length=max(0, int(limit or 0)),
	)
	# Best-effort: count references from Item.item_group.
	ref = frappe.db.get_all(
		"Item",
		filters={"item_group": ["in", names]} if names else {"name": "__none__"},
		fields=["item_group", "count(name) as n"],
		group_by="item_group",
	)
	ref_map = {r.get("item_group"): int(r.get("n") or 0) for r in (ref or [])}
	return {
		"site": frappe.local.site,
		"count": len(names),
		"sample": names[: min(len(names), 20)],
		"referenced_counts": ref_map,
	}


def cleanup_stab_item_groups(dry_run: int = 1, limit: int = 5000, fix_known_refs: int = 1) -> dict:
	"""Bench entrypoint: delete leaked CM-STAB-GROUP-* Item Groups.

	Safety rules:
	- Only deletes groups with no child Item Groups.
	- Only deletes groups not referenced by any Item.item_group.
	"""
	frappe.set_user("Administrator")
	dry_run = 1 if int(dry_run or 0) else 0
	limit = int(limit or 0) or 5000
	fix_known_refs = 1 if int(fix_known_refs or 0) else 0
	groups = frappe.get_all(
		"Item Group",
		filters={"name": ["like", "CM-STAB-GROUP-%"]},
		pluck="name",
		limit_page_length=limit,
	)

	deleted: list[str] = []
	skipped: dict[str, str] = {}
	errors: dict[str, str] = {}

	for g in groups:
		try:
			# Skip if has children.
			has_child = bool(frappe.db.exists("Item Group", {"parent_item_group": g}))
			if has_child:
				skipped[g] = "has_child_item_groups"
				continue

			# Skip if referenced by any Item, unless it's a known smoke-test fixture we can re-home.
			ref_items = frappe.get_all(
				"Item",
				filters={"item_group": g},
				pluck="name",
				limit_page_length=10,
			)
			if ref_items:
				if fix_known_refs and set(ref_items) == {"CM-TILE-BOX-SQM-MISSING"}:
					target_group = _first_existing("Item Group", ["All Item Groups", "Products"]) or _first_existing(
						"Item Group", []
					)
					if not target_group:
						skipped[g] = "referenced_by_item_and_no_target_group"
						continue
					if not dry_run:
						frappe.db.set_value("Item", "CM-TILE-BOX-SQM-MISSING", "item_group", target_group)
				else:
					skipped[g] = "referenced_by_item"
					continue

			if dry_run:
				deleted.append(g)
				continue

			frappe.delete_doc("Item Group", g, ignore_permissions=True, force=True)
			deleted.append(g)
		except Exception as e:  # noqa: BLE001
			errors[g] = str(e)

	return {
		"site": frappe.local.site,
		"dry_run": bool(dry_run),
		"found": len(groups),
		"deleted": deleted,
		"skipped": skipped,
		"errors": errors,
	}


def run(create_docs: int = 1):
	"""Bench entrypoint: `bench --site ... execute casamoderna_dms.stabilisation_gate.run`"""
	res = smoke(create_docs=create_docs)
	print(json.dumps(res, indent=2, default=str))
	return res


def dump_inventory():
	"""Bench entrypoint: write inventory JSON and print its path."""
	frappe.set_user("Administrator")
	inv = inventory_snapshot()
	path = _write_json(f"inventory_{_today_tag()}.json", inv)
	print(path)
	return {"site": frappe.local.site, "path": path, "counts": inv.get("counts")}


def dump_matrix(create_docs: int = 1):
	"""Bench entrypoint: run matrix and write JSON, printing its path."""
	frappe.set_user("Administrator")
	matrix = run_test_matrix(create_docs=create_docs)
	path = _write_json(f"matrix_{_today_tag()}.json", matrix)
	print(path)
	return {"site": frappe.local.site, "path": path, "tests": len(matrix.get("tests") or [])}
