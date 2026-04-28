# Copyright (c) 2026, CasaModerna and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now


class CMCustomerReport(Document):
    def validate(self):
        # Auto-set opened_by / opening_datetime on creation
        if self.is_new():
            if not self.opened_by:
                self.opened_by = frappe.session.user
            if not self.opening_datetime:
                self.opening_datetime = now()

        # Require action_taken before closing
        if self.status == "Closed" and not self.action_taken:
            frappe.throw(
                frappe._("Action Taken is required before closing a report."),
            )

        # Auto-set closure fields the first time status becomes Closed
        if self.status == "Closed" and not self.closing_datetime:
            self.closed_by = frappe.session.user
            self.closing_datetime = now()

        # If re-opened, clear closure fields
        if self.status != "Closed":
            self.closed_by = None
            self.closing_datetime = None

    def on_update(self):
        self._notify_assigned_to()

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _notify_assigned_to(self) -> None:
        """Notify the assigned_to user when assignment changes."""
        if not self.assigned_to:
            return
        # get_doc_before_save() returns the pre-write snapshot; None for new docs.
        doc_before = self.get_doc_before_save()
        previous = doc_before.assigned_to if doc_before else None
        if previous == self.assigned_to:
            return

        subject = (
            f"Customer report assigned to you — {self.name}: {self.subject}"
        )
        _notify_report(
            for_user=self.assigned_to,
            subject=subject,
            doc_name=self.name,
            from_user=self.opened_by or frappe.session.user,
        )


def _notify_report(for_user, subject, doc_name, from_user=None):
    """Send an in-app notification + email for a customer report."""
    n = frappe.new_doc("Notification Log")
    n.for_user = for_user
    n.from_user = from_user or frappe.session.user
    n.subject = subject
    n.document_type = "CM Customer Report"
    n.document_name = doc_name
    n.type = "Alert"
    n.insert(ignore_permissions=True)

    try:
        frappe.sendmail(
            recipients=[for_user],
            subject=subject,
            message=subject,
            reference_doctype="CM Customer Report",
            reference_name=doc_name,
            now=True,
        )
    except Exception:
        frappe.log_error(title=f"Customer report notification email failed: {for_user}")
