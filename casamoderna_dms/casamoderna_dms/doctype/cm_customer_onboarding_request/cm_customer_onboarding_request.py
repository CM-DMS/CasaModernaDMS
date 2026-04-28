# Copyright (c) 2026, CasaModerna and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class CMCustomerOnboardingRequest(Document):
	def after_insert(self):
		self._notify_staff()

	def _notify_staff(self):
		"""Send an email to the review team when a new registration arrives."""
		recipients = ["brian@casamoderna.mt", "jason@casamoderna.mt"]
		subject = f"New Customer Registration: {self.full_name}"

		# Build billing address lines (skip blanks)
		bill_parts = [
			self.bill_line1 or "",   # Door No. / Building Name & Apt. No.
			self.bill_line2 or "",   # Street Name
			self.bill_locality or "",
			self.bill_postcode or "",
		]
		bill_address = ", ".join(p for p in bill_parts if p)

		message = f"""
<p>A new customer registration form has been submitted and is awaiting review.</p>
<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
  <tr><td style="padding:4px 12px 4px 0;color:#666;">Name</td><td><strong>{self.full_name}</strong></td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666;">Type</td><td>{self.customer_type}</td></tr>
  {"<tr><td style='padding:4px 12px 4px 0;color:#666;'>Company</td><td>" + (self.company_name or "") + "</td></tr>" if self.company_name else ""}
  {"<tr><td style='padding:4px 12px 4px 0;color:#666;'>ID Card</td><td>" + (self.id_card_no or "") + "</td></tr>" if self.id_card_no else ""}
  {"<tr><td style='padding:4px 12px 4px 0;color:#666;'>VAT No.</td><td>" + (self.vat_no or "") + "</td></tr>" if self.vat_no else ""}
  <tr><td style="padding:4px 12px 4px 0;color:#666;">Email</td><td>{self.email}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666;">Mobile</td><td>{self.mobile}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top;">Billing Address</td><td>{bill_address or "—"}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666;">Email marketing</td><td>{"Yes" if self.consent_email_marketing else "No"}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666;">SMS marketing</td><td>{"Yes" if self.consent_sms_marketing else "No"}</td></tr>
</table>
<p style="margin-top:16px;">
  <a href="https://www.casamodernadms.eu/dms/customers/registrations/{self.name}"
     style="background:#339966;color:#fff;padding:8px 16px;text-decoration:none;border-radius:3px;">
    Review Registration
  </a>
</p>
"""
		try:
			frappe.sendmail(
				recipients=recipients,
				subject=subject,
				message=message,
				now=True,
			)
		except Exception:
			# Never block the insert if email fails
			frappe.log_error(frappe.get_traceback(), "Onboarding notification email failed")
