"""
price_override_api — Supervisor approval flow for below-floor offer price overrides.

When a salesperson sets an item's rate below its standard offer price
(cm_final_offer_inc_vat), the document cannot be saved until each affected
line item has been approved by a CasaModerna Price Supervisor.

Flow:
  1. Salesperson hits Save → frontend detects below-floor items → calls
     create_override_requests() → one CM Price Override Request per item.
     → Notification sent to every Price Supervisor.
  2. Supervisor opens /supervisor/price-overrides → polls get_pending_override_requests().
  3. Supervisor clicks Approve/Reject per row → approve/reject_override_request().
     → Notification sent to the salesperson.
  4. Salesperson's modal polls get_override_request_status() every 4 seconds.
  5. When all Approved → frontend calls save_doc_with_approvals() which:
       - Validates every request: Approved, not consumed, belongs to caller.
       - Loads the document from DB (preserving auto-set mandatory fields),
         overlays frontend changes, strips stale timestamps to avoid conflicts.
       - Marks override rows with _price_override_approved so the
         cm_sales_pricing hook skips re-pricing those rows.
       - Saves the document.
       - Marks requests as consumed (cannot be replayed).
       - Returns the saved document.
"""

import frappe
from frappe import _


# ── helpers ──────────────────────────────────────────────────────────────────

def _require_price_supervisor():
    """Raise PermissionError unless the caller holds the supervisor role."""
    user_roles = set(frappe.get_roles(frappe.session.user))
    allowed = {"Administrator", "System Manager", "CasaModerna Price Supervisor"}
    if not (allowed & user_roles):
        frappe.throw(_("Not permitted — supervisor role required"), frappe.PermissionError)


def _parse_json(value):
    if isinstance(value, (list, dict)):
        return value
    return frappe.parse_json(value)


def _notify_supervisors(from_user, subject, message, doc_name=""):
    """
    Insert a Notification Log entry for every active user who can act as
    a Price Supervisor — i.e. anyone with CasaModerna Price Supervisor,
    System Manager, or Administrator role.  This mirrors the check in
    _require_price_supervisor() so the right people are always notified.

    Failures are swallowed so notifications never block the main flow.
    """
    try:
        supervisor_roles = [
            "CasaModerna Price Supervisor",
            "System Manager",
            "Administrator",
        ]
        rows = frappe.get_all(
            "Has Role",
            filters={"role": ["in", supervisor_roles], "parenttype": "User"},
            fields=["parent"],
            distinct=True,
        )
        notified = set()
        for row in rows:
            user = row.get("parent")
            if not user or user == from_user or user in notified:
                continue
            # Skip disabled / Guest users
            enabled = frappe.db.get_value("User", user, "enabled")
            if not enabled:
                continue
            _insert_notification(
                for_user=user,
                from_user=from_user,
                subject=subject,
                message=message,
                doc_type="CM Price Override Request",
                doc_name=doc_name,
            )
            notified.add(user)
    except Exception:
        pass


def _notify_salesperson(from_user, salesperson, subject, message, doc_name=""):
    """
    Insert a Notification Log entry for the salesperson.
    Failures are swallowed so notifications never block the main flow.
    """
    try:
        if not salesperson or salesperson == from_user:
            return
        _insert_notification(
            for_user=salesperson,
            from_user=from_user,
            subject=subject,
            message=message,
            doc_type="CM Price Override Request",
            doc_name=doc_name,
        )
    except Exception:
        pass


def _insert_notification(for_user, from_user, subject, message, doc_type="", doc_name=""):
    """Low-level helper: insert one tabNotification Log row + send email."""
    notif = frappe.new_doc("Notification Log")
    notif.for_user   = for_user
    notif.from_user  = from_user or frappe.session.user
    notif.subject    = subject
    notif.email_content = message
    notif.document_type = doc_type
    notif.document_name = doc_name
    notif.type       = "Alert"
    notif.read       = 0
    notif.insert(ignore_permissions=True)

    try:
        frappe.sendmail(
            recipients=[for_user],
            subject=subject,
            message=message,
            reference_doctype=doc_type,
            reference_name=doc_name,
            now=True,
        )
    except Exception:
        frappe.log_error(title=f"Price override email failed: {for_user}")


# ── salesperson-side API ──────────────────────────────────────────────────────

@frappe.whitelist(methods=["POST"])
def create_override_requests(sales_doctype, doc_name, items_json):
    """
    Create one CM Price Override Request per below-floor item.

    items_json: JSON array of objects with keys:
        item_code, item_name, standard_rate (cm_final_offer_inc_vat), requested_rate (rate)

    Returns: list of {name, item_code, item_name, standard_rate, requested_rate, status}
    """
    items = _parse_json(items_json)
    if not isinstance(items, list) or not items:
        frappe.throw(_("items_json must be a non-empty list"))

    current_user = frappe.session.user
    created = []

    for item in items:
        item_code      = str(item.get("item_code") or "").strip()
        item_name      = str(item.get("item_name") or item_code)
        standard_rate  = float(item.get("standard_rate") or 0)
        requested_rate = float(item.get("requested_rate") or 0)

        if not item_code:
            frappe.throw(_("item_code is required for each override request"))

        doc = frappe.new_doc("CM Price Override Request")
        doc.status         = "Pending"
        doc.salesperson    = current_user
        doc.sales_doctype  = str(sales_doctype or "")
        doc.doc_name       = str(doc_name or "")
        doc.item_code      = item_code
        doc.item_name      = item_name
        doc.standard_rate  = standard_rate
        doc.requested_rate = requested_rate
        doc.consumed       = 0
        doc.insert(ignore_permissions=False)

        created.append({
            "name":           doc.name,
            "item_code":      doc.item_code,
            "item_name":      doc.item_name,
            "standard_rate":  doc.standard_rate,
            "requested_rate": doc.requested_rate,
            "status":         doc.status,
        })

    frappe.db.commit()

    # ── notify all supervisors ───────────────────────────────────────────────
    salesperson_full = frappe.db.get_value("User", current_user, "full_name") or current_user
    item_summary = ", ".join(c["item_name"] for c in created)
    n_items = len(created)
    doc_label = f"{sales_doctype} {doc_name}" if doc_name else sales_doctype or "a document"
    _notify_supervisors(
        from_user=current_user,
        subject=f"Price override request — {n_items} item{'s' if n_items != 1 else ''} on {doc_label}",
        message=(
            f"{salesperson_full} has requested a price override for "
            f"{n_items} item{'s' if n_items != 1 else ''} on {doc_label}: {item_summary}. "
            f"Please review in the Supervisor Price Override dashboard."
        ),
        doc_name=created[0]["name"] if created else "",
    )

    return created


@frappe.whitelist(methods=["GET"])
def get_override_request_status(request_names_json):
    """
    Poll the status of a set of override requests.

    Only returns requests whose salesperson matches the current user,
    preventing one salesperson from polling another's requests.

    Returns: dict of { name: status }
    """
    names = _parse_json(request_names_json)
    if not isinstance(names, list) or not names:
        return {}

    current_user = frappe.session.user
    rows = frappe.get_all(
        "CM Price Override Request",
        filters=[
            ["name", "in", names],
            ["salesperson", "=", current_user],
        ],
        fields=["name", "status"],
    )
    return {row["name"]: row["status"] for row in rows}


# ── supervisor-side API ───────────────────────────────────────────────────────

@frappe.whitelist(methods=["GET"])
def get_pending_override_requests():
    """Return all Pending requests for the supervisor dashboard."""
    _require_price_supervisor()

    rows = frappe.get_all(
        "CM Price Override Request",
        filters={"status": "Pending", "consumed": 0},
        fields=[
            "name", "status", "salesperson", "sales_doctype", "doc_name",
            "item_code", "item_name", "standard_rate", "requested_rate", "creation",
        ],
        order_by="creation asc",
    )
    return rows


@frappe.whitelist(methods=["GET"])
def get_resolved_override_requests():
    """Return today's resolved (Approved/Rejected) requests for the supervisor dashboard."""
    _require_price_supervisor()

    today = frappe.utils.today()
    rows = frappe.get_all(
        "CM Price Override Request",
        filters=[
            ["status", "in", ["Approved", "Rejected"]],
            ["resolved_at", ">=", today],
        ],
        fields=[
            "name", "status", "salesperson", "sales_doctype", "doc_name",
            "item_code", "item_name", "standard_rate", "requested_rate",
            "resolved_by", "resolved_at",
        ],
        order_by="resolved_at desc",
        limit=100,
    )
    return rows


@frappe.whitelist(methods=["POST"])
def approve_override_request(request_name):
    """Approve a pending override request. Supervisor only."""
    _require_price_supervisor()

    req = frappe.get_doc("CM Price Override Request", request_name)
    if req.status != "Pending":
        frappe.throw(_(f"Request {request_name} is no longer Pending (status: {req.status})"))

    supervisor = frappe.session.user
    now = frappe.utils.now()
    req.db_set("status",      "Approved",  update_modified=False)
    req.db_set("resolved_by", supervisor,  update_modified=False)
    req.db_set("resolved_at", now,         update_modified=False)
    frappe.db.commit()

    # ── notify salesperson ───────────────────────────────────────────────────
    supervisor_full = frappe.db.get_value("User", supervisor, "full_name") or supervisor
    _notify_salesperson(
        from_user=supervisor,
        salesperson=req.salesperson,
        subject=f"Price override approved — {req.item_name}",
        message=(
            f"{supervisor_full} has approved your price override request for "
            f"{req.item_name} at {req.requested_rate} (standard: {req.standard_rate}). "
            f"You may now save the document."
        ),
        doc_name=request_name,
    )

    return {"name": request_name, "status": "Approved"}


@frappe.whitelist(methods=["POST"])
def reject_override_request(request_name):
    """Reject a pending override request. Supervisor only."""
    _require_price_supervisor()

    req = frappe.get_doc("CM Price Override Request", request_name)
    if req.status != "Pending":
        frappe.throw(_(f"Request {request_name} is no longer Pending (status: {req.status})"))

    supervisor = frappe.session.user
    now = frappe.utils.now()
    req.db_set("status",      "Rejected",  update_modified=False)
    req.db_set("resolved_by", supervisor,  update_modified=False)
    req.db_set("resolved_at", now,         update_modified=False)
    frappe.db.commit()

    # ── notify salesperson ───────────────────────────────────────────────────
    supervisor_full = frappe.db.get_value("User", supervisor, "full_name") or supervisor
    _notify_salesperson(
        from_user=supervisor,
        salesperson=req.salesperson,
        subject=f"Price override rejected — {req.item_name}",
        message=(
            f"{supervisor_full} has rejected your price override request for "
            f"{req.item_name} at {req.requested_rate} (standard: {req.standard_rate}). "
            f"Please revise the price or contact your supervisor."
        ),
        doc_name=request_name,
    )

    return {"name": request_name, "status": "Rejected"}


# ── atomic save with approved overrides ──────────────────────────────────────

@frappe.whitelist(methods=["POST"])
def save_doc_with_approvals(doctype, doc_json, request_names_json):
    """
    Save a sales document that contains below-floor offer prices.

    Validates every provided override request (all must be Approved, not
    consumed, and owned by the current user), marks the corresponding item
    rows on the document with a transient _price_override_approved flag so
    cm_sales_pricing skips re-pricing those rows, saves the document, and
    finally marks all requests as consumed to prevent replay.

    Returns the saved document as a dict.
    """
    doc_dict      = _parse_json(doc_json)
    request_names = _parse_json(request_names_json)

    if not isinstance(doc_dict, dict):
        frappe.throw(_("doc_json must be a JSON object"))
    if not isinstance(request_names, list) or not request_names:
        frappe.throw(_("request_names_json must be a non-empty list"))

    current_user = frappe.session.user

    # ── validate every request ──────────────────────────────────────────────
    requests = []
    for rname in request_names:
        req = frappe.get_doc("CM Price Override Request", rname)

        if req.salesperson != current_user:
            frappe.throw(
                _(f"Request {rname} does not belong to the current user"),
                frappe.PermissionError,
            )
        if req.status != "Approved":
            frappe.throw(_(f"Request {rname} has not been approved (status: {req.status})"))
        if req.consumed:
            frappe.throw(_(f"Request {rname} has already been consumed and cannot be reused"))
        if req.sales_doctype and req.sales_doctype != str(doctype):
            frappe.throw(_(f"Request {rname} is for {req.sales_doctype}, not {doctype}"))

        requests.append(req)

    # ── build approved-override lookup: (item_code, rounded_rate) → True ───
    approved_keys: set[tuple] = set()
    for req in requests:
        approved_keys.add((req.item_code, round(float(req.requested_rate or 0), 2)))

    # ── load / create document ──────────────────────────────────────────────
    # For existing docs: load from DB first (preserving auto-set mandatory
    # fields like conversion_factor that the frontend may not send), then
    # overlay frontend changes.  Strip stale timestamps from the overlay
    # dict to prevent TimestampMismatchError — Frappe re-stamps on save().
    # For new docs: create from the dict directly.
    existing_name = doc_dict.get("name")
    if existing_name:
        doc = frappe.get_doc(str(doctype), existing_name)
        # Remove fields Frappe manages internally so doc.update() doesn't
        # overwrite them with the (potentially stale) frontend values.
        overlay = {
            k: v for k, v in doc_dict.items()
            if k not in ("modified", "creation", "modified_by", "owner",
                         "docstatus", "__islocal", "__unsaved")
        }
        doc.update(overlay)
    else:
        doc = frappe.get_doc(doc_dict)

    # Mark override rows so cm_sales_pricing skips them.
    # _price_override_approved is a transient Python attribute — it is never
    # persisted to DB; it only lives for the duration of this save() call.
    for row in (doc.items or []):
        item_code = getattr(row, "item_code", None)
        rate      = round(float(getattr(row, "rate", 0) or 0), 2)
        if item_code and (item_code, rate) in approved_keys:
            row._price_override_approved = True

    # ── save (triggers validate hooks) ─────────────────────────────────────
    doc.save()
    frappe.db.commit()

    # ── consume requests (one-time use only) ───────────────────────────────
    now = frappe.utils.now()
    for req in requests:
        req.db_set("consumed",    1,   update_modified=False)
        req.db_set("consumed_at", now, update_modified=False)
    frappe.db.commit()

    return frappe.get_doc(str(doctype), doc.name).as_dict()
