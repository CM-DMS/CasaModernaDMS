"""
bank_reconciliation_api.py — Bank statement import and reconciliation for Casa Moderna.

Flow:
  1. User uploads/pastes bank statement lines (CSV or manual entry)
  2. System stores them in CM Bank Statement Line doctype
  3. Auto-match attempts to find Payment Entries or Journal Entries
     with the same amount ± 0.01 and same/near date
  4. User confirms or manually overrides each match
  5. Matched lines → linked to the payment; unmatched = outstanding
"""
from __future__ import annotations

import frappe
from frappe import _


@frappe.whitelist()
def get_statement_lines(
    account: str = "",
    date_from: str = "",
    date_to: str = "",
    status: str = "",
    limit: int = 200,
) -> list[dict]:
    """Return CM Bank Statement Lines with optional filters."""
    if not frappe.has_permission("Payment Entry", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    filters: list = []
    if account:
        filters.append(["bank_account", "=", account])
    if date_from:
        filters.append(["transaction_date", ">=", date_from])
    if date_to:
        filters.append(["transaction_date", "<=", date_to])
    if status:
        filters.append(["reconciliation_status", "=", status])

    return frappe.get_list(
        "CM Bank Statement Line",
        filters=filters,
        fields=[
            "name", "bank_account", "transaction_date", "description",
            "debit", "credit", "balance", "currency",
            "reconciliation_status", "matched_doctype", "matched_document",
            "reference_number",
        ],
        order_by="transaction_date desc",
        limit_page_length=int(limit),
    )


@frappe.whitelist()
def import_statement_lines(lines: list | str, bank_account: str) -> dict:
    """
    Bulk-import bank statement lines.

    Each line: {transaction_date, description, debit, credit, balance, reference_number}
    Returns {created: N, duplicates: M}
    """
    import json
    if isinstance(lines, str):
        lines = json.loads(lines)

    if not frappe.has_permission("Payment Entry", "write"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    created = 0
    duplicates = 0

    for line in lines:
        # Deduplicate: same account + date + amount + reference
        ref = line.get("reference_number", "")
        dup = frappe.db.exists(
            "CM Bank Statement Line",
            {
                "bank_account": bank_account,
                "transaction_date": line["transaction_date"],
                "debit": float(line.get("debit") or 0),
                "credit": float(line.get("credit") or 0),
                "reference_number": ref,
            },
        )
        if dup:
            duplicates += 1
            continue

        d = frappe.new_doc("CM Bank Statement Line")
        d.bank_account = bank_account
        d.transaction_date = line["transaction_date"]
        d.description = line.get("description", "")
        d.debit = float(line.get("debit") or 0)
        d.credit = float(line.get("credit") or 0)
        d.balance = float(line.get("balance") or 0)
        d.reference_number = ref
        d.currency = line.get("currency", "EUR")
        d.reconciliation_status = "Unmatched"
        d.save(ignore_permissions=True)
        created += 1

    frappe.db.commit()
    return {"created": created, "duplicates": duplicates}


@frappe.whitelist()
def auto_match_lines(bank_account: str, date_from: str = "", date_to: str = "") -> dict:
    """
    Attempt to auto-match unmatched statement lines to Payment Entries.

    Matching logic:
      - Amount match (credit == payment_amount ± 0.01)
      - Date within ±3 days of payment_date
    Returns {matched: N, unmatched: M}
    """
    if not frappe.has_permission("Payment Entry", "write"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    filters = {"bank_account": bank_account, "reconciliation_status": "Unmatched"}
    if date_from:
        filters["transaction_date"] = [">=", date_from]

    unmatched_lines = frappe.get_list(
        "CM Bank Statement Line",
        filters=filters,
        fields=["name", "transaction_date", "credit", "debit", "reference_number"],
    )

    matched_count = 0

    for line in unmatched_lines:
        amount = float(line["credit"] or 0) or float(line["debit"] or 0)
        if amount == 0:
            continue

        # Try to find Payment Entry matching amount ± 0.01 within ±3 days
        candidates = frappe.db.sql(
            """
            SELECT name, payment_type, paid_amount, reference_no
            FROM `tabPayment Entry`
            WHERE docstatus = 1
              AND ABS(paid_amount - %(amt)s) < 0.01
              AND ABS(DATEDIFF(posting_date, %(dt)s)) <= 3
            ORDER BY ABS(DATEDIFF(posting_date, %(dt)s)), ABS(paid_amount - %(amt)s)
            LIMIT 1
            """,
            {"amt": amount, "dt": str(line["transaction_date"])[:10]},
            as_dict=True,
        )

        if candidates:
            match = candidates[0]
            frappe.db.set_value(
                "CM Bank Statement Line",
                line["name"],
                {
                    "reconciliation_status": "Auto-Matched",
                    "matched_doctype": "Payment Entry",
                    "matched_document": match["name"],
                },
            )
            matched_count += 1

    frappe.db.commit()
    total = len(unmatched_lines)
    return {"matched": matched_count, "unmatched": total - matched_count, "total": total}


@frappe.whitelist()
def confirm_match(line_name: str, matched_doctype: str, matched_document: str) -> dict:
    """Manually confirm or override a match for a bank statement line."""
    if not frappe.has_permission("Payment Entry", "write"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    frappe.db.set_value(
        "CM Bank Statement Line",
        line_name,
        {
            "reconciliation_status": "Reconciled",
            "matched_doctype": matched_doctype,
            "matched_document": matched_document,
        },
    )
    frappe.db.commit()
    return {"status": "ok"}


@frappe.whitelist()
def mark_exception(line_name: str, reason: str = "") -> dict:
    """Mark a line as an exception (no matching payment — fee, charge, etc.)."""
    if not frappe.has_permission("Payment Entry", "write"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    frappe.db.set_value(
        "CM Bank Statement Line",
        line_name,
        {"reconciliation_status": "Exception", "matched_document": reason[:140]},
    )
    frappe.db.commit()
    return {"status": "ok"}


@frappe.whitelist()
def get_reconciliation_summary(bank_account: str) -> dict:
    """Return count/total breakdown by reconciliation_status for the account."""
    if not frappe.has_permission("Payment Entry", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    rows = frappe.db.sql(
        """
        SELECT reconciliation_status,
               COUNT(*) AS cnt,
               IFNULL(SUM(credit), 0) AS credits,
               IFNULL(SUM(debit), 0)  AS debits
        FROM `tabCM Bank Statement Line`
        WHERE bank_account = %(acct)s
        GROUP BY reconciliation_status
        """,
        {"acct": bank_account},
        as_dict=True,
    )
    return {"account": bank_account, "summary": rows}
