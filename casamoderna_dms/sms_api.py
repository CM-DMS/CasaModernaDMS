"""
sms_api.py — Brevo Transactional SMS integration for CasaModerna.

Sends appointment confirmation SMS to customers for:
  - Delivery Note scheduling (when cm_delivery_date is set or changed)
  - Consultation appointments (CM Customer Appointment, on creation)

Configuration:
  Set `brevo_sms_api_key` in the site's site_config.json:
    bench --site two.casamodernadms.eu set-config brevo_sms_api_key "YOUR_KEY"
"""

from __future__ import annotations

import frappe

BREVO_SMS_URL = "https://api.brevo.com/v3/transactionalSMS/sms"
SMS_SENDER = "CasaModerna"   # max 11 chars for alphanumeric sender ID
ENQUIRY_PHONE = "2724 7025 / 7737 5157"


# ─── Core send ───────────────────────────────────────────────────────────────


def _get_api_key() -> str | None:
	key = frappe.conf.get("brevo_sms_api_key")
	if not key:
		frappe.log_error(
			title="Brevo SMS: API key not configured",
			message=(
				"Set brevo_sms_api_key in site_config.json to enable SMS notifications.\n"
				"Run: bench --site two.casamodernadms.eu set-config brevo_sms_api_key YOUR_KEY"
			),
		)
	return key


def send_sms(to: str, message: str,
			 sms_type: str = "", customer: str = "",
			 reference_doctype: str = "", reference_name: str = "") -> bool:
	"""Send a transactional SMS via Brevo. Returns True on success.

	The recipient number is normalised: spaces/hyphens stripped, and if
	no country prefix is present +356 (Malta) is prepended.

	Every attempt (success or failure) is written to the CM SMS Log DocType.
	"""
	import requests

	api_key = _get_api_key()
	if not api_key or not to:
		return False

	# Normalise phone number
	phone = to.strip().replace(" ", "").replace("-", "")
	if not phone.startswith("+"):
		phone = "+356" + phone

	payload = {
		"sender": SMS_SENDER,
		"recipient": phone,
		"content": message,
		"type": "transactional",
	}

	status = "Sent"
	error_message = ""
	try:
		resp = requests.post(
			BREVO_SMS_URL,
			json=payload,
			headers={
				"api-key": api_key,
				"Content-Type": "application/json",
				"Accept": "application/json",
			},
			timeout=10,
		)
		resp.raise_for_status()
	except Exception as exc:
		status = "Failed"
		error_message = str(exc)
		frappe.log_error(
			title=f"Brevo SMS failed → {phone}",
			message=error_message,
		)

	# Write to SMS log — fire-and-forget, never block the caller
	try:
		log = frappe.new_doc("CM SMS Log")
		log.sms_type         = sms_type or "Delivery"
		log.status           = status
		log.sent_at          = frappe.utils.now_datetime()
		log.recipient        = phone
		log.customer         = customer or None
		log.reference_doctype = reference_doctype
		log.reference_name   = reference_name
		log.message          = message
		log.error_message    = error_message
		log.insert(ignore_permissions=True)
		frappe.db.commit()
	except Exception:
		frappe.log_error(title="CM SMS Log insert failed")

	return status == "Sent"


# ─── Customer mobile lookup ───────────────────────────────────────────────────


def _get_customer_mobile(customer: str) -> str | None:
	"""Return the primary mobile/phone for a Customer record.

	Checks cm_mobile first (custom field), then ERPNext's mobile_no.
	"""
	for field in ("cm_mobile", "mobile_no"):
		val = frappe.db.get_value("Customer", customer, field)
		if val:
			return val
	return None


# ─── Delivery appointment SMS ─────────────────────────────────────────────────


@frappe.whitelist()
def resend_delivery_appointment_sms(name: str) -> dict:
	"""Manually re-send the delivery appointment SMS. Callable from the frontend."""
	send_delivery_appointment_sms(name)
	return {"ok": True}


def send_delivery_appointment_sms(dn_name: str) -> None:
	"""Send a delivery-date confirmation SMS to the customer on a Delivery Note."""
	doc = frappe.get_doc("Delivery Note", dn_name)
	if not doc.cm_delivery_date:
		return

	mobile = _get_customer_mobile(doc.customer)
	if not mobile:
		frappe.log_error(
			title=f"Delivery SMS skipped — no mobile: {dn_name}",
			message=f"Customer {doc.customer} has no cm_mobile or mobile_no.",
		)
		return

	date_str = frappe.utils.formatdate(str(doc.cm_delivery_date), "dd MMMM yyyy")
	slot = doc.cm_delivery_time_slot or "during the day"
	customer_name = doc.customer_name or doc.customer

	message = (
		f"Dear {customer_name}, your Casa Moderna delivery has been scheduled "
		f"for {date_str} ({slot}). "
		f"To reschedule please call {ENQUIRY_PHONE}."
	)

	send_sms(
		mobile, message,
		sms_type="Delivery",
		customer=doc.customer,
		reference_doctype="Delivery Note",
		reference_name=dn_name,
	)


# ─── Delivery Note hooks ──────────────────────────────────────────────────────


def before_save_delivery_note(doc, method=None):
	"""Capture the current delivery date before save so we can detect changes."""
	if doc.is_new():
		doc.flags.prev_delivery_date = None
	else:
		doc.flags.prev_delivery_date = frappe.db.get_value(
			"Delivery Note", doc.name, "cm_delivery_date"
		)


def after_save_delivery_note(doc, method=None):
	"""Send SMS when cm_delivery_date is first set or changed on a Delivery Note."""
	prev = doc.flags.get("prev_delivery_date")
	if doc.cm_delivery_date and str(doc.cm_delivery_date) != str(prev or ""):
		try:
			send_delivery_appointment_sms(doc.name)
		except Exception:
			frappe.log_error(title=f"Delivery SMS hook failed: {doc.name}")


# ─── Consultation appointment SMS ─────────────────────────────────────────────


@frappe.whitelist()
def resend_consultation_appointment_sms(name: str) -> dict:
	"""Manually re-send the consultation appointment SMS. Callable from the frontend."""
	send_consultation_appointment_sms(name)
	return {"ok": True}


def send_consultation_appointment_sms(apt_name: str) -> None:
	"""Send a consultation appointment confirmation SMS to the customer."""
	doc = frappe.get_doc("CM Customer Appointment", apt_name)

	mobile = _get_customer_mobile(doc.customer)
	if not mobile:
		frappe.log_error(
			title=f"Consultation SMS skipped — no mobile: {apt_name}",
			message=f"Customer {doc.customer} has no cm_mobile or mobile_no.",
		)
		return

	date_str = frappe.utils.formatdate(str(doc.appointment_date), "dd MMMM yyyy")
	apt_type = doc.appointment_type or "appointment"
	customer_name = doc.customer_name or doc.customer

	time_str = ""
	if doc.start_time:
		# start_time comes back as a timedelta or "HH:MM:SS" string
		time_str = f" at {str(doc.start_time)[:5]}"

	salesperson_str = ""
	if doc.salesperson:
		full_name = frappe.db.get_value("User", doc.salesperson, "full_name")
		if full_name:
			salesperson_str = f" with {full_name}"

	message = (
		f"Dear {customer_name}, your Casa Moderna {apt_type} has been confirmed "
		f"for {date_str}{time_str}{salesperson_str}. "
		f"To reschedule please call {ENQUIRY_PHONE}."
	)

	send_sms(
		mobile, message,
		sms_type="Consultation",
		customer=doc.customer,
		reference_doctype="CM Customer Appointment",
		reference_name=apt_name,
	)


# ─── SMS log query ────────────────────────────────────────────────────────────


@frappe.whitelist()
def get_sms_log(
	sms_type: str | None = None,
	status: str | None = None,
	customer: str | None = None,
	from_date: str | None = None,
	to_date: str | None = None,
	limit: int = 200,
) -> list:
	"""Return CM SMS Log rows with optional filters, newest first."""
	filters = []
	if sms_type:
		filters.append(["sms_type", "=", sms_type])
	if status:
		filters.append(["status", "=", status])
	if customer:
		filters.append(["customer", "=", customer])
	if from_date:
		filters.append(["sent_at", ">=", from_date + " 00:00:00"])
	if to_date:
		filters.append(["sent_at", "<=", to_date + " 23:59:59"])

	return frappe.get_all(
		"CM SMS Log",
		filters=filters,
		fields=[
			"name", "sent_at", "sms_type", "status",
			"recipient", "customer", "customer_name",
			"reference_doctype", "reference_name", "message", "error_message",
		],
		order_by="sent_at desc",
		limit_page_length=int(limit),
	)
