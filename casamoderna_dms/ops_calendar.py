# Copyright (c) 2026, CasaModerna and contributors
# For license information, please see license.txt
#
# ops_calendar.py — Operations Calendar backend.
# Calendar event queries + CRUD for Appointments and Leave Requests.

import frappe
from frappe.utils import today, date_diff

DOCTYPE_APT = "CM Customer Appointment"
DOCTYPE_LVE = "CM Leave Request"

# ─── Calendar event queries ──────────────────────────────────────────────────


@frappe.whitelist()
def get_delivery_events(start, end, filters=None):
	"""
	Return Delivery Note records that have a scheduled delivery date
	(cm_delivery_date) within the given range, for the calendar view.
	Only non-cancelled delivery notes are returned.
	"""
	data = frappe.db.sql(
		"""
		SELECT
			name,
			customer_name,
			status,
			cm_delivery_date,
			cm_delivery_time_slot,
			cm_delivery_team,
			shipping_address_name,
			posting_date
		FROM `tabDelivery Note`
		WHERE cm_delivery_date IS NOT NULL
		  AND cm_delivery_date BETWEEN %(start)s AND %(end)s
		  AND docstatus < 2
		ORDER BY cm_delivery_date ASC
		""",
		{"start": start, "end": end},
		as_dict=True,
		update={"allDay": 1, "convertToUserTz": 0},
	)
	return data


@frappe.whitelist()
def get_leave_events(start, end, filters=None):
	"""
	Return Leave Application records for the given date range.
	Only approved/open leave applications are returned.
	Returns an empty list if the Leave Application table does not exist
	(i.e. the hrms app is not installed on this site).
	"""
	if not frappe.db.table_exists("Leave Application"):
		return []

	data = frappe.db.sql(
		"""
		SELECT
			name,
			employee,
			employee_name,
			leave_type,
			from_date,
			to_date,
			status,
			total_leave_days,
			description
		FROM `tabLeave Application`
		WHERE from_date <= %(end)s
		  AND to_date >= %(start)s
		  AND docstatus < 2
		  AND status IN ('Open', 'Approved')
		ORDER BY from_date ASC
		""",
		{"start": start, "end": end},
		as_dict=True,
		update={"allDay": 1},
	)
	return data


@frappe.whitelist()
def get_cm_leave_events(start, end, filters=None):
	"""Return CM Leave Request records for the calendar (overlapping date range)."""
	data = frappe.db.sql(
		"""
		SELECT
			name,
			employee_user,
			employee_name,
			leave_type,
			from_date,
			to_date,
			status,
			total_days,
			reason
		FROM `tabCM Leave Request`
		WHERE from_date <= %(end)s
		  AND to_date >= %(start)s
		  AND status IN ('Pending', 'Approved')
		ORDER BY from_date ASC
		""",
		{"start": start, "end": end},
		as_dict=True,
		update={"allDay": 1},
	)
	return data


# ─── Appointment CRUD ────────────────────────────────────────────────────────


@frappe.whitelist()
def get_appointment_list(
	start=None, end=None, status=None, assignee=None, mine=None, limit=50
):
	"""Return appointment list with optional filters for the list screen."""
	filters = []
	if start:
		filters.append(["appointment_date", ">=", start])
	if end:
		filters.append(["appointment_date", "<=", end])
	if status:
		filters.append(["status", "=", status])
	if assignee:
		filters.append(["salesperson", "=", assignee])
	if mine and frappe.session.user != "Guest":
		filters.append(["salesperson", "=", frappe.session.user])

	return frappe.get_all(
		DOCTYPE_APT,
		fields=[
			"name", "customer", "customer_name", "appointment_type",
			"status", "salesperson", "appointment_date", "start_time",
			"end_time", "location", "notes", "modified",
		],
		filters=filters,
		order_by="appointment_date desc, start_time asc",
		limit_page_length=int(limit),
	)


@frappe.whitelist()
def save_appointment(doc):
	"""Create or update a CM Customer Appointment. Returns the saved doc."""
	import json
	if isinstance(doc, str):
		doc = json.loads(doc)

	doc["doctype"] = DOCTYPE_APT
	is_new = not doc.get("name")
	if doc.get("name"):
		d = frappe.get_doc(DOCTYPE_APT, doc["name"])
		d.update(doc)
		d.save()
	else:
		d = frappe.get_doc(doc)
		d.insert()
	frappe.db.commit()

	if is_new:
		try:
			from casamoderna_dms.sms_api import send_consultation_appointment_sms
			send_consultation_appointment_sms(d.name)
		except Exception:
			frappe.log_error(title=f"Consultation SMS failed: {d.name}")

	return d.as_dict()


@frappe.whitelist()
def delete_appointment(name):
	"""Delete a CM Customer Appointment by name."""
	frappe.delete_doc(DOCTYPE_APT, name, ignore_permissions=False)
	frappe.db.commit()
	return {"ok": True}


@frappe.whitelist()
def delegate_appointment(name, to_user):
	"""Reassign a CM Customer Appointment's salesperson to another user."""
	doc = frappe.get_doc(DOCTYPE_APT, name)
	doc.salesperson = to_user
	doc.save()
	frappe.db.commit()
	return doc.as_dict()


@frappe.whitelist()
def get_users_for_delegation():
	"""Return list of users with Sales-related roles for the delegate dropdown."""
	roles = ["Sales User", "Sales Manager", "Stock Manager", "Stock User", "System Manager"]
	users = frappe.db.sql(
		"""
		SELECT DISTINCT u.name, u.full_name
		FROM `tabUser` u
		JOIN `tabHas Role` r ON r.parent = u.name
		WHERE r.role IN %(roles)s
		  AND u.enabled = 1
		  AND u.name != 'Guest'
		ORDER BY u.full_name
		""",
		{"roles": roles},
		as_dict=True,
	)
	return users


# ─── Leave Request CRUD ──────────────────────────────────────────────────────


@frappe.whitelist()
def get_leave_request_list(status=None, employee_user=None, mine=None, limit=50):
	"""Return leave request list with optional filters."""
	filters = []
	if status:
		filters.append(["status", "=", status])
	if employee_user:
		filters.append(["employee_user", "=", employee_user])
	if mine and frappe.session.user != "Guest":
		filters.append(["employee_user", "=", frappe.session.user])

	return frappe.get_all(
		DOCTYPE_LVE,
		fields=[
			"name", "employee_user", "employee_name", "leave_type",
			"from_date", "to_date", "total_days", "status",
			"reason", "reviewed_by", "reviewer_notes", "modified",
		],
		filters=filters,
		order_by="from_date desc",
		limit_page_length=int(limit),
	)


@frappe.whitelist()
def save_leave_request(doc):
	"""Create or update a CM Leave Request. Returns the saved doc."""
	import json
	if isinstance(doc, str):
		doc = json.loads(doc)

	doc["doctype"] = DOCTYPE_LVE
	if not doc.get("employee_user"):
		doc["employee_user"] = frappe.session.user

	is_new = not doc.get("name")
	if is_new:
		d = frappe.get_doc(doc)
		d.insert()
	else:
		d = frappe.get_doc(DOCTYPE_LVE, doc["name"])
		d.update(doc)
		d.save()

	if is_new:
		emp_name = d.employee_name or d.employee_user
		subject = f"New leave request from {emp_name} ({d.leave_type}, {d.from_date} → {d.to_date})"
		for reviewer in _get_leave_reviewers():
			_notify_leave(reviewer, subject, d.name)

	frappe.db.commit()
	return d.as_dict()


LEAVE_REVIEWER_ROLE = "CM Admin"


def _get_leave_reviewers():
	"""Return list of users with the leave reviewer role."""
	return frappe.get_all(
		"Has Role", filters={"role": LEAVE_REVIEWER_ROLE, "parenttype": "User"},
		pluck="parent",
	)


def _notify_leave(for_user, subject, doc_name, from_user=None):
	"""Send an in-app notification (bell icon) + email for a leave request."""
	n = frappe.new_doc("Notification Log")
	n.for_user = for_user
	n.from_user = from_user or frappe.session.user
	n.subject = subject
	n.document_type = DOCTYPE_LVE
	n.document_name = doc_name
	n.type = "Alert"
	n.insert(ignore_permissions=True)

	try:
		frappe.sendmail(
			recipients=[for_user],
			subject=subject,
			message=subject,
			reference_doctype=DOCTYPE_LVE,
			reference_name=doc_name,
			now=True,
		)
	except Exception:
		frappe.log_error(title=f"Leave notification email failed: {for_user}")


@frappe.whitelist()
def review_leave_request(name, status, notes=None):
	"""Approve or reject a leave request. Restricted to CM Super Admin."""
	if LEAVE_REVIEWER_ROLE not in frappe.get_roles(frappe.session.user):
		frappe.throw(frappe._("Only users with the CM Admin role can approve or reject leave requests."), frappe.PermissionError)

	if status not in ("Approved", "Rejected"):
		frappe.throw(frappe._("Status must be Approved or Rejected."))

	doc = frappe.get_doc(DOCTYPE_LVE, name)
	doc.status = status
	doc.reviewed_by = frappe.session.user
	if notes:
		doc.reviewer_notes = notes
	doc.save(ignore_permissions=True)

	_notify_leave(
		doc.employee_user,
		f"Your leave request ({doc.leave_type}, {doc.from_date} → {doc.to_date}) has been {status.lower()}",
		doc.name,
	)

	frappe.db.commit()
	return doc.as_dict()


@frappe.whitelist()
def delete_leave_request(name):
	"""Delete a CM Leave Request (only if Pending or owner is requester)."""
	doc = frappe.get_doc(DOCTYPE_LVE, name)
	if doc.status not in ("Pending", "Cancelled") and doc.employee_user != frappe.session.user:
		frappe.throw(frappe._("Cannot delete a reviewed leave request."))
	frappe.delete_doc(DOCTYPE_LVE, name, ignore_permissions=False)
	frappe.db.commit()
	return {"ok": True}


# ─── Delivery scheduling ─────────────────────────────────────────────────────


@frappe.whitelist()
def search_unscheduled_deliveries(search="", limit=20):
	"""
	Return Delivery Notes that have no delivery date set yet.
	Supports free-text search on DN name or customer name.
	"""
	like = f"%{search}%" if search else "%"
	return frappe.db.sql(
		"""
		SELECT name, customer_name, posting_date, status
		FROM `tabDelivery Note`
		WHERE docstatus < 2
		  AND (cm_delivery_date IS NULL OR cm_delivery_date = '')
		  AND (name LIKE %(like)s OR customer_name LIKE %(like)s)
		ORDER BY posting_date DESC
		LIMIT %(limit)s
		""",
		{"like": like, "limit": int(limit)},
		as_dict=True,
	)


@frappe.whitelist()
def get_delivery_employees():
	"""Return active employees for the delivery team dropdown."""
	return frappe.get_all(
		"Employee",
		fields=["name", "employee_name"],
		filters={"status": "Active"},
		order_by="employee_name asc",
		limit_page_length=200,
	)


@frappe.whitelist()
def schedule_delivery(dn_name, delivery_date, time_slot="", team="", instructions=""):
	"""
	Schedule a delivery by setting cm_delivery_date (and optional slot/team/instructions)
	on a Delivery Note.  Works on both Draft and Submitted DNs.
	The existing after_save SMS hook fires automatically for Draft saves;
	for Submitted DNs the SMS is triggered directly.
	"""
	doc = frappe.get_doc("Delivery Note", dn_name)
	prev_date = str(doc.cm_delivery_date or "")

	if doc.docstatus == 0:
		# Draft — normal save; before_save/after_save hooks fire as usual.
		doc.cm_delivery_date = delivery_date or None
		doc.cm_delivery_time_slot = time_slot or None
		doc.cm_delivery_team = team or None
		doc.cm_delivery_instructions = instructions or None
		doc.save(ignore_permissions=True)
	else:
		# Submitted — bypass docstatus lock with db.set_value.
		frappe.db.set_value(
			"Delivery Note",
			dn_name,
			{
				"cm_delivery_date": delivery_date or None,
				"cm_delivery_time_slot": time_slot or None,
				"cm_delivery_team": team or None,
				"cm_delivery_instructions": instructions or None,
			},
			update_modified=True,
		)
		# Manually fire SMS if date was set or changed.
		if delivery_date and str(delivery_date) != prev_date:
			try:
				from casamoderna_dms.sms_api import send_delivery_appointment_sms
				send_delivery_appointment_sms(dn_name)
			except Exception:
				frappe.log_error(title=f"Delivery schedule SMS failed: {dn_name}")

	frappe.db.commit()
	return frappe.db.get_value(
		"Delivery Note",
		dn_name,
		["name", "customer_name", "cm_delivery_date", "cm_delivery_time_slot", "cm_delivery_team"],
		as_dict=True,
	)

