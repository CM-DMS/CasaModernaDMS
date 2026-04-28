"""audit_api.py — Combined audit log for the DMS Admin screen.

Returns login/logout events (Activity Log) and document changes (Version)
as a unified, time-sorted list.  Requires System Manager role.

Each row shape:
    type          "activity" | "version"
    time          ISO-format datetime string
    user          email / owner
    display_name  resolved full name (if available)
    event         "Login" | "Logout" | "Saved" | "Submitted" | "Cancelled" | "Amended"
    ref_doctype   doctype (version rows)
    docname       document name (version rows)
    ip_address    IP (activity rows)
    subject       human-readable summary
    changes       [{field, old, new}, …]   — field-level diffs (values ≤ 160 chars)
    row_changes   [{child_doctype, row_name, diffs:[{field,old,new}]}, …]
    changed_count total number of changed fields (summary count)
"""

import json

import frappe
from frappe import _

_MAX_LEN = 160   # max display length for old/new field values


def _clip(value):
    """Truncate a value to a displayable length."""
    if value is None:
        return ""
    s = str(value)
    return s if len(s) <= _MAX_LEN else s[:_MAX_LEN] + "\u2026"


def _infer_event(changed_fields):
    """Derive a human label from changed fields (docstatus tells the story)."""
    for field, _old, new in changed_fields:
        if field == "docstatus":
            if str(new) == "1":
                return "Submitted"
            if str(new) == "2":
                return "Cancelled"
            if str(new) == "0":
                return "Amended"
    return "Saved"


def _parse_version_data(raw_data):
    """Parse a Version.data JSON blob.

    Version.data structure:
        changed:     [[field, old_val, new_val], …]
        row_changed: [[child_doctype, row_name, child_name, [[f,o,n],…]], …]
        added:       [[child_doctype, [rows…]], …]
        removed:     [[child_doctype, [rows…]], …]

    Returns (event_label, field_changes, child_changes, total_count).
    """
    if not raw_data:
        return "Saved", [], [], 0
    try:
        d = json.loads(raw_data)
    except Exception:
        return "Saved", [], [], 0

    changed = d.get("changed") or []
    row_changed = d.get("row_changed") or []

    field_changes = [
        {"field": fld, "old": _clip(old), "new": _clip(new)}
        for fld, old, new in changed
    ]

    child_changes = []
    for entry in row_changed:
        if len(entry) >= 4:
            child_changes.append({
                "child_doctype": entry[0],
                "row_name": entry[2] or entry[1],
                "diffs": [
                    {"field": f, "old": _clip(o), "new": _clip(n)}
                    for f, o, n in (entry[3] or [])
                ],
            })

    event = _infer_event(changed)
    total = len(field_changes) + sum(len(c["diffs"]) for c in child_changes)
    return event, field_changes, child_changes, total


@frappe.whitelist()
def get_audit_log(from_date, to_date, user="", event_type="all", ref_doctype="", limit=300):
    """Fetch a unified audit trail for Admin → Audit Log.

    event_type: "all" | "login" | "change"
    """
    if "System Manager" not in frappe.get_roles(frappe.session.user):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    cap = min(int(limit), 500)
    results = []

    # ── Activity Log (login / logout events) ────────────────────────────────
    if event_type in ("all", "login"):
        al_filters = [
            ["creation", ">=", from_date + " 00:00:00"],
            ["creation", "<=", to_date + " 23:59:59"],
        ]
        if user.strip():
            al_filters.append(["user", "like", f"%{user.strip()}%"])

        al_rows = frappe.get_list(
            "Activity Log",
            fields=["creation", "user", "full_name", "operation", "subject", "ip_address"],
            filters=al_filters,
            limit=cap,
            order_by="creation desc",
        )
        for r in al_rows:
            results.append({
                "type": "activity",
                "time": str(r.creation),
                "user": r.user or "",
                "display_name": r.full_name or "",
                "event": r.operation or "Login",
                "ref_doctype": "",
                "docname": "",
                "ip_address": r.ip_address or "",
                "subject": r.subject or "",
                "changes": [],
                "row_changes": [],
                "changed_count": 0,
            })

    # ── Version (document changes) ───────────────────────────────────────────
    if event_type in ("all", "change"):
        ver_filters = [
            ["creation", ">=", from_date + " 00:00:00"],
            ["creation", "<=", to_date + " 23:59:59"],
        ]
        if user.strip():
            ver_filters.append(["owner", "like", f"%{user.strip()}%"])
        if ref_doctype.strip():
            ver_filters.append(["ref_doctype", "=", ref_doctype.strip()])

        # frappe.db.get_list fetches LongText fields like `data`
        ver_rows = frappe.db.get_list(
            "Version",
            fields=["name", "creation", "owner", "ref_doctype", "docname", "data"],
            filters=ver_filters,
            limit=cap,
            order_by="creation desc",
        )

        # Resolve owner emails → full names in a single query
        owner_emails = {r.owner for r in ver_rows if r.owner}
        name_map = {}
        if owner_emails:
            users = frappe.db.get_list(
                "User",
                fields=["name", "full_name"],
                filters=[["name", "in", list(owner_emails)]],
            )
            name_map = {u.name: u.full_name for u in users}

        for r in ver_rows:
            event, changes, row_changes, count = _parse_version_data(r.data)
            results.append({
                "type": "version",
                "time": str(r.creation),
                "user": r.owner or "",
                "display_name": name_map.get(r.owner, ""),
                "event": event,
                "ref_doctype": r.ref_doctype or "",
                "docname": r.docname or "",
                "ip_address": "",
                "subject": f"{r.ref_doctype}: {r.docname}" if r.ref_doctype else "",
                "changes": changes,
                "row_changes": row_changes,
                "changed_count": count,
            })

    results.sort(key=lambda x: x["time"], reverse=True)
    return results[:cap]


# ── Document-level history (used by Document History panel in SalesDocEditor) ─

# Fields too internal/noisy to show in the per-doc diff panel.
_SKIP_FIELDS = {
    "modified", "modified_by", "idx", "docstatus",
    "_comments", "_assign", "_seen", "_user_tags", "_liked_by",
    "name", "owner", "creation",
}

# Human-readable labels for common sales document fields.
_FIELD_LABELS = {
    "grand_total": "Grand Total",
    "net_total": "Net Total",
    "rounded_total": "Rounded Total",
    "total_taxes_and_charges": "Tax / Charges",
    "discount_amount": "Discount Amount",
    "additional_discount_percentage": "Discount %",
    "status": "Status",
    "customer": "Customer",
    "customer_name": "Customer Name",
    "transaction_date": "Date",
    "delivery_date": "Delivery Date",
    "valid_till": "Valid Till",
    "title": "Title",
    "po_no": "PO Number",
    "po_date": "PO Date",
    "payment_terms_template": "Payment Terms",
    "tc_name": "Terms Name",
    "terms": "Payment Terms & Conditions",
    "notes": "Notes",
    "contact_email": "Contact Email",
    "contact_person": "Contact Person",
    "currency": "Currency",
    "conversion_rate": "Conversion Rate",
    "selling_price_list": "Price List",
    "customer_group": "Customer Group",
    "territory": "Territory",
    "order_type": "Order Type",
    "delivery_status": "Delivery Status",
    "billing_status": "Billing Status",
}

# Fields whose values are shown in the summary badge even when unchanged.
_SUMMARY_FIELDS = {"grand_total", "rounded_total", "status"}

# Fields to highlight at the top of each diff (shown before the rest).
_PRIORITY_FIELDS = {"status", "grand_total", "rounded_total", "net_total", "discount_amount", "additional_discount_percentage"}


def _fmt_currency(value):
    """Format a numeric value as a Euro amount string."""
    try:
        return f"\u20ac{float(value):,.2f}"
    except (TypeError, ValueError):
        return str(value)


def _fmt_field_value(field, value):
    """Format a field value for display."""
    if value is None or value == "":
        return "\u2014"
    if field in ("grand_total", "rounded_total", "net_total",
                 "total_taxes_and_charges", "discount_amount"):
        return _fmt_currency(value)
    return _clip(str(value))


@frappe.whitelist()
def get_doc_history(doctype, docname):
    """Return a rich chronological history for a single document.

    Accessible to any logged-in user who can read the document.
    Returns oldest-first so the UI can render a timeline top-to-bottom.

    Each entry shape:
        id           str   — unique identifier for React key
        time         str   — ISO datetime
        user         str   — email
        display_name str   — resolved full name
        event        str   — Created | Saved | Submitted | Cancelled | Amended
        summary      dict  — {grand_total?, status?} formatted strings
        changes      list  — [{label, raw_field, old, new, priority}]
        row_summary  str   — "3 item rows updated, 1 added" etc.
    """
    if not docname or docname == "new":
        return []

    # ── Doc metadata (creation / creator / current totals) ──────────────────
    meta_fields = [
        "name", "owner", "creation", "grand_total", "rounded_total",
        "status", "docstatus", "customer_name", "title",
    ]
    doc_meta = None
    try:
        doc_meta = frappe.db.get_value(doctype, docname, meta_fields, as_dict=True)
    except Exception:
        pass

    if not doc_meta:
        return []

    # Resolve all owner emails to display names in one shot later.
    emails_to_resolve = {doc_meta.owner} if doc_meta.owner else set()

    # ── Version records ──────────────────────────────────────────────────────
    ver_rows = frappe.db.get_list(
        "Version",
        fields=["name", "creation", "owner", "data"],
        filters=[
            ["ref_doctype", "=", doctype],
            ["docname", "=", docname],
        ],
        order_by="creation asc",
        limit=100,
    )
    emails_to_resolve.update(r.owner for r in ver_rows if r.owner)

    # Batch name resolution
    name_map = {}
    if emails_to_resolve:
        users = frappe.db.get_list(
            "User",
            fields=["name", "full_name"],
            filters=[["name", "in", list(emails_to_resolve)]],
        )
        name_map = {u.name: u.full_name for u in users}

    events = []

    # ── "Created" entry ──────────────────────────────────────────────────────
    creation_summary = {}
    gt = doc_meta.get("grand_total") or doc_meta.get("rounded_total")
    if gt is not None:
        creation_summary["grand_total"] = _fmt_currency(gt)
    if doc_meta.get("status"):
        creation_summary["status"] = doc_meta.status

    events.append({
        "id": f"created-{docname}",
        "time": str(doc_meta.creation),
        "user": doc_meta.owner or "",
        "display_name": name_map.get(doc_meta.owner, ""),
        "event": "Created",
        "summary": creation_summary,
        "changes": [],
        "row_summary": "",
    })

    # ── Version-based change entries ─────────────────────────────────────────
    for ver in ver_rows:
        event_label, raw_changes, raw_row_changes, _ = _parse_version_data(ver.data)

        # Build visible field changes (skip noisy internals, then sort priority first)
        visible = []
        for c in raw_changes:
            if c["field"] in _SKIP_FIELDS:
                continue
            label = _FIELD_LABELS.get(c["field"], c["field"].replace("_", " ").title())
            visible.append({
                "label": label,
                "raw_field": c["field"],
                "old": _fmt_field_value(c["field"], c["old"]),
                "new": _fmt_field_value(c["field"], c["new"]),
                "priority": c["field"] in _PRIORITY_FIELDS,
            })
        # Priority fields first
        visible.sort(key=lambda x: (0 if x["priority"] else 1, x["label"]))

        # Summary from changed fields at this version
        ver_summary = {}
        for c in raw_changes:
            if c["field"] == "status" and c["new"]:
                ver_summary["status"] = str(c["new"])
            elif c["field"] in ("grand_total", "rounded_total") and c["new"]:
                ver_summary["grand_total"] = _fmt_currency(c["new"])

        # Row change summary
        try:
            d = json.loads(ver.data or "{}")
            added = d.get("added") or []
            removed = d.get("removed") or []
            row_changed = d.get("row_changed") or []
            row_parts = []
            if row_changed:
                row_parts.append(f"{len(row_changed)} row{'s' if len(row_changed) != 1 else ''} edited")
            if added:
                n = sum(len(rows) for _, rows in added if isinstance(rows, list)) if added else 0
                if n:
                    row_parts.append(f"{n} added")
            if removed:
                n = sum(len(rows) for _, rows in removed if isinstance(rows, list)) if removed else 0
                if n:
                    row_parts.append(f"{n} removed")
            row_summary = ", ".join(row_parts)
        except Exception:
            row_summary = ""

        events.append({
            "id": ver.name,
            "time": str(ver.creation),
            "user": ver.owner or "",
            "display_name": name_map.get(ver.owner, ""),
            "event": event_label,
            "summary": ver_summary,
            "changes": visible,
            "row_summary": row_summary,
        })

    return events
