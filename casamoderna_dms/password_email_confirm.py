"""
Email-verified password change.

Overrides frappe.core.doctype.user.user.update_password so that when a
**logged-in** user changes their own password (old_password → new_password),
the change is NOT applied immediately.  Instead a confirmation email is sent,
and the password is only changed when the user clicks the link.

The "forgot password" flow (key-based) is untouched — it already requires
email access to obtain the reset key.
"""
import frappe
from frappe import _
from frappe.utils import get_url, now_datetime, cint
from frappe.core.doctype.user.user import (
    test_password_strength,
    _get_user_for_update_password,
    MAX_PASSWORD_SIZE,
)
from frappe.utils.password import update_password as _update_password


PENDING_CHANGE_TTL = 1800  # 30 minutes


@frappe.whitelist(allow_guest=True, methods=["POST"])
def update_password_with_email_confirm(
    new_password: str,
    logout_all_sessions: int = 0,
    key: str | None = None,
    old_password: str | None = None,
):
    """
    Drop-in replacement for frappe.core.doctype.user.user.update_password.

    - key-based resets (forgot-password): pass through unchanged.
    - old_password-based changes (logged-in user): hold & send confirmation.
    """
    if len(new_password) > MAX_PASSWORD_SIZE:
        frappe.throw(_("Password too long"))

    # ---------- Key-based reset (already required email access) ----------
    if key:
        return _original_update_password(new_password, logout_all_sessions, key, None)

    # ---------- Logged-in password change: require email confirmation ----
    if not old_password:
        frappe.throw(_("Current password is required"))

    # Verify current password (raises AuthenticationError if wrong)
    result = _get_user_for_update_password(key=None, old_password=old_password)
    user = result.get("user") if isinstance(result, dict) else getattr(result, "user", None)
    if not user:
        frappe.throw(_("Invalid credentials"), frappe.AuthenticationError)

    # Validate strength of new password
    user_data = frappe.get_doc("User", user)
    test_password_strength(
        new_password,
        user_data=user_data.as_dict(),
    )

    # Store pending change in a short-lived cache key
    token = frappe.generate_hash(length=32)
    cache_key = f"pending_password_change:{token}"
    frappe.cache.set_value(
        cache_key,
        {
            "user": user,
            "new_password": new_password,
            "logout_all_sessions": cint(logout_all_sessions),
            "requested_at": str(now_datetime()),
        },
        expires_in_sec=PENDING_CHANGE_TTL,
    )

    # Send confirmation email
    confirm_url = get_url(
        f"/api/method/casamoderna_dms.password_email_confirm.confirm_password_change?token={token}"
    )
    frappe.sendmail(
        recipients=[user],
        subject=_("Confirm your password change — Casa Moderna"),
        message=_(
            "<p>A password change was requested for your account.</p>"
            "<p><b>If you made this request</b>, click the link below to confirm:</p>"
            '<p><a href="{url}" style="padding:10px 20px;background:#0070f3;color:#fff;'
            'text-decoration:none;border-radius:4px;display:inline-block;">Confirm Password Change</a></p>'
            "<p>This link expires in 30 minutes.</p>"
            "<p>If you did NOT request this, ignore this email — your password will remain unchanged.</p>"
        ).format(url=confirm_url),
        now=True,
    )

    frappe.msgprint(
        _("A confirmation email has been sent to your registered address. "
          "Please click the link in the email to complete the password change."),
        title=_("Confirmation Required"),
        indicator="blue",
    )

    return {"message": "confirmation_email_sent"}


@frappe.whitelist(allow_guest=True, methods=["GET", "POST"])
def confirm_password_change(token: str):
    """Called when the user clicks the confirmation link in their email."""
    if not token:
        frappe.throw(_("Invalid token"), frappe.AuthenticationError)

    cache_key = f"pending_password_change:{token}"
    pending = frappe.cache.get_value(cache_key)

    if not pending:
        frappe.respond_as_web_page(
            _("Link Expired or Invalid"),
            _("This password change link has expired or has already been used. "
              "Please request a new password change."),
            indicator_color="red",
        )
        return

    # Apply the password change
    user = pending["user"]
    new_password = pending["new_password"]
    logout_all_sessions = pending.get("logout_all_sessions", 0)

    _update_password(user, new_password, logout_all_sessions=cint(logout_all_sessions))

    # Clear the reset_password_key and set last_password_reset_date
    frappe.db.set_value("User", user, {
        "reset_password_key": None,
        "last_password_reset_date": frappe.utils.today(),
    })

    # Delete the pending token
    frappe.cache.delete_value(cache_key)

    frappe.db.commit()

    frappe.respond_as_web_page(
        _("Password Changed Successfully"),
        _("Your password has been updated. You can now log in with your new password."),
        indicator_color="green",
    )


def _original_update_password(new_password, logout_all_sessions, key, old_password):
    """Call the original Frappe update_password for key-based resets."""
    from frappe.core.doctype.user.user import update_password as _frappe_update_password
    return _frappe_update_password(
        new_password=new_password,
        logout_all_sessions=logout_all_sessions,
        key=key,
        old_password=old_password,
    )
