# Copyright (c) 2026, CasaModerna and contributors
# For license information, please see license.txt
#
# customer_reports.py — CRUD and thread API for CM Customer Report.

import json

import frappe
from frappe.utils import now

DOCTYPE = "CM Customer Report"
DOCTYPE_UPDATE = "CM Report Update"


# ─── List ────────────────────────────────────────────────────────────────────


@frappe.whitelist()
def get_customer_report_list(
    status=None,
    priority=None,
    assigned_to=None,
    customer=None,
    category=None,
    interaction_type=None,
    q=None,
    limit=100,
):
    """Return CM Customer Report list with optional filters."""
    filters = []
    if status:
        filters.append(["status", "=", status])
    if priority:
        filters.append(["priority", "=", priority])
    if assigned_to:
        filters.append(["assigned_to", "=", assigned_to])
    if customer:
        filters.append(["customer", "=", customer])
    if category:
        filters.append(["category", "=", category])
    if interaction_type:
        filters.append(["interaction_type", "=", interaction_type])

    rows = frappe.get_all(
        DOCTYPE,
        fields=[
            "name",
            "customer",
            "contact_name",
            "interaction_type",
            "category",
            "subject",
            "status",
            "priority",
            "assigned_to",
            "assigned_to_name",
            "opened_by",
            "opened_by_name",
            "opening_datetime",
            "closing_datetime",
            "action_taken",
        ],
        filters=filters,
        order_by="opening_datetime desc",
        limit_page_length=int(limit),
    )

    # Enrich with customer_name from the Customer doctype in one query
    customer_codes = list({r.get("customer") for r in rows if r.get("customer")})
    if customer_codes:
        name_map = dict(frappe.db.sql(
            "SELECT name, customer_name FROM `tabCustomer` WHERE name IN %s",
            (customer_codes,),
        ))
        for r in rows:
            r["customer_name"] = name_map.get(r.get("customer"), r.get("customer", ""))
    else:
        for r in rows:
            r["customer_name"] = r.get("customer", "")

    # Client-side text search across subject / customer / contact_name
    if q:
        q_lower = q.lower()
        rows = [
            r
            for r in rows
            if q_lower in (r.get("subject") or "").lower()
            or q_lower in (r.get("customer") or "").lower()
            or q_lower in (r.get("customer_name") or "").lower()
            or q_lower in (r.get("contact_name") or "").lower()
        ]

    return rows


# ─── Single doc ──────────────────────────────────────────────────────────────


@frappe.whitelist()
def get_customer_report(name):
    """Return a single CM Customer Report including its updates child table."""
    doc = frappe.get_doc(DOCTYPE, name)
    return doc.as_dict()


# ─── Save (create / update) ───────────────────────────────────────────────────


@frappe.whitelist()
def save_customer_report(doc):
    """Create or update a CM Customer Report. Returns the saved doc."""
    if isinstance(doc, str):
        doc = json.loads(doc)

    doc["doctype"] = DOCTYPE
    is_new = not doc.get("name")

    if is_new:
        d = frappe.get_doc(doc)
        d.insert()
    else:
        d = frappe.get_doc(DOCTYPE, doc["name"])
        # Don't let the client overwrite read-only stamp fields
        for protected in ("opened_by", "opening_datetime", "closed_by", "closing_datetime"):
            doc.pop(protected, None)
        d.update(doc)
        d.save()

    frappe.db.commit()
    return frappe.get_doc(DOCTYPE, d.name).as_dict()


# ─── Add update row ───────────────────────────────────────────────────────────


@frappe.whitelist()
def add_report_update(name, note, update_type="Update"):
    """Append a CM Report Update row to an existing report."""
    if not note or not note.strip():
        frappe.throw(frappe._("Note cannot be empty."))

    doc = frappe.get_doc(DOCTYPE, name)
    doc.append(
        "updates",
        {
            "user": frappe.session.user,
            "timestamp": now(),
            "update_type": update_type,
            "note": note.strip(),
        },
    )
    doc.save(ignore_permissions=False)
    frappe.db.commit()

    # Notify the assigned_to user (unless they added the update themselves)
    if doc.assigned_to and doc.assigned_to != frappe.session.user:
        adder_name = (
            frappe.db.get_value("User", frappe.session.user, "full_name")
            or frappe.session.user
        )
        subject = f"New update on report {name} by {adder_name}: {note[:80]}"
        _notify_report(
            for_user=doc.assigned_to,
            subject=subject,
            doc_name=name,
        )

    return frappe.get_doc(DOCTYPE, name).as_dict()


# ─── Change status ────────────────────────────────────────────────────────────


@frappe.whitelist()
def change_report_status(name, status, action_taken=None):
    """Change the status of a report. Validates action_taken before close."""
    valid_statuses = ("Open", "In Progress", "Resolved", "Closed")
    if status not in valid_statuses:
        frappe.throw(frappe._(f"Invalid status: {status}"))

    doc = frappe.get_doc(DOCTYPE, name)

    if status == "Closed" and not (action_taken or doc.action_taken):
        frappe.throw(frappe._("Action Taken is required before closing a report."))

    doc.status = status
    if action_taken:
        doc.action_taken = action_taken
    doc.save()
    frappe.db.commit()
    return frappe.get_doc(DOCTYPE, name).as_dict()


# ─── Delete ───────────────────────────────────────────────────────────────────


@frappe.whitelist()
def delete_customer_report(name):
    """Delete a CM Customer Report (only if Open and opened by current user,
    or if the user is a System Manager)."""
    doc = frappe.get_doc(DOCTYPE, name)
    is_admin = "System Manager" in frappe.get_roles(frappe.session.user)
    if not is_admin and doc.opened_by != frappe.session.user:
        frappe.throw(
            frappe._("You can only delete reports you opened."),
            frappe.PermissionError,
        )
    if not is_admin and doc.status != "Open":
        frappe.throw(
            frappe._("Only open reports can be deleted."),
        )
    frappe.delete_doc(DOCTYPE, name, ignore_permissions=is_admin)
    frappe.db.commit()
    return {"ok": True}


# ─── Helpers ──────────────────────────────────────────────────────────────────


@frappe.whitelist()
def get_users_for_assignment():
    """Return all active enabled users (name + full_name) for assignment dropdown."""
    return frappe.get_all(
        "User",
        filters={"enabled": 1, "user_type": "System User"},
        fields=["name", "full_name"],
        order_by="full_name asc",
        limit_page_length=200,
    )


@frappe.whitelist()
def get_customers_for_report():
    """Return customer names for report dropdown."""
    return frappe.get_all(
        "Customer",
        fields=["name", "customer_name"],
        filters={"disabled": 0},
        order_by="customer_name asc",
        limit_page_length=500,
    )


def _notify_report(for_user, subject, doc_name, from_user=None):
    """Send in-app notification + email for a customer report."""
    n = frappe.new_doc("Notification Log")
    n.for_user = for_user
    n.from_user = from_user or frappe.session.user
    n.subject = subject
    n.document_type = DOCTYPE
    n.document_name = doc_name
    n.type = "Alert"
    n.insert(ignore_permissions=True)

    try:
        frappe.sendmail(
            recipients=[for_user],
            subject=subject,
            message=subject,
            reference_doctype=DOCTYPE,
            reference_name=doc_name,
            now=True,
        )
    except Exception:
        frappe.log_error(title=f"Customer report notification failed: {for_user}")
