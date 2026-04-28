from __future__ import annotations

from dataclasses import dataclass

import frappe


WORKFLOW_NAME = "CM Sales Order Flow"
WORKFLOW_DOCTYPE = "Sales Order"
WORKFLOW_STATE_FIELD = "workflow_state"


@dataclass(frozen=True)
class RoleSets:
	submit_roles: list[str]
	confirm_roles: list[str]


def _ensure_no_custom_docperm() -> None:
	# Guardrail: this slice must not introduce/enable Custom DocPerm.
	count = int(frappe.db.count("Custom DocPerm") or 0)
	if count != 0:
		raise frappe.ValidationError(f"Custom DocPerm must remain 0, found {count}")


def _get_sales_order_docperm_roles() -> list[dict]:
	rows = frappe.db.sql(
		"""
		SELECT role, `create`, `write`, submit, cancel, amend
		FROM `tabDocPerm`
		WHERE parent=%s AND permlevel=0
		ORDER BY role
		""",
		(WORKFLOW_DOCTYPE,),
		as_dict=True,
	)
	return [dict(r) for r in rows]


def _get_submit_roles_from_docperm() -> list[str]:
	roles = []
	for r in _get_sales_order_docperm_roles():
		if int(r.get("submit") or 0) == 1:
			role = r.get("role")
			if role:
				roles.append(role)
	return sorted(set(roles))


def _get_confirm_roles_admin_only() -> list[str]:
	"""Pick admin-only confirmer roles.

	Policy for this project:
	- Prefer CM Super Admin if present.
	- Otherwise fallback to System Manager if present.
	- Never auto-include broad submit roles like Sales User.
	"""
	if frappe.db.exists("Role", "CM Super Admin"):
		return ["CM Super Admin"]
	if frappe.db.exists("Role", "System Manager"):
		return ["System Manager"]
	raise frappe.ValidationError("No admin confirmer role found (expected Role: 'CM Super Admin' or 'System Manager')")


def get_live_role_sets() -> RoleSets:
	submit_roles = _get_submit_roles_from_docperm()
	confirm_roles = _get_confirm_roles_admin_only()
	missing = [r for r in confirm_roles if r not in submit_roles and not frappe.db.exists("Role", r)]
	if missing:
		raise frappe.ValidationError(f"Confirm roles missing: {missing}")
	return RoleSets(submit_roles=submit_roles, confirm_roles=confirm_roles)


def _ensure_workflow_state_custom_field() -> dict:
	"""Ensure Sales Order has workflow_state field.

	Frappe Workflow requires an explicit field on the DocType.
	We create a hidden, read-only Link to Workflow State.
	"""
	if frappe.db.exists("Custom Field", f"{WORKFLOW_DOCTYPE}-{WORKFLOW_STATE_FIELD}"):
		return {"created": False, "name": f"{WORKFLOW_DOCTYPE}-{WORKFLOW_STATE_FIELD}"}

	meta = frappe.get_meta(WORKFLOW_DOCTYPE)
	if meta.get_field(WORKFLOW_STATE_FIELD):
		return {"created": False, "name": f"{WORKFLOW_DOCTYPE}-{WORKFLOW_STATE_FIELD}", "note": "field already exists in meta"}

	insert_after = None
	for candidate in ["status", "delivery_date", "transaction_date", "customer"]:
		if meta.get_field(candidate):
			insert_after = candidate
			break
	if not insert_after:
		insert_after = meta.fields[0].fieldname if meta.fields else "customer"

	cf = frappe.new_doc("Custom Field")
	cf.dt = WORKFLOW_DOCTYPE
	cf.label = "Workflow State"
	cf.fieldname = WORKFLOW_STATE_FIELD
	cf.fieldtype = "Link"
	cf.options = "Workflow State"
	cf.insert_after = insert_after
	cf.hidden = 1
	cf.read_only = 1
	cf.allow_on_submit = 1
	cf.no_copy = 1
	cf.print_hide = 1
	cf.insert(ignore_permissions=True)
	return {"created": True, "name": cf.name, "insert_after": insert_after}


def _ensure_workflow_states_exist() -> dict:
	"""Ensure Workflow State master records exist for the workflow states we reference."""
	required = ["Draft", "Pending", "Confirmed"]
	created: list[str] = []
	for state in required:
		if frappe.db.exists("Workflow State", state):
			continue
		doc = frappe.new_doc("Workflow State")
		doc.workflow_state_name = state
		# Keep style minimal; only set when it is clearly semantically safe.
		if state == "Confirmed":
			doc.style = "Success"
		doc.insert(ignore_permissions=True)
		created.append(state)
	return {"required": required, "created": created}


def _ensure_workflow_actions_exist() -> dict:
	"""Ensure Workflow Action Master records exist for transition action labels."""
	required = ["Submit to Pending", "Admin Confirm"]
	created: list[str] = []
	for action in required:
		if frappe.db.exists("Workflow Action Master", action):
			continue
		# Fallback: some instances may use workflow_action_name as unique field.
		if frappe.db.exists("Workflow Action Master", {"workflow_action_name": action}):
			continue
		doc = frappe.new_doc("Workflow Action Master")
		doc.workflow_action_name = action
		doc.insert(ignore_permissions=True)
		created.append(action)
	return {"required": required, "created": created}


def _upsert_workflow(role_sets: RoleSets) -> dict:
	if frappe.db.exists("Workflow", WORKFLOW_NAME):
		wf = frappe.get_doc("Workflow", WORKFLOW_NAME)
		created = False
	else:
		wf = frappe.new_doc("Workflow")
		wf.name = WORKFLOW_NAME
		created = True

	wf.workflow_name = WORKFLOW_NAME
	wf.document_type = WORKFLOW_DOCTYPE
	wf.is_active = 1
	wf.workflow_state_field = WORKFLOW_STATE_FIELD
	wf.send_email_alert = 0

	wf.states = []
	wf.append(
		"states",
		{
			"state": "Draft",
			"doc_status": 0,
			"allow_edit": "All",
		},
	)
	wf.append(
		"states",
		{
			"state": "Pending",
			"doc_status": 1,
			"allow_edit": "All",
		},
	)
	wf.append(
		"states",
		{
			"state": "Confirmed",
			"doc_status": 1,
			"allow_edit": "All",
		},
	)

	wf.transitions = []
	for role in role_sets.submit_roles:
		wf.append(
			"transitions",
			{
				"state": "Draft",
				"action": "Submit to Pending",
				"next_state": "Pending",
				"allowed": role,
			},
		)

	for role in role_sets.confirm_roles:
		wf.append(
			"transitions",
			{
				"state": "Pending",
				"action": "Admin Confirm",
				"next_state": "Confirmed",
				"allowed": role,
			},
		)

	wf.save(ignore_permissions=True)
	return {
		"created": created,
		"name": wf.name,
		"document_type": wf.document_type,
		"is_active": wf.is_active,
		"workflow_state_field": wf.workflow_state_field,
		"submit_roles": role_sets.submit_roles,
		"confirm_roles": role_sets.confirm_roles,
		"states": [{"state": s.state, "doc_status": s.doc_status} for s in wf.states],
		"transitions": [
			{"state": t.state, "action": t.action, "next_state": t.next_state, "allowed": t.allowed}
			for t in wf.transitions
		],
	}


def ensure_cm_sales_order_flow(commit: bool = True) -> dict:
	"""Bench entrypoint.

	Creates/updates:
	- Custom Field Sales Order.workflow_state (if missing)
	- Workflow CM Sales Order Flow
	"""
	frappe.set_user("Administrator")
	_ensure_no_custom_docperm()

	role_sets = get_live_role_sets()
	ws = _ensure_workflow_states_exist()
	wa = _ensure_workflow_actions_exist()
	cf = _ensure_workflow_state_custom_field()
	wf = _upsert_workflow(role_sets)

	if commit:
		frappe.db.commit()

	return {
		"site": frappe.local.site,
		"role_sets": {"SUBMIT_ROLES": role_sets.submit_roles, "CONFIRM_ROLES": role_sets.confirm_roles},
		"workflow_states": ws,
		"workflow_actions": wa,
		"custom_field": cf,
		"workflow": wf,
		"custom_docperm_count": int(frappe.db.count("Custom DocPerm") or 0),
	}


def audit_sales_order_workflow_baseline() -> dict:
	"""Read-only snapshot for reporting."""
	frappe.set_user("Administrator")
	wf_count = int(frappe.db.count("Workflow", filters={"document_type": WORKFLOW_DOCTYPE}) or 0)
	so_wf_count = int(frappe.db.count("Workflow", filters={"document_type": WORKFLOW_DOCTYPE, "name": WORKFLOW_NAME}) or 0)
	custom_docperm_count = int(frappe.db.count("Custom DocPerm") or 0)
	role_sets = get_live_role_sets()

	meta = frappe.get_meta(WORKFLOW_DOCTYPE)
	field_exists_meta = bool(meta.get_field(WORKFLOW_STATE_FIELD))
	field_exists_custom = bool(frappe.db.exists("Custom Field", f"{WORKFLOW_DOCTYPE}-{WORKFLOW_STATE_FIELD}"))

	return {
		"site": frappe.local.site,
		"workflow_counts": {"workflow_for_sales_order": wf_count, "cm_sales_order_flow_exists": so_wf_count},
		"workflow_state_field": {"fieldname": WORKFLOW_STATE_FIELD, "exists_in_meta": field_exists_meta, "exists_custom_field": field_exists_custom},
		"docperm_roles": _get_sales_order_docperm_roles(),
		"role_sets": {"SUBMIT_ROLES": role_sets.submit_roles, "CONFIRM_ROLES": role_sets.confirm_roles},
		"custom_docperm_count": custom_docperm_count,
	}
