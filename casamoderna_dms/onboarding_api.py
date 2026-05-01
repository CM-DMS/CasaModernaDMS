# Copyright (c) 2026, CasaModerna and contributors
# For license information, please see license.txt
#
# Public-facing API for the customer self-registration form at
# forms.casamodernadms.eu/new-customer
#
# All guest-callable methods use allow_guest=True.
# Input is validated server-side before any DB write.

import secrets
import frappe
from frappe import _
from frappe.utils import now_datetime

FORM_URL = "https://forms.casamodernadms.eu/new-customer/"


# ──────────────────────────────────────────────────────────────────────────────
# Public helpers
# ──────────────────────────────────────────────────────────────────────────────

@frappe.whitelist(allow_guest=True)
def get_localities():
	"""Return sorted list of CM Locality names for the registration form dropdowns."""
	rows = frappe.get_all(
		"CM Locality",
		fields=["name"],
		filters=[["name", "not like", "SMOKE%"]],
		order_by="name asc",
		limit=300,
	)
	return [r["name"] for r in rows]


@frappe.whitelist(allow_guest=True)
def submit_registration(
	customer_type,
	full_name,
	email,
	mobile,
	bill_line1,
	bill_line2="",
	bill_locality="",
	bill_postcode="",
	same_as_billing=True,
	del_line1="",
	del_line2="",
	del_locality="",
	del_postcode="",
	company_name="",
	id_card_no="",
	vat_no="",
	consent_email_marketing=False,
	consent_sms_marketing=False,
	inv_token="",
):
	"""
	Create a CM Customer Onboarding Request from the public form.
	Returns the new document name on success.
	If inv_token is supplied it is linked to the originating invitation so
	the staff member who sent the link is notified.
	"""
	# ── Basic validation ──────────────────────────────────────────────────────
	if not full_name or not full_name.strip():
		frappe.throw(_("Full Name is required."), frappe.ValidationError)
	if not email or not email.strip():
		frappe.throw(_("Email Address is required."), frappe.ValidationError)
	if not mobile or not mobile.strip():
		frappe.throw(_("Mobile Number is required."), frappe.ValidationError)
	if not bill_line1 or not bill_line1.strip():
		frappe.throw(_("Billing Address Line 1 is required."), frappe.ValidationError)
	if customer_type not in ("Individual", "Company"):
		frappe.throw(_("Invalid account type."), frappe.ValidationError)

	# Capture submitter IP (nginx passes X-Forwarded-For)
	ip = (
		frappe.local.request.environ.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
		or frappe.local.request.environ.get("REMOTE_ADDR", "")
	)

	doc = frappe.get_doc({
		"doctype": "CM Customer Onboarding Request",
		"customer_type":          customer_type,
		"full_name":              full_name.strip(),
		"company_name":           (company_name or "").strip(),
		"id_card_no":             (id_card_no or "").strip(),
		"vat_no":                 (vat_no or "").strip(),
		"email":                  email.strip().lower(),
		"mobile":                 mobile.strip(),
		"bill_line1":             bill_line1.strip(),
		"bill_line2":             (bill_line2 or "").strip(),
		"bill_locality":          (bill_locality or "").strip(),
		"bill_postcode":          (bill_postcode or "").strip(),
		"same_as_billing":        1 if same_as_billing else 0,
		"del_line1":              (del_line1 or "").strip(),
		"del_line2":              (del_line2 or "").strip(),
		"del_locality":           (del_locality or "").strip(),
		"del_postcode":           (del_postcode or "").strip(),
		"consent_email_marketing": 1 if consent_email_marketing else 0,
		"consent_sms_marketing":   1 if consent_sms_marketing else 0,
		"consent_date":           now_datetime(),
		"consent_ip":             ip,
		"status":                 "New",
	})
	doc.insert(ignore_permissions=True)

	# ── Link invitation and notify sender ────────────────────────────────────
	token = (inv_token or "").strip()
	if token:
		inv = frappe.db.get_value(
			"CM Registration Invitation",
			{"token": token, "redeemed": 0},
			["name", "sender_user"],
			as_dict=True,
		)
		if inv:
			frappe.db.set_value("CM Registration Invitation", inv.name, {
				"redeemed": 1,
				"onboarding_request": doc.name,
			})
			# Notify the sender that the form has been completed
			_notify_invitation_sender(inv.sender_user, doc)

	frappe.db.commit()
	return doc.name


# ──────────────────────────────────────────────────────────────────────────────
# Staff action — send registration link via email or SMS
# ──────────────────────────────────────────────────────────────────────────────

@frappe.whitelist()
def check_recipient(method, recipient):
	"""
	Check whether an email address or mobile number already belongs to an
	existing Customer or a pending Onboarding Request.

	Returns a dict:
	  {
	    "customers":     [{"name": "...", "customer_name": "..."}],
	    "registrations": [{"name": "...", "full_name": "...", "status": "..."}],
	  }
	Both lists are empty when no conflicts are found.
	"""
	if not recipient or not recipient.strip():
		return {"customers": [], "registrations": []}

	r = recipient.strip()
	field = "cm_email" if method == "Email" else "cm_mobile"
	reg_field = "email" if method == "Email" else "mobile"

	customers = frappe.get_all(
		"Customer",
		fields=["name", "customer_name"],
		filters=[[field, "=", r]],
		limit=5,
	)

	registrations = frappe.get_all(
		"CM Customer Onboarding Request",
		fields=["name", "full_name", "status"],
		filters=[
			[reg_field, "=", r],
			["status", "in", ["New", "Reviewed"]],
		],
		limit=5,
	)

	return {"customers": customers, "registrations": registrations}


@frappe.whitelist()
def send_invitation(method, recipient):
	"""
	Send the registration form link to a prospective customer.

	method    — "Email" or "SMS"
	recipient — email address or mobile number

	Creates a CM Registration Invitation record so the sender is notified
	when the customer completes the form.
	Returns {"ok": True, "token": "..."} on success.
	"""
	if method not in ("Email", "SMS"):
		frappe.throw(_("Invalid method. Must be Email or SMS."))
	if not recipient or not recipient.strip():
		frappe.throw(_("Recipient is required."))

	sender_user = frappe.session.user
	token = secrets.token_urlsafe(24)
	link = f"{FORM_URL}?inv={token}"

	# Persist invitation
	inv = frappe.get_doc({
		"doctype":     "CM Registration Invitation",
		"token":       token,
		"sender_user": sender_user,
		"method":      method,
		"recipient":   recipient.strip(),
		"sent_at":     now_datetime(),
		"redeemed":    0,
	})
	inv.insert(ignore_permissions=True)
	frappe.db.commit()

	if method == "Email":
		delivered, delivery_error = _send_invitation_email(recipient.strip(), link, sender_user)
	else:
		delivered, delivery_error = _send_invitation_sms(recipient.strip(), link)

	return {"ok": True, "token": token, "delivered": delivered, "delivery_error": delivery_error}


def _send_invitation_email(to: str, link: str, sender_user: str) -> "tuple[bool, str]":
	sender_name = frappe.db.get_value("User", sender_user, "full_name") or "Casa Moderna"
	subject = "Register as a Casa Moderna Customer"
	message = f"""
<p>Dear Customer,</p>
<p>
  {sender_name} from Casa Moderna has invited you to register as a customer.
  Please click the button below to complete your registration — it only takes
  a few minutes.
</p>
<p style="margin:24px 0;">
  <a href="{link}"
     style="background:#339966;color:#fff;padding:12px 24px;text-decoration:none;
            border-radius:4px;font-family:sans-serif;font-size:15px;">
    Complete Registration
  </a>
</p>
<p style="color:#666;font-size:13px;">
  Or copy this link into your browser:<br/>
  <a href="{link}" style="color:#339966;">{link}</a>
</p>
<p>Kind regards,<br/><strong>Casa Moderna</strong></p>
"""
	try:
		frappe.sendmail(recipients=[to], subject=subject, message=message, now=True)
		return True, ""
	except Exception as exc:
		frappe.log_error(frappe.get_traceback(), "Registration invitation email failed")
		return False, str(exc)


def _send_invitation_sms(to: str, link: str) -> "tuple[bool, str]":
	from casamoderna_dms.sms_api import send_sms
	message = (
		f"Casa Moderna has invited you to register as a customer. "
		f"Complete your registration here: {link}"
	)
	ok = send_sms(to, message, sms_type="Registration Invitation")
	if ok:
		return True, ""
	return False, "SMS delivery failed. The invitation link has been recorded — you can copy it from Sent Links."


# ──────────────────────────────────────────────────────────────────────────────
# Internal — notify the staff member who sent the invitation
# ──────────────────────────────────────────────────────────────────────────────

def _notify_invitation_sender(sender_user: str, req):
	"""Email the staff member whose link was used to submit the registration."""
	sender_email = frappe.db.get_value("User", sender_user, "email")
	if not sender_email:
		return
	subject = f"Registration completed: {req.full_name}"
	bill_parts = [
		req.bill_line1 or "",
		req.bill_line2 or "",
		req.bill_locality or "",
		req.bill_postcode or "",
	]
	bill_address = ", ".join(p for p in bill_parts if p)
	message = f"""
<p>Good news — the customer you invited has completed their registration form.</p>
<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
  <tr><td style="padding:4px 12px 4px 0;color:#666;">Name</td><td><strong>{req.full_name}</strong></td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666;">Email</td><td>{req.email}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666;">Mobile</td><td>{req.mobile}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666;">Type</td><td>{req.customer_type}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top;">Address</td><td>{bill_address or "—"}</td></tr>
</table>
<p style="margin-top:16px;">
  <a href="https://www.casamodernadms.eu/dms/customers/registrations/{req.name}"
     style="background:#339966;color:#fff;padding:8px 16px;text-decoration:none;border-radius:3px;">
    Review Registration
  </a>
</p>
"""
	try:
		frappe.sendmail(recipients=[sender_email], subject=subject, message=message, now=True)
	except Exception:
		frappe.log_error(frappe.get_traceback(), "Invitation sender notification failed")


# ──────────────────────────────────────────────────────────────────────────────
# Staff action — convert request into a Customer
# ──────────────────────────────────────────────────────────────────────────────

def _del_address_from_request(req):
	"""Return (del_line1, del_line2, del_locality, del_postcode) honouring same_as_billing."""
	same = bool(req.same_as_billing)
	return (
		req.bill_line1    if same else (req.del_line1 or ""),
		req.bill_line2    if same else (req.del_line2 or ""),
		req.bill_locality if same else (req.del_locality or ""),
		req.bill_postcode if same else (req.del_postcode or ""),
	)


@frappe.whitelist()
def create_customer_from_request(request_name):
	"""
	Create a Customer document from a CM Customer Onboarding Request.

	Returns one of:
	  {"created":  <customer name>}   — new Customer was created
	  {"conflict": {"customer": <name>, "customer_name": <display name>}}
	                                  — a Customer with the same name already exists;
	                                    caller may offer to merge via
	                                    merge_request_into_customer()
	"""
	req = frappe.get_doc("CM Customer Onboarding Request", request_name)

	if req.status == "Converted":
		frappe.throw(_("This request has already been converted to a Customer."))

	# Check for an existing customer with the same name before attempting insert,
	# so we can return a structured conflict response instead of a 417.
	existing = frappe.db.get_value(
		"Customer",
		{"customer_name": ["like", req.full_name]},
		["name", "customer_name"],
		as_dict=True,
	)
	if existing:
		return {"conflict": {"customer": existing.name, "customer_name": existing.customer_name}}

	del_line1, del_line2, del_locality, del_postcode = _del_address_from_request(req)
	customer_group = "Individual" if req.customer_type == "Individual" else "Commercial"

	customer = frappe.get_doc({
		"doctype":        "Customer",
		"customer_name":  req.full_name,
		"customer_type":  req.customer_type,
		"customer_group": customer_group,
		"territory":      "Malta",
		"cm_email":       req.email,
		"cm_mobile":      req.mobile,
		"cm_vat_no":      req.vat_no or "",
		"cm_id_card_no":  req.id_card_no or "",
		"cm_bill_line1":    req.bill_line1,
		"cm_bill_line2":    req.bill_line2 or "",
		"cm_bill_locality": req.bill_locality or "",
		"cm_bill_postcode": req.bill_postcode or "",
		"cm_bill_country":  "Malta",
		"cm_del_line1":    del_line1,
		"cm_del_line2":    del_line2,
		"cm_del_locality": del_locality,
		"cm_del_postcode": del_postcode,
		"cm_del_country":  "Malta",
		"cm_prices_inc_vat": 1,
	})
	customer.insert(ignore_permissions=False)

	req.db_set("status", "Converted")
	req.db_set("created_customer", customer.name)
	frappe.db.commit()

	return {"created": customer.name}


@frappe.whitelist()
def merge_request_into_customer(request_name, customer_name):
	"""
	Apply contact and address data from a CM Customer Onboarding Request onto an
	existing Customer, then mark the request as Converted.

	Used when create_customer_from_request() detects a name conflict and the user
	chooses to update the existing record rather than create a new one.

	Returns the Customer name on success.
	"""
	req = frappe.get_doc("CM Customer Onboarding Request", request_name)

	if req.status == "Converted":
		frappe.throw(_("This request has already been converted."))

	customer = frappe.get_doc("Customer", customer_name)

	del_line1, del_line2, del_locality, del_postcode = _del_address_from_request(req)

	customer.cm_email  = req.email
	customer.cm_mobile = req.mobile
	if req.vat_no:
		customer.cm_vat_no = req.vat_no
	if req.id_card_no:
		customer.cm_id_card_no = req.id_card_no
	customer.cm_bill_line1    = req.bill_line1
	customer.cm_bill_line2    = req.bill_line2 or ""
	customer.cm_bill_locality = req.bill_locality or ""
	customer.cm_bill_postcode = req.bill_postcode or ""
	customer.cm_bill_country  = "Malta"
	customer.cm_del_line1    = del_line1
	customer.cm_del_line2    = del_line2
	customer.cm_del_locality = del_locality
	customer.cm_del_postcode = del_postcode
	customer.cm_del_country  = "Malta"

	customer.save(ignore_permissions=False)

	req.db_set("status", "Converted")
	req.db_set("created_customer", customer.name)
	frappe.db.commit()

	return customer.name
