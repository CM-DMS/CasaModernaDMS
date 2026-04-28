# Copyright (c) 2026, CasaModerna and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class CMCustomerAppointment(Document):
	def validate(self):
		self._validate_times()
		self._validate_salesperson_leave()

	def _validate_times(self):
		if self.start_time and self.end_time and self.start_time >= self.end_time:
			frappe.throw(frappe._("End Time must be after Start Time."))

	def _validate_salesperson_leave(self):
		"""Warn if salesperson has approved leave on the appointment date."""
		if not (self.salesperson and self.appointment_date):
			return
		# Get Employee linked to this User
		employee = frappe.db.get_value("Employee", {"user_id": self.salesperson}, "name")
		if not employee:
			return
		conflict = frappe.db.exists(
			"Leave Application",
			{
				"employee": employee,
				"from_date": ("<=", self.appointment_date),
				"to_date": (">=", self.appointment_date),
				"status": "Approved",
				"docstatus": 1,
			},
		)
		if conflict:
			frappe.msgprint(
				frappe._("Warning: Salesperson {0} has approved leave on {1}.").format(
					self.salesperson, self.appointment_date
				),
				title=frappe._("Leave Conflict"),
				indicator="orange",
			)


@frappe.whitelist()
def get_events(start, end, filters=None):
	"""Return Customer Appointment events for the calendar view."""
	data = frappe.db.sql(
		"""
		SELECT
			name,
			customer_name,
			appointment_type,
			status,
			location,
			salesperson,
			appointment_date,
			start_time,
			end_time,
			CONCAT(appointment_date, " ", IFNULL(start_time, "00:00:00")) AS start,
			CONCAT(appointment_date, " ",
				IFNULL(end_time,
					ADDTIME(IFNULL(start_time, "09:00:00"), "01:00:00")
				)
			) AS end
		FROM `tabCM Customer Appointment`
		WHERE appointment_date BETWEEN %(start)s AND %(end)s
		AND docstatus < 2
		""",
		{"start": start, "end": end},
		as_dict=True,
		update={"allDay": 0},
	)
	return data
