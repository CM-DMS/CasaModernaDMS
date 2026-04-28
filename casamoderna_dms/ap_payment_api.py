"""
ap_payment_api.py — Accounts Payable: invoice logging helpers and payment processing.

Provides three whitelisted endpoints:

  get_ap_due_list(company)        — all unpaid Purchase Invoices with due-date urgency
  make_ap_payment(...)            — create + submit a Payment Entry (Pay) against a PI
  get_bill_payment_history(name)  — payment entries already applied to a specific PI

Payment channels supported (matched by Mode of Payment name):
  - MyPOS                 (Bank account type)
  - Bank of Valletta      (Bank account type)
  - Petty Cash            (Cash account type)

Account mapping is resolved automatically via the Mode of Payment Account table
for the company — no hard-coding of account names here.
"""

import frappe
from frappe import _
from frappe.utils import flt, today, date_diff


# ---------------------------------------------------------------------------
# 1. AP Due List
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_ap_due_list(company=None):
    """Return all unpaid Purchase Invoices with due-date and urgency info.

    One row per PI.  Due date is the earliest unpaid Payment Schedule tranche,
    falling back to the PI-level due_date, then posting_date.

    days_overdue:
        positive  → overdue by that many days
        zero      → due today
        negative  → due in abs(days_overdue) days
    """
    if not company:
        company = frappe.defaults.get_global_default("company")

    rows = frappe.db.sql(
        """
        SELECT
            pi.name                                                             AS bill_name,
            pi.supplier_name,
            pi.bill_no,
            pi.posting_date,
            pi.status,
            pi.grand_total,
            pi.outstanding_amount                                               AS amount_due,
            COALESCE(
                (
                    SELECT MIN(ps.due_date)
                    FROM   `tabPayment Schedule` ps
                    WHERE  ps.parent                                      = pi.name
                      AND  ps.payment_amount - COALESCE(ps.paid_amount, 0) > 0.009
                ),
                pi.due_date
            )                                                                   AS due_date
        FROM   `tabPurchase Invoice` pi
        WHERE  pi.company           = %(company)s
          AND  pi.docstatus         = 1
          AND  pi.outstanding_amount > 0.009
        ORDER BY due_date, pi.supplier_name
        """,
        {"company": company},
        as_dict=True,
    )

    _today = today()
    for r in rows:
        r.days_overdue = date_diff(_today, str(r.due_date)) if r.due_date else 0

    return rows


# ---------------------------------------------------------------------------
# 2. Make AP Payment
# ---------------------------------------------------------------------------

@frappe.whitelist()
def make_ap_payment(
    bill_name,
    amount,
    mode_of_payment,
    posting_date,
    reference_no=None,
    reference_date=None,
    remarks=None,
):
    """Create and submit a Payment Entry (type=Pay) against a Purchase Invoice.

    Uses ERPNext's standard get_payment_entry() to pre-fill all GL accounts
    correctly, then overrides: mode_of_payment, amount, dates, and references.

    Returns {"payment_entry": name, "amount": float, "mode_of_payment": str}.
    """
    from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

    # ── Load and validate the bill ─────────────────────────────────────────
    bill = frappe.get_doc("Purchase Invoice", bill_name)

    if bill.docstatus != 1:
        frappe.throw(_("Bill must be submitted before making a payment."))

    outstanding = flt(bill.outstanding_amount)
    if outstanding <= 0:
        frappe.throw(_("This bill is already fully paid."))

    amount = flt(amount)
    if amount <= 0:
        frappe.throw(_("Payment amount must be greater than zero."))
    if amount > outstanding + 0.009:
        frappe.throw(
            _("Payment amount ({0}) cannot exceed outstanding balance ({1}).").format(
                frappe.format(amount, {"fieldtype": "Currency"}),
                frappe.format(outstanding, {"fieldtype": "Currency"}),
            )
        )

    # ── Build the payment entry via ERPNext helper ─────────────────────────
    pe = get_payment_entry("Purchase Invoice", bill_name, party_amount=amount)

    pe.posting_date    = posting_date
    pe.mode_of_payment = mode_of_payment
    pe.paid_amount     = amount
    pe.received_amount = amount
    pe.reference_no    = reference_no or ""
    pe.reference_date  = reference_date or ""
    pe.remarks         = remarks or f"Payment against {bill_name}"

    # Override paid_from account from the Mode of Payment → company mapping
    mop_account = frappe.db.get_value(
        "Mode of Payment Account",
        {"parent": mode_of_payment, "company": bill.company},
        "default_account",
    )
    if mop_account:
        pe.paid_from = mop_account

    # Adjust allocated_amount on the reference row for partial payments
    for ref in pe.get("references") or []:
        if (
            ref.reference_doctype == "Purchase Invoice"
            and ref.reference_name == bill_name
        ):
            ref.allocated_amount = amount

    pe.insert(ignore_permissions=False)
    pe.submit()

    return {
        "payment_entry": pe.name,
        "amount": amount,
        "mode_of_payment": mode_of_payment,
    }


# ---------------------------------------------------------------------------
# 3. Payment history for a specific bill
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_bill_payment_history(bill_name):
    """Return submitted Payment Entries (Pay) applied to this Purchase Invoice."""
    return frappe.db.sql(
        """
        SELECT
            pe.name              AS payment_entry,
            pe.posting_date,
            pe.mode_of_payment,
            pe.reference_no,
            pe.reference_date,
            per.allocated_amount,
            pe.remarks
        FROM   `tabPayment Entry Reference` per
        JOIN   `tabPayment Entry`           pe  ON pe.name = per.parent
        WHERE  per.reference_doctype = 'Purchase Invoice'
          AND  per.reference_name    = %(bill_name)s
          AND  pe.docstatus          = 1
          AND  pe.payment_type       = 'Pay'
        ORDER BY pe.posting_date, pe.creation
        """,
        {"bill_name": bill_name},
        as_dict=True,
    )


# ---------------------------------------------------------------------------
# 4. Payment modes
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_payment_modes():
    """Return names of all active Modes of Payment for the AP payment form."""
    return frappe.get_all("Mode of Payment", pluck="name", order_by="name")
