from __future__ import annotations

import secrets
import string

import frappe
from frappe.model.document import Document
from frappe.utils import add_days, getdate, today

# Role required to approve/reject company-issued vouchers.
AUTHORIZER_ROLE = "Voucher Authorizer"

# Kept for backward compatibility with existing imports — but no longer used for auth checks.
AUTHORIZER_JASON = "jason.falzon"

# Days validity from creation date when not explicitly overridden.
DEFAULT_VALIDITY_DAYS = 180

# Sources that bypass the authorization workflow (go Draft → Authorized immediately).
NO_AUTH_SOURCES = {"Customer Purchase"}

# When Jason issues a company voucher, auto-bill to the corresponding vouchers account.
JASON_USER = "jason@casamoderna.mt"
COMPANY_PURCHASER_MAP = {
    "Casa Moderna": "Casa Moderna Vouchers Account",
    "Danzah":       "Danzah Limited Vouchers Account",
}

_ALPHABET = string.ascii_uppercase + string.digits


def _generate_voucher_code() -> str:
    """Return a collision-free 12-char uppercase alphanumeric voucher code.

    Uses ``secrets.choice`` (cryptographically random) so codes cannot be
    predicted from previously issued codes.  Retries up to 20 times before
    giving up; the probability of a collision is negligible until the table
    contains hundreds of millions of rows.
    """
    for _ in range(20):
        code = "".join(secrets.choice(_ALPHABET) for _ in range(12))
        if not frappe.db.exists("CM Voucher", {"voucher_code": code}):
            return code
    frappe.throw(
        "Failed to generate a unique voucher code after 20 attempts. "
        "Please try again.",
        frappe.ValidationError,
    )


class CMVoucher(Document):
    # ------------------------------------------------------------------
    # Frappe lifecycle hooks
    # ------------------------------------------------------------------

    def before_insert(self) -> None:
        if not self.voucher_code:
            self.voucher_code = _generate_voucher_code()
        if not self.status:
            self.status = "Draft"
        # Default validity to 180 days if the caller did not supply a date.
        if not self.valid_until:
            self.valid_until = add_days(today(), DEFAULT_VALIDITY_DAYS)
        # Default source for backwards compatibility with pre-source records.
        if not self.voucher_source:
            self.voucher_source = "Customer Purchase"

    def validate(self) -> None:
        self._auto_set_company_purchaser()
        self._validate_parties()
        self._validate_voucher_value()
        self._validate_validity_date()
        self._check_auto_authorize()

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _auto_set_company_purchaser(self) -> None:
        """When Jason creates a company-issued voucher, silently populate purchaser_customer
        with the matching vouchers account so the billing party is always correct."""
        if frappe.session.user != JASON_USER:
            return
        mapped = COMPANY_PURCHASER_MAP.get(self.voucher_source)
        if mapped:
            self.purchaser_customer = mapped

    def _validate_parties(self) -> None:
        source = self.voucher_source or "Customer Purchase"
        # Purchaser is required only for customer-purchased vouchers.
        if source == "Customer Purchase" and not self.purchaser_customer:
            frappe.throw(
                "Purchaser Customer is required for Customer Purchase vouchers.",
                frappe.ValidationError,
            )
        if not self.recipient_customer:
            frappe.throw(
                "Recipient Customer is required.",
                frappe.ValidationError,
            )

    def _validate_voucher_value(self) -> None:
        if self.voucher_value is not None and float(self.voucher_value) <= 0:
            frappe.throw(
                "Voucher value must be greater than zero.",
                frappe.ValidationError,
            )

    def _validate_validity_date(self) -> None:
        """Prevent setting a past expiry on drafts or pending-authorization vouchers."""
        if not self.valid_until:
            return
        if self.status not in ("Draft", "Pending Authorization"):
            return
        if getdate(self.valid_until) < getdate(today()):
            frappe.throw(
                "Validity date cannot be in the past.",
                frappe.ValidationError,
            )

    def _check_auto_authorize(self) -> None:
        """Auto-transition to Authorized for Customer Purchase vouchers, or when
        Jason has approved a company-issued voucher."""
        if self.status != "Pending Authorization":
            return
        source = self.voucher_source or "Customer Purchase"
        if source in NO_AUTH_SOURCES:
            # Customer already paid — no human authorization needed.
            self.status = "Authorized"
        elif self.authorized_by_jason:
            # Jason has signed off on a company-issued voucher.
            self.status = "Authorized"
