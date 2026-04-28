"""
warranty_api.py — Warranty and after-sales tracking for Casa Moderna.

A warranty record is created from a Sales Order line item, capturing:
  - customer, product, serial/batch, purchase date, warranty expiry
  - linked service job cards

The CM Warranty doctype is a lightweight custom doc (no stock movement).
"""
from __future__ import annotations

from datetime import date as _date
from dateutil.relativedelta import relativedelta

import frappe
from frappe import _


# Default warranty months by item group (override in Item custom field if needed)
_DEFAULT_WARRANTY_MONTHS = 12


@frappe.whitelist()
def get_warranty_list(
    customer: str = "",
    item_code: str = "",
    status: str = "",
    date_from: str = "",
    date_to: str = "",
    limit: int = 100,
) -> list[dict]:
    """Return list of CM Warranty records matching the given filters."""
    if not frappe.has_permission("CM Warranty", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    filters: list = [["docstatus", "!=", 2]]
    if customer:
        filters.append(["customer", "=", customer])
    if item_code:
        filters.append(["item_code", "=", item_code])
    if status:
        filters.append(["warranty_status", "=", status])
    if date_from:
        filters.append(["purchase_date", ">=", date_from])
    if date_to:
        filters.append(["purchase_date", "<=", date_to])

    return frappe.get_list(
        "CM Warranty",
        filters=filters,
        fields=[
            "name", "customer", "customer_name", "item_code", "item_name",
            "serial_no", "purchase_date", "warranty_expiry", "warranty_months",
            "warranty_status", "sales_order", "sales_invoice",
            "linked_job_cards", "notes", "creation",
        ],
        order_by="warranty_expiry asc",
        limit_page_length=int(limit),
    )


@frappe.whitelist()
def get_warranty(name: str) -> dict:
    """Return a single CM Warranty document."""
    if not frappe.has_permission("CM Warranty", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    doc = frappe.get_doc("CM Warranty", name)
    return doc.as_dict()


@frappe.whitelist()
def save_warranty(doc: dict | str) -> dict:
    """Create or update a CM Warranty document."""
    if isinstance(doc, str):
        import json
        doc = json.loads(doc)

    if not frappe.has_permission("CM Warranty", "write"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    name = doc.get("name")
    if name and frappe.db.exists("CM Warranty", name):
        d = frappe.get_doc("CM Warranty", name)
        d.update(doc)
    else:
        d = frappe.new_doc("CM Warranty")
        d.update(doc)

    # Auto-calculate expiry if not set
    if d.purchase_date and d.warranty_months and not d.warranty_expiry:
        pd = _date.fromisoformat(str(d.purchase_date)[:10])
        d.warranty_expiry = str(pd + relativedelta(months=int(d.warranty_months)))

    # Auto-set status
    if d.warranty_expiry:
        exp = _date.fromisoformat(str(d.warranty_expiry)[:10])
        if exp < _date.today():
            d.warranty_status = "Expired"
        elif d.warranty_status not in ("Void", "Claimed"):
            d.warranty_status = "Active"

    d.save(ignore_permissions=True)
    frappe.db.commit()
    return {"name": d.name, "warranty_status": d.warranty_status, "warranty_expiry": str(d.warranty_expiry or "")}


@frappe.whitelist()
def create_warranty_from_so(sales_order: str) -> list[dict]:
    """
    Auto-create CM Warranty records for all serialised/warranted items
    on a submitted Sales Order.  Skips items already registered.
    Returns list of created warranty names.
    """
    if not frappe.has_permission("Sales Order", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    so = frappe.get_doc("Sales Order", sales_order)
    if so.docstatus != 1:
        frappe.throw(_("Sales Order must be submitted before registering warranties."))

    created = []
    for item in so.items:
        # Skip items that already have a warranty registered against this SO line
        existing = frappe.db.get_value(
            "CM Warranty",
            {"sales_order": sales_order, "item_code": item.item_code, "serial_no": item.serial_no or ""},
            "name",
        )
        if existing:
            continue

        # Read warranty_months from Item custom field, fall back to default
        w_months = (
            frappe.db.get_value("Item", item.item_code, "cm_warranty_months") or _DEFAULT_WARRANTY_MONTHS
        )

        purchase_date = so.transaction_date or _date.today()
        if hasattr(purchase_date, "strftime"):
            pd_str = purchase_date.strftime("%Y-%m-%d")
        else:
            pd_str = str(purchase_date)[:10]

        pd = _date.fromisoformat(pd_str)
        expiry = pd + relativedelta(months=int(w_months))

        d = frappe.new_doc("CM Warranty")
        d.customer = so.customer
        d.customer_name = so.customer_name
        d.item_code = item.item_code
        d.item_name = item.item_name
        d.serial_no = item.serial_no or ""
        d.purchase_date = pd_str
        d.warranty_months = int(w_months)
        d.warranty_expiry = str(expiry)
        d.warranty_status = "Active"
        d.sales_order = sales_order
        d.save(ignore_permissions=True)
        created.append({"name": d.name, "item_code": item.item_code})

    frappe.db.commit()
    return created


@frappe.whitelist()
def get_expiring_warranties(days_ahead: int = 30) -> list[dict]:
    """Return warranties expiring within the next N days."""
    if not frappe.has_permission("CM Warranty", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    today = str(_date.today())
    future = str(_date.today() + relativedelta(days=int(days_ahead)))

    return frappe.db.sql(
        """
        SELECT name, customer_name, item_name, serial_no, warranty_expiry, warranty_status
        FROM `tabCM Warranty`
        WHERE docstatus != 2
          AND warranty_status = 'Active'
          AND warranty_expiry BETWEEN %(today)s AND %(future)s
        ORDER BY warranty_expiry ASC
        """,
        {"today": today, "future": future},
        as_dict=True,
    )
