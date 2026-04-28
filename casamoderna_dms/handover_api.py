"""
handover_api.py — Cash Handover whitelisted endpoints for the DMS frontend.

Data model
----------
tabCM Receipt Confirmation — one row per confirmed Payment Entry.
  Receipts that have no row here are "pending handover".
  Receipts accumulate across days until the supervisor checks them off,
  so a Monday collection that wasn't confirmed until Wednesday will appear
  on Wednesday's supervisor view.

Flow
----
  Staff     → creates a Payment Entry for every payment received.
  End of day → opens Cash Handover, sees all their pending receipts, prints.
  Supervisor → selects staff member → sees pending receipts with checkboxes
             → ticks each one as cash is physically counted
             → clicks Confirm Checked → rows disappear from pending list.

Security: non-supervisors can only see/query their own receipts.
"""

import json
import frappe
from frappe.utils import now_datetime

_SUPERVISOR_ROLES = {
    "Accounts Manager", "Accounts User",
    "Owner / Director", "CM Super Admin", "System Manager",
}

_OWNER_ROLES = {"Owner / Director"}


def _is_supervisor():
    return bool(_SUPERVISOR_ROLES & set(frappe.get_roles(frappe.session.user)))


def _is_owner():
    """Returns True only for users with the Owner / Director role."""
    return bool(_OWNER_ROLES & set(frappe.get_roles(frappe.session.user)))


def _ensure_confirmation_table():
    """Create tabCM Receipt Confirmation if it does not yet exist."""
    frappe.db.sql("""
        CREATE TABLE IF NOT EXISTS `tabCM Receipt Confirmation` (
            `payment_entry` VARCHAR(140) NOT NULL PRIMARY KEY,
            `staff_user`    VARCHAR(140) NOT NULL,
            `posting_date`  DATE         NOT NULL,
            `confirmed_by`  VARCHAR(140) NOT NULL,
            `confirmed_at`  DATETIME     NOT NULL,
            KEY `idx_staff_pending` (`staff_user`, `posting_date`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """)
    frappe.db.commit()


# ── Shared SQL fragment that fetches Payment Entries with allocation notes ──
_PE_SQL = """
    SELECT
        pe.name,
        pe.posting_date,
        pe.party_name                           AS customer,
        pe.mode_of_payment,
        pe.paid_amount,
        pe.payment_type,
        pe.owner,
        DATE_FORMAT(pe.creation, '%%H:%%i')     AS created_time,
        IFNULL(GROUP_CONCAT(
            CONCAT(per.reference_doctype, ': ', per.reference_name)
            ORDER BY per.idx SEPARATOR ' | '
        ), '') AS allocated_to
    FROM `tabPayment Entry` pe
    LEFT JOIN `tabPayment Entry Reference` per ON per.parent = pe.name
    WHERE
        pe.owner       = %(staff_user)s
        AND pe.docstatus    = 1
        AND pe.party_type   = 'Customer'
        AND pe.payment_type IN ('Receive', 'Pay')
        AND IFNULL(pe.mode_of_payment, '') != 'Gift Voucher'
        {extra}
    GROUP BY pe.name
    ORDER BY pe.posting_date ASC, pe.creation ASC
"""


@frappe.whitelist(methods=["GET"])
def get_handover_report(staff_user=None):
    """
    Return all PENDING (unconfirmed) receipts for a staff member, plus
    receipts already confirmed today (so supervisor can review recent activity).

    Non-supervisors are always scoped to their own session user.

    Returns:
        staff_user  — resolved user this report covers
        pending     — list of unconfirmed Payment Entries (may span multiple days)
        confirmed_today — list of receipts confirmed by the supervisor today
        summary     — pending totals per mode_of_payment
    """
    _ensure_confirmation_table()

    if not _is_supervisor():
        staff_user = frappe.session.user
    elif not staff_user:
        staff_user = frappe.session.user

    # Pending: receipts with no confirmation row
    pending = frappe.db.sql(
        _PE_SQL.format(extra="""
            AND pe.name NOT IN (
                SELECT payment_entry FROM `tabCM Receipt Confirmation`
                WHERE staff_user = %(staff_user)s
            )
        """),
        {"staff_user": staff_user},
        as_dict=True,
    )

    # Confirmed today: so supervisor can see what was already processed
    confirmed_today = frappe.db.sql(
        _PE_SQL.format(extra="""
            AND pe.name IN (
                SELECT payment_entry FROM `tabCM Receipt Confirmation`
                WHERE staff_user = %(staff_user)s
                  AND DATE(confirmed_at) = CURDATE()
            )
        """),
        {"staff_user": staff_user},
        as_dict=True,
    )

    # Build pending summary by mode
    summary = {}
    for row in pending:
        m = row.mode_of_payment or "Other"
        sign = -1 if row.payment_type == "Pay" else 1
        if m not in summary:
            summary[m] = {"method": m, "collected": 0.0, "refunded": 0.0,
                          "count_in": 0, "count_out": 0}
        if sign == 1:
            summary[m]["collected"] += float(row.paid_amount or 0)
            summary[m]["count_in"]  += 1
        else:
            summary[m]["refunded"]  += float(row.paid_amount or 0)
            summary[m]["count_out"] += 1

    summary_rows = []
    for s in summary.values():
        s["net"]   = s["collected"] - s["refunded"]
        s["count"] = s["count_in"]  + s["count_out"]
        summary_rows.append(s)

    return {
        "staff_user":      staff_user,
        "pending":         [dict(r) for r in pending],
        "confirmed_today": [dict(r) for r in confirmed_today],
        "summary":         summary_rows,
    }


@frappe.whitelist(methods=["GET"])
def get_staff_with_pending():
    """
    Return all staff members who have unconfirmed receipts, with counts.
    Used by supervisor dropdown — staff are sorted: pending first.
    """
    _ensure_confirmation_table()

    if not _is_supervisor():
        # Non-supervisors only see themselves
        count = frappe.db.sql("""
            SELECT COUNT(*) AS cnt FROM `tabPayment Entry` pe
            WHERE pe.owner = %(u)s AND pe.docstatus = 1
              AND pe.payment_type = 'Receive'
              AND IFNULL(pe.mode_of_payment, '') != 'Gift Voucher'
              AND pe.name NOT IN (
                  SELECT payment_entry FROM `tabCM Receipt Confirmation`
                  WHERE staff_user = %(u)s
              )
        """, {"u": frappe.session.user}, as_dict=True)
        return [{"user_id": frappe.session.user,
                 "full_name": frappe.session.user,
                 "pending_count": count[0].cnt if count else 0}]

    rows = frappe.db.sql("""
        SELECT
            pe.owner                              AS user_id,
            IFNULL(u.full_name, pe.owner)         AS full_name,
            COUNT(pe.name)                        AS pending_count,
            SUM(pe.paid_amount)                   AS pending_total,
            MIN(pe.posting_date)                  AS oldest_date
        FROM `tabPayment Entry` pe
        LEFT JOIN `tabUser` u ON u.name = pe.owner
        WHERE
            pe.docstatus    = 1
            AND pe.payment_type  = 'Receive'
            AND IFNULL(pe.mode_of_payment, '') != 'Gift Voucher'
            AND pe.name NOT IN (
                SELECT payment_entry FROM `tabCM Receipt Confirmation`
                WHERE staff_user = pe.owner
            )
        GROUP BY pe.owner
        ORDER BY MIN(pe.posting_date) ASC, pe.owner ASC
    """, as_dict=True)

    return [dict(r) for r in rows]


@frappe.whitelist(methods=["POST"])
def confirm_receipts(payment_entries):
    """
    Mark a list of Payment Entry names as confirmed by the current supervisor.
    Restricted to supervisor roles.

    payment_entries — JSON array of PE name strings e.g. '["ACC-PAY-0001","ACC-PAY-0002"]'
    """
    if not _is_supervisor():
        frappe.throw("Only supervisors can confirm receipts.", frappe.PermissionError)

    _ensure_confirmation_table()

    if isinstance(payment_entries, str):
        payment_entries = json.loads(payment_entries)

    if not payment_entries:
        return {"confirmed": 0}

    confirmed_by = frappe.session.user
    confirmed_at = now_datetime()

    # Resolve staff_user and posting_date for each PE in one query
    pe_rows = frappe.db.sql("""
        SELECT name, owner AS staff_user, posting_date
        FROM `tabPayment Entry`
        WHERE name IN %(names)s AND docstatus = 1
    """, {"names": payment_entries}, as_dict=True)

    if not pe_rows:
        return {"confirmed": 0}

    for row in pe_rows:
        frappe.db.sql("""
            INSERT INTO `tabCM Receipt Confirmation`
                (payment_entry, staff_user, posting_date, confirmed_by, confirmed_at)
            VALUES
                (%(pe)s, %(su)s, %(pd)s, %(cb)s, %(ca)s)
            ON DUPLICATE KEY UPDATE
                confirmed_by = %(cb)s,
                confirmed_at = %(ca)s
        """, {
            "pe": row.name,
            "su": row.staff_user,
            "pd": row.posting_date,
            "cb": confirmed_by,
            "ca": confirmed_at,
        })

    frappe.db.commit()
    return {"confirmed": len(pe_rows), "confirmed_by": confirmed_by,
            "confirmed_at": str(confirmed_at)}


@frappe.whitelist(methods=["GET"])
def get_pending_handovers():
    """
    Return staff members who have ANY unconfirmed receipts (not date-bounded).
    Used by DailyCollections warning banner for supervisors.
    """
    _ensure_confirmation_table()

    rows = frappe.db.sql("""
        SELECT
            pe.owner                          AS staff_user,
            IFNULL(u.full_name, pe.owner)     AS full_name,
            COUNT(pe.name)                    AS payment_count,
            SUM(pe.paid_amount)               AS total_collected,
            MIN(pe.posting_date)              AS oldest_date,
            MAX(pe.posting_date)              AS latest_date
        FROM `tabPayment Entry` pe
        LEFT JOIN `tabUser` u ON u.name = pe.owner
        WHERE
            pe.docstatus    = 1
            AND pe.payment_type  = 'Receive'
            AND IFNULL(pe.mode_of_payment, '') != 'Gift Voucher'
            AND pe.name NOT IN (
                SELECT payment_entry FROM `tabCM Receipt Confirmation`
                WHERE staff_user = pe.owner
            )
        GROUP BY pe.owner
        ORDER BY MIN(pe.posting_date) ASC
    """, as_dict=True)

    return [dict(r) for r in rows]


@frappe.whitelist(methods=["GET"])
def get_daily_collections(date=None):
    """
    Return all Payment Entries that were physically confirmed (handed to the
    owner) on a given date, joined from tabCM Receipt Confirmation.

    This is a management view — only confirmed receipts appear here, and the
    date filter is on confirmed_at (when the supervisor counted the cash),
    not on the original receipt posting_date.

    Restricted to supervisor roles.
    """
    if not _is_supervisor():
        frappe.throw("Daily Collections is restricted to Finance / Manager roles.",
                     frappe.PermissionError)

    _ensure_confirmation_table()

    if not date:
        from frappe.utils import today as frappe_today
        date = frappe_today()

    rows = frappe.db.sql("""
        SELECT
            pe.name,
            pe.posting_date,
            pe.party_name                               AS customer,
            pe.mode_of_payment,
            pe.paid_amount,
            pe.payment_type,
            pe.reference_no,
            pe.owner,
            IFNULL(u.full_name, pe.owner)               AS staff_name,
            DATE_FORMAT(cr.confirmed_at, '%%H:%%i')     AS confirmed_time,
            cr.confirmed_by,
            IFNULL(GROUP_CONCAT(
                CONCAT(per.reference_doctype, ': ', per.reference_name)
                ORDER BY per.idx SEPARATOR ' | '
            ), '') AS allocated_to
        FROM `tabCM Receipt Confirmation` cr
        JOIN `tabPayment Entry` pe ON pe.name = cr.payment_entry
        LEFT JOIN `tabUser` u ON u.name = pe.owner
        LEFT JOIN `tabPayment Entry Reference` per ON per.parent = pe.name
        WHERE
            DATE(cr.confirmed_at) = %(date)s
            AND pe.docstatus       = 1
            AND pe.party_type      = 'Customer'
            AND pe.payment_type    IN ('Receive', 'Pay')
            AND IFNULL(pe.mode_of_payment, '') != 'Gift Voucher'
        GROUP BY pe.name
        ORDER BY cr.confirmed_at ASC
    """, {"date": date}, as_dict=True)

    # Build summary by mode_of_payment
    summary = {}
    for row in rows:
        m    = row.mode_of_payment or "Other"
        sign = -1 if row.payment_type == "Pay" else 1
        if m not in summary:
            summary[m] = {"method": m, "collected": 0.0, "refunded": 0.0,
                          "count_in": 0, "count_out": 0}
        if sign == 1:
            summary[m]["collected"] += float(row.paid_amount or 0)
            summary[m]["count_in"]  += 1
        else:
            summary[m]["refunded"]  += float(row.paid_amount or 0)
            summary[m]["count_out"] += 1

    summary_rows = []
    for s in summary.values():
        s["net"]   = s["collected"] - s["refunded"]
        s["count"] = s["count_in"]  + s["count_out"]
        summary_rows.append(s)

    return {
        "date":    date,
        "rows":    [dict(r) for r in rows],
        "summary": summary_rows,
    }


# ── Daily Collection Receipt (owner acknowledgement) ─────────────────────────

def _ensure_daily_receipt_table():
    """Create tabCM Daily Collection Receipt if it does not yet exist."""
    frappe.db.sql("""
        CREATE TABLE IF NOT EXISTS `tabCM Daily Collection Receipt` (
            `date`         DATE         NOT NULL PRIMARY KEY,
            `received_by`  VARCHAR(140) NOT NULL,
            `received_at`  DATETIME     NOT NULL,
            `total_amount` DECIMAL(18,6) NOT NULL DEFAULT 0
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """)
    frappe.db.commit()


@frappe.whitelist(methods=["GET"])
def get_daily_collection_receipt(date=None):
    """
    Return the owner-receipt record for a given date, or null if not yet confirmed.
    """
    if not _is_supervisor():
        frappe.throw("Not authorised.", frappe.PermissionError)
    if not date:
        frappe.throw("date required")

    _ensure_daily_receipt_table()

    rows = frappe.db.sql("""
        SELECT dcr.date, dcr.received_by, dcr.received_at, dcr.total_amount,
               IFNULL(u.full_name, dcr.received_by) AS received_name,
               DATE_FORMAT(dcr.received_at, '%%H:%%i') AS received_time
        FROM `tabCM Daily Collection Receipt` dcr
        LEFT JOIN `tabUser` u ON u.name = dcr.received_by
        WHERE dcr.date = %(date)s
    """, {"date": date}, as_dict=True)

    return dict(rows[0]) if rows else None


@frappe.whitelist(methods=["POST"])
def confirm_daily_receipt(date=None):
    """
    Owner acknowledges physical receipt of the day's cash from staff/supervisors.
    Computes net total from confirmed rows for that date and stores an
    acknowledgement record in tabCM Daily Collection Receipt.

    Restricted to Owner / Director role — only the person who physically
    receives the consolidated cash should be able to confirm this.
    """
    if not _is_owner():
        frappe.throw("Only the Owner / Director can confirm the daily cash receipt.",
                     frappe.PermissionError)
    if not date:
        frappe.throw("date required")

    _ensure_daily_receipt_table()
    _ensure_confirmation_table()

    # Compute net total from confirmed rows (same logic as get_daily_collections)
    result = frappe.db.sql("""
        SELECT IFNULL(SUM(
            CASE WHEN pe.payment_type = 'Pay' THEN -pe.paid_amount ELSE pe.paid_amount END
        ), 0) AS net
        FROM `tabCM Receipt Confirmation` cr
        JOIN `tabPayment Entry` pe ON pe.name = cr.payment_entry
        WHERE DATE(cr.confirmed_at) = %(date)s
          AND pe.docstatus = 1
          AND pe.party_type = 'Customer'
          AND pe.payment_type IN ('Receive', 'Pay')
          AND IFNULL(pe.mode_of_payment, '') != 'Gift Voucher'
    """, {"date": date}, as_dict=True)

    total       = float(result[0].net or 0) if result else 0.0
    received_by = frappe.session.user
    received_at = now_datetime()

    frappe.db.sql("""
        INSERT INTO `tabCM Daily Collection Receipt`
            (date, received_by, received_at, total_amount)
        VALUES
            (%(date)s, %(by)s, %(at)s, %(total)s)
        ON DUPLICATE KEY UPDATE
            received_by  = %(by)s,
            received_at  = %(at)s,
            total_amount = %(total)s
    """, {"date": date, "by": received_by, "at": received_at, "total": total})

    frappe.db.commit()

    return {
        "date":          date,
        "received_by":   received_by,
        "received_at":   str(received_at),
        "total_amount":  total,
    }
