# Copyright (c) 2026, CasaModerna
# Jason Cash & Bank Summary — all money in/out across Bank and Cash accounts,
# with an optional Accounts Payable Due section at the bottom.
#
# Account classification (ERPNext Chart of Accounts):
#   account_type = 'Bank'  → Bank of Valletta, MyPOS
#   account_type = 'Cash'  → Petty Cash
#
# Debit  = money flowing INTO the account  (income, deposits received)
# Credit = money flowing OUT of the account (payments made, withdrawals)

import frappe
from frappe import _
from frappe.utils import flt, today


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def execute(filters=None):
    filters = frappe._dict(filters or {})
    _set_defaults(filters)

    columns = _get_columns()
    data = []

    accounts = _get_bank_cash_accounts(filters.company)

    grand_in = 0.0
    grand_out = 0.0

    for account in accounts:
        opening_bal = _get_opening_balance(account.name, filters)  # noqa
        entries = _get_period_entries(account.name, filters)

        # ── Section header ──────────────────────────────────────────────────
        data.append(_section_header(f"{account.account_name}  [{account.account_type}]"))

        # ── Opening balance row ─────────────────────────────────────────────
        data.append({
            "date": filters.from_date,
            "voucher_type": "Opening",
            "voucher_no": "",
            "party": "",
            "remarks": "Opening Balance",
            "money_in": None,
            "money_out": None,
            "balance": opening_bal,
        })

        running = opening_bal
        acct_in = 0.0
        acct_out = 0.0

        for e in entries:
            running += flt(e.money_in) - flt(e.money_out)
            acct_in += flt(e.money_in)
            acct_out += flt(e.money_out)
            e["balance"] = running
            data.append(e)

        grand_in += acct_in
        grand_out += acct_out

        # ── Account closing subtotal ────────────────────────────────────────
        data.append(_subtotal_row(
            label=f"Closing Balance — {account.account_name}",
            money_in=acct_in,
            money_out=acct_out,
            balance=running,
        ))
        data.append(_blank())

    # ── Grand total across all accounts ────────────────────────────────────
    data.append(_section_header("GRAND TOTAL — ALL ACCOUNTS"))
    data.append(_subtotal_row(
        label="Net Movement this Period",
        money_in=grand_in,
        money_out=grand_out,
        balance=None,
    ))

    # ── AP Due section (optional) ───────────────────────────────────────────
    if filters.get("show_ap_due"):
        data.append(_blank())
        data += _ap_due_section(filters)

    return columns, data


# ---------------------------------------------------------------------------
# Column definitions
# ---------------------------------------------------------------------------

def _get_columns():
    return [
        {
            "label": _("Date"),
            "fieldname": "date",
            "fieldtype": "Date",
            "width": 100,
        },
        {
            "label": _("Type"),
            "fieldname": "voucher_type",
            "fieldtype": "Data",
            "width": 130,
        },
        {
            "label": _("Reference"),
            "fieldname": "voucher_no",
            "fieldtype": "Data",
            "width": 190,
        },
        {
            "label": _("Party"),
            "fieldname": "party",
            "fieldtype": "Data",
            "width": 160,
        },
        {
            "label": _("Description"),
            "fieldname": "remarks",
            "fieldtype": "Data",
            "width": 320,
        },
        {
            "label": _("Money In (€)"),
            "fieldname": "money_in",
            "fieldtype": "Currency",
            "width": 130,
        },
        {
            "label": _("Money Out (€)"),
            "fieldname": "money_out",
            "fieldtype": "Currency",
            "width": 130,
        },
        {
            "label": _("Balance (€)"),
            "fieldname": "balance",
            "fieldtype": "Currency",
            "width": 130,
        },
    ]


# ---------------------------------------------------------------------------
# Data queries
# ---------------------------------------------------------------------------

def _get_bank_cash_accounts(company):
    """Return all non-group Bank and Cash type accounts for the company,
    ordered so Bank accounts appear before Cash."""
    return frappe.db.sql(
        """
        SELECT name, account_name, account_type
        FROM   `tabAccount`
        WHERE  company      = %(company)s
          AND  account_type IN ('Bank', 'Cash')
          AND  is_group     = 0
          AND  disabled     = 0
        ORDER BY
               FIELD(account_type, 'Bank', 'Cash'),
               account_name
        """,
        {"company": company},
        as_dict=True,
    )


def _get_opening_balance(account, filters):
    """Sum of all posted GL movements for the account strictly before from_date."""
    row = frappe.db.sql(
        """
        SELECT COALESCE(SUM(debit) - SUM(credit), 0) AS balance
        FROM   `tabGL Entry`
        WHERE  account      = %(account)s
          AND  company      = %(company)s
          AND  posting_date < %(from_date)s
          AND  is_cancelled = 0
        """,
        {
            "account": account,
            "company": filters.company,
            "from_date": filters.from_date,
        },
        as_dict=True,
    )
    return flt(row[0].balance) if row else 0.0


def _get_period_entries(account, filters):
    """All GL entries for the account within the date range."""
    rows = frappe.db.sql(
        """
        SELECT
            gle.posting_date                                AS date,
            gle.voucher_type,
            gle.voucher_no,
            COALESCE(NULLIF(gle.party, ''), '')            AS party,
            COALESCE(NULLIF(gle.remarks, ''), '')          AS remarks,
            CASE WHEN gle.debit  > 0 THEN gle.debit  ELSE NULL END AS money_in,
            CASE WHEN gle.credit > 0 THEN gle.credit ELSE NULL END AS money_out
        FROM   `tabGL Entry` gle
        WHERE  gle.account      = %(account)s
          AND  gle.company      = %(company)s
          AND  gle.posting_date BETWEEN %(from_date)s AND %(to_date)s
          AND  gle.is_cancelled = 0
        ORDER BY gle.posting_date, gle.creation
        """,
        {
            "account": account,
            "company": filters.company,
            "from_date": filters.from_date,
            "to_date": filters.to_date,
        },
        as_dict=True,
    )
    return rows


def _ap_due_section(filters):
    """Return rows showing unpaid/partially-paid Purchase Invoices:
    overdue first, then due within the next 30 days."""
    rows = frappe.db.sql(
        """
        SELECT
            ps.due_date,
            pi.name                                              AS voucher_no,
            pi.supplier_name,
            pi.bill_no,
            pi.posting_date,
            ps.payment_amount - COALESCE(ps.paid_amount, 0)     AS amount_due,
            DATEDIFF(%(today)s, ps.due_date)                     AS days_overdue
        FROM   `tabPayment Schedule` ps
        JOIN   `tabPurchase Invoice`  pi ON pi.name = ps.parent
        WHERE  pi.company      = %(company)s
          AND  pi.docstatus    = 1
          AND  pi.status      != 'Paid'
          AND  ps.due_date    <= DATE_ADD(%(today)s, INTERVAL 30 DAY)
          AND  ps.payment_amount - COALESCE(ps.paid_amount, 0) > 0.009
        ORDER BY ps.due_date
        """,
        {"company": filters.company, "today": today()},
        as_dict=True,
    )

    if not rows:
        return [_section_header("AP DUE — Nothing due in next 30 days")]

    data = [_section_header("AP DUE — Invoices to Pay (overdue + next 30 days)")]
    data.append({
        "date": None,
        "voucher_type": "Due Date",
        "voucher_no": "Invoice",
        "party": "Supplier",
        "remarks": "Supplier Invoice Ref",
        "money_in": None,
        "money_out": None,
        "balance": None,
    })

    total_due = 0.0
    for r in rows:
        overdue_label = ""
        if flt(r.days_overdue) > 0:
            overdue_label = f"  ⚠ {int(r.days_overdue)} days OVERDUE"

        data.append({
            "date": r.due_date,
            "voucher_type": "Purchase Invoice",
            "voucher_no": r.voucher_no,
            "party": r.supplier_name or "",
            "remarks": (r.bill_no or "") + overdue_label,
            "money_in": None,
            "money_out": flt(r.amount_due),
            "balance": None,
        })
        total_due += flt(r.amount_due)

    data.append(_subtotal_row(
        label="Total AP Due (next 30 days)",
        money_in=None,
        money_out=total_due,
        balance=None,
    ))
    return data


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _set_defaults(filters):
    import frappe.utils
    if not filters.get("company"):
        filters.company = frappe.defaults.get_global_default("company")
    if not filters.get("from_date"):
        filters.from_date = frappe.utils.get_first_day(today()).strftime("%Y-%m-%d")
    if not filters.get("to_date"):
        filters.to_date = today()


def _section_header(label):
    return {
        "date": None,
        "voucher_type": None,
        "voucher_no": None,
        "party": None,
        "remarks": label,
        "money_in": None,
        "money_out": None,
        "balance": None,
    }


def _subtotal_row(label, money_in, money_out, balance):
    return {
        "date": None,
        "voucher_type": None,
        "voucher_no": None,
        "party": None,
        "remarks": label,
        "money_in": money_in,
        "money_out": money_out,
        "balance": balance,
    }


def _blank():
    return {
        "date": None,
        "voucher_type": None,
        "voucher_no": None,
        "party": None,
        "remarks": "",
        "money_in": None,
        "money_out": None,
        "balance": None,
    }
