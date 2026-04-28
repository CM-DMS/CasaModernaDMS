"""
otp_login_api.py  --  Passwordless TOTP login for DMS frontend.

Users authenticate with their phone authenticator app (Google Authenticator,
Microsoft Authenticator, etc.).  No password is involved — mTLS verifies the
device and the TOTP code verifies the person.

Named desk-access users may alternatively log in with their Frappe password to
bypass OTP — this powers the admin-desk shortcut so they are never locked out.
Access is controlled by the DESK_ACCESS_USERS set in this file.

Flow:
  1. POST otp_login  { "usr": "..." }
       -> First-time: sends QR-code setup email, returns {setup: false}.
       -> Returning:  returns {setup: true, method: "OTP App"}.
  2. POST otp_verify { "otp": "...", "tmp_id": "..." }
       -> Verifies the 6-digit TOTP code and creates a session.

  Desk access bypass (DESK_ACCESS_USERS only):
    POST password_login { "usr": "...", "pwd": "..." }
       -> Verifies Frappe password and creates a session.

  Re-setup:
    POST resend_qr_setup { "tmp_id": "..." }
       -> Resets OTP secret, sends new QR-code email.
"""

import pyotp

import frappe
from frappe import _
from frappe.twofactor import (
    clear_default,
    get_default,
    get_link_for_qrcode,
    get_otpsecret_for_,
    send_token_via_email,
    set_default,
    get_email_body_for_qr_code,
    get_email_subject_for_qr_code,
)


OTP_EXPIRY = 300  # 5 minutes — cache lifetime for the 2FA challenge

# Users permitted to bypass OTP and use the admin-desk password shortcut.
# Controlled by name — independent of Frappe role assignments so access
# cannot be lost due to a role misconfiguration.
DESK_ACCESS_USERS = {"brian.borg", "jason.falzon"}


def _s(value):
    """Decode bytes returned by Redis to str."""
    return value.decode() if isinstance(value, bytes) else value


def _is_desk_access_user(raw_input):
    """Return True if raw_input matches a DESK_ACCESS_USERS entry.

    Accepts both plain username ('brian.borg') and email form
    ('brian@casamoderna.mt') — the username part before '@' is checked.
    """
    normalised = raw_input.strip().lower()
    username = normalised.split("@")[0] if "@" in normalised else normalised
    return username in DESK_ACCESS_USERS


def _validate_user(usr):
    """Resolve username or email to canonical user ID (email), or throw.

    Resolution rules:
      - name.surname (no @) → always resolved via Frappe ``username`` field.
        name.surname always prevails; it is never matched against User.name.
      - email (contains @) → matched directly against User.name.
    """
    if not usr:
        frappe.throw(_("Username is required"), frappe.AuthenticationError)

    usr = usr.strip().lower()

    if "@" not in usr:
        # name.surname format — resolve exclusively through the username field.
        email = frappe.db.get_value("User", {"username": usr, "enabled": 1}, "name")
        if not email:
            frappe.throw(_("Invalid login credentials"), frappe.AuthenticationError)
        usr = email
    elif not frappe.db.exists("User", usr):
        frappe.throw(_("Invalid login credentials"), frappe.AuthenticationError)

    user_doc = frappe.get_doc("User", usr)
    if not user_doc.enabled:
        frappe.throw(_("User disabled or missing"), frappe.AuthenticationError)

    return usr


def _cache_challenge(tmp_id, usr, otp_secret):
    """Store challenge data in Redis with expiry."""
    for key, value in {"_usr": usr, "_otp_secret": otp_secret}.items():
        frappe.cache.set(f"{tmp_id}{key}", value)
        frappe.cache.expire(f"{tmp_id}{key}", OTP_EXPIRY)


def _send_qr_email(usr, otp_secret):
    """Send the QR-code setup email for first-time authenticator registration."""
    otp_issuer = (
        frappe.db.get_single_value("System Settings", "otp_issuer_name")
        or "Casa Moderna DMS"
    )
    totp_uri = pyotp.TOTP(otp_secret).provisioning_uri(usr, issuer_name=otp_issuer)
    qrcode_link = get_link_for_qrcode(usr, totp_uri)
    message = get_email_body_for_qr_code({"qrcode_link": qrcode_link})
    subject = get_email_subject_for_qr_code({"qrcode_link": qrcode_link})
    token = int(pyotp.TOTP(otp_secret).now())
    send_token_via_email(usr, token, otp_secret, otp_issuer, subject=subject, message=message)


# ── Public endpoints ────────────────────────────────────────────────────────


@frappe.whitelist(allow_guest=True)
def otp_login(usr):
    """Step 1: validate user, generate TOTP challenge."""
    # Capture raw input before resolution for the desk-access check.
    raw_usr = usr
    usr = _validate_user(usr)

    otp_secret = _s(get_otpsecret_for_(usr))
    tmp_id = frappe.generate_hash(length=8)
    _cache_challenge(tmp_id, usr, otp_secret)

    setup_done = bool(get_default(usr + "_otplogin"))

    if not setup_done:
        _send_qr_email(usr, otp_secret)

    verification = {
        "method": "OTP App",
        "setup": setup_done,
    }

    password_allowed = _is_desk_access_user(raw_usr)

    return {
        "verification": verification,
        "tmp_id": tmp_id,
        "password_allowed": password_allowed,
    }


@frappe.whitelist(allow_guest=True)
def otp_verify(otp, tmp_id):
    """Step 2: verify TOTP code and create session."""
    if not otp or not tmp_id:
        frappe.throw(_("OTP and tmp_id are required"), frappe.AuthenticationError)

    usr = _s(frappe.cache.get(f"{tmp_id}_usr"))
    otp_secret = _s(frappe.cache.get(f"{tmp_id}_otp_secret"))

    if not usr or not otp_secret:
        frappe.throw(
            _("Login session expired. Please start again."),
            frappe.AuthenticationError,
        )

    # Verify the TOTP code.
    totp = pyotp.TOTP(otp_secret)
    if not totp.verify(otp):
        frappe.throw(_("Incorrect verification code"), frappe.AuthenticationError)

    # Clear the challenge cache.
    for suffix in ("_usr", "_otp_secret"):
        frappe.cache.delete(f"{tmp_id}{suffix}")

    # Mark first-time OTP setup as complete (suppresses QR email on next login).
    if not get_default(usr + "_otplogin"):
        set_default(usr + "_otplogin", 1)

    # Create the Frappe session.
    from frappe.auth import LoginManager

    login_manager = LoginManager()
    login_manager.login_as(usr)

    return {"message": "Logged In"}


@frappe.whitelist(allow_guest=True)
def password_login(usr, pwd):
    """Desk-access users only: login with Frappe password, bypassing OTP.

    Used by the admin-desk shortcut so that named access users can always
    reach Frappe Desk even when the TOTP authenticator app is unavailable.
    """
    # Gate on raw input first — before any DB lookup — so the check is
    # immune to how the User record is configured in Frappe.
    if not _is_desk_access_user(usr):
        frappe.throw(
            _("Password login is not available for this account."),
            frappe.AuthenticationError,
        )

    usr = _validate_user(usr)

    from frappe.utils.password import check_password

    check_password(usr, pwd)  # raises AuthenticationError if wrong

    from frappe.auth import LoginManager

    login_manager = LoginManager()
    login_manager.login_as(usr)

    return {"message": "Logged In"}


@frappe.whitelist(allow_guest=True)
def resend_qr_setup(tmp_id):
    """Reset OTP secret and resend QR-code setup email."""
    if not tmp_id:
        frappe.throw(_("Session ID is required"), frappe.AuthenticationError)

    usr = _s(frappe.cache.get(f"{tmp_id}_usr"))
    if not usr:
        frappe.throw(
            _("Login session expired. Please start again."),
            frappe.AuthenticationError,
        )

    # Wipe old OTP secret and setup flag.
    clear_default(usr + "_otpsecret")
    clear_default(usr + "_otplogin")

    # Generate a fresh secret and send the QR email.
    otp_secret = _s(get_otpsecret_for_(usr))
    _send_qr_email(usr, otp_secret)

    # Update the cached secret so otp_verify uses the new one.
    frappe.cache.set(f"{tmp_id}_otp_secret", otp_secret)
    frappe.cache.expire(f"{tmp_id}_otp_secret", OTP_EXPIRY)

    return {
        "verification": {"method": "OTP App", "setup": False},
        "tmp_id": tmp_id,
    }


@frappe.whitelist()
def admin_reset_otp(usr):
    """Admin: clear a user's OTP secret and send a fresh QR-code setup email.

    Requires the caller to be logged in with the System Manager role.
    This lets administrators reset the authenticator for a user who has lost
    access to their authenticator app, without needing an active login session
    for that user.
    """
    # Only System Managers may call this endpoint.
    if "System Manager" not in frappe.get_roles(frappe.session.user):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    usr = _validate_user(usr)

    # Wipe the old OTP secret and setup flag so the next otp_login triggers
    # a fresh QR-code email and the user must re-register their device.
    clear_default(usr + "_otpsecret")
    clear_default(usr + "_otplogin")

    # Generate a new secret and dispatch the setup email immediately.
    otp_secret = _s(get_otpsecret_for_(usr))
    _send_qr_email(usr, otp_secret)

    return {"message": "Authenticator reset. Setup email sent to user."}
