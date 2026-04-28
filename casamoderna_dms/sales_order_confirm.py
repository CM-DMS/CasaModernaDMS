from __future__ import annotations

import json
from typing import Any

import frappe


CM_SUPER_ADMIN_ROLE = "CM Super Admin"


def _require_cm_super_admin():
	if frappe.session.user == "Administrator":
		return
	roles = set(frappe.get_roles(frappe.session.user) or [])
	if CM_SUPER_ADMIN_ROLE not in roles:
		raise frappe.PermissionError(f"Only {CM_SUPER_ADMIN_ROLE} can confirm Sales Orders")


def _get_active_sales_order_workflow() -> frappe.Document:
	workflows = frappe.get_all(
		"Workflow",
		filters={"document_type": "Sales Order", "is_active": 1},
		pluck="name",
		limit=2,
	)
	if not workflows:
		raise frappe.ValidationError("No active Workflow found for Sales Order")
	if len(workflows) > 1:
		raise frappe.ValidationError(f"Multiple active Workflows found for Sales Order: {workflows}")
	return frappe.get_doc("Workflow", workflows[0])


def _find_pending_to_confirmed_action(wf: frappe.Document) -> str:
	transitions = [t for t in (wf.transitions or []) if t.state == "Pending" and t.next_state == "Confirmed"]
	if not transitions:
		raise frappe.ValidationError(
			f"Workflow {wf.name} has no Pending→Confirmed transition"
		)

	# Prefer the transition explicitly allowed for CM Super Admin, if present.
	for t in transitions:
		if (t.allowed or "") == CM_SUPER_ADMIN_ROLE:
			return t.action

	# Otherwise pick the first deterministic one.
	return transitions[0].action


@frappe.whitelist()
def confirm_pending_so(sales_order: str) -> dict[str, Any]:
	"""Confirm a submitted Sales Order from Pending → Confirmed via workflow.

	Rules:
	- Requires CM Super Admin.
	- Requires source is submitted (docstatus=1).
	- If already Confirmed, returns idempotently.
	"""
	_require_cm_super_admin()

	if not sales_order:
		raise frappe.ValidationError("Missing Sales Order")

	so = frappe.get_doc("Sales Order", sales_order)
	state = getattr(so, "workflow_state", None)
	if so.docstatus != 1:
		raise frappe.ValidationError("Sales Order must be submitted before confirming")

	if state == "Confirmed":
		return {"doctype": "Sales Order", "name": so.name, "workflow_state": state, "idempotent": True}

	if state != "Pending":
		raise frappe.ValidationError(f"Sales Order must be Pending to confirm (current: {state})")

	wf = _get_active_sales_order_workflow()
	action = _find_pending_to_confirmed_action(wf)

	from frappe.model.workflow import apply_workflow

	apply_workflow(so, action)
	so.reload()

	# Write audit trail — who confirmed and when
	frappe.db.set_value("Sales Order", so.name, {
		"cm_confirmed_by": frappe.session.user,
		"cm_confirmed_at": frappe.utils.now(),
	}, update_modified=False)
	frappe.db.commit()

	frappe.logger("casamoderna_dms").info(
		{
			"slice": "012",
			"event": "confirm_pending_so",
			"user": frappe.session.user,
			"sales_order": so.name,
			"workflow": wf.name,
			"action": action,
			"result_state": getattr(so, "workflow_state", None),
		}
	)

	return {
		"doctype": "Sales Order",
		"name": so.name,
		"workflow_state": getattr(so, "workflow_state", None),
		"workflow": wf.name,
		"action": action,
	}


@frappe.whitelist()
def audit_sales_order_pending_confirm_action() -> str:
	"""Authoritative audit helper for Slice 012.

	Returns JSON string so bench execute logs are portable.
	"""
	frappe.set_user("Administrator")
	wf = _get_active_sales_order_workflow()

	transitions = [
		{
			"state": t.state,
			"action": t.action,
			"next_state": t.next_state,
			"allowed": t.allowed,
			"allow_self_approval": getattr(t, "allow_self_approval", None),
		}
		for t in (wf.transitions or [])
	]
	pending_to_confirmed = [t for t in transitions if t["state"] == "Pending" and t["next_state"] == "Confirmed"]

	state_field = getattr(wf, "workflow_state_field", None)
	meta = frappe.get_meta("Sales Order")
	fieldnames = {df.fieldname for df in (meta.fields or []) if getattr(df, "fieldname", None)}

	enabled_scripts = frappe.get_all(
		"Client Script",
		filters={"dt": "Sales Order", "enabled": 1, "view": "Form"},
		fields=["name", "dt", "enabled"],
		order_by="name asc",
	)

	res = {
		"site": frappe.local.site,
		"workflow": {
			"name": wf.name,
			"is_active": int(getattr(wf, "is_active", 0) or 0),
			"document_type": getattr(wf, "document_type", None),
			"workflow_state_field": state_field,
		},
		"workflow_state_field_meta": {
			"fieldname": state_field,
			"exists_in_meta": bool(state_field and state_field in fieldnames),
		},
		"pending_to_confirmed": pending_to_confirmed,
		"picked_action": _find_pending_to_confirmed_action(wf),
		"client_scripts_enabled_sales_order": enabled_scripts,
	}

	return json.dumps(res, sort_keys=True)
