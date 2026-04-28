# Copyright (c) 2026, CasaModerna and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import date_diff

# Only this user may approve or reject leave requests.
APPROVER_USER = "jason@casamoderna.mt"
REVIEW_STATUSES = {"Approved", "Rejected"}


class CMLeaveRequest(Document):
	def validate(self):
		if self.from_date and self.to_date:
			if self.from_date > self.to_date:
				frappe.throw(frappe._("To Date must be on or after From Date."))
			self.total_days = date_diff(self.to_date, self.from_date) + 1
		self._validate_reviewer()

	# ------------------------------------------------------------------
	# Private helpers
	# ------------------------------------------------------------------

	def _validate_reviewer(self) -> None:
		"""Only Jason may transition a leave request to Approved or Rejected."""
		if self.status not in REVIEW_STATUSES:
			return
		# Check previous status so saving an already-approved doc doesn't block.
		if not self.is_new():
			prev = frappe.db.get_value("CM Leave Request", self.name, "status")
			if prev == self.status:
				return
		if frappe.session.user != APPROVER_USER:
			frappe.throw(
				"Only Jason (jason@casamoderna.mt) can approve or reject leave requests.",
				frappe.PermissionError,
			)
		# Auto-populate reviewed_by when Jason sets a terminal status.
		if not self.reviewed_by:
			self.reviewed_by = frappe.session.user
