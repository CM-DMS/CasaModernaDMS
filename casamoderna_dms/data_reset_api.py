"""
data_reset_api.py — Whitelisted endpoints for the Data Reset admin screen.

Provides:
  - get_data_summary()        → row counts for every business doctype
  - export_doctype_data()     → JSON export of a single doctype's records
  - export_all_data()         → combined JSON export of all exportable master data
  - request_wipe_code()       → generates a one-time confirmation code (5 min TTL)
  - execute_wipe()            → runs the full data wipe with confirmation code

Security: all endpoints restricted to brian@casamoderna.mt and jason@casamoderna.mt.
"""

import frappe
from casamoderna_dms.data_wipe_logic import run_wipe, WIPE_DOCTYPES, PRESERVED_SUMMARY

ALLOWED_USERS = {"brian@casamoderna.mt", "jason@casamoderna.mt"}

# Doctypes whose records can be exported as master data backup
EXPORTABLE_DOCTYPES = {
    "Customer":  ["name", "customer_name", "customer_type", "customer_group",
                   "territory", "cm_customer_code", "cm_mobile", "cm_phone",
                   "cm_email", "cm_id_card", "cm_vat_number", "cm_family_link",
                   "default_currency", "disabled"],
    "Item":      ["name", "item_name", "item_group", "brand", "stock_uom",
                   "is_stock_item", "disabled", "cm_product_type",
                   "cm_given_name", "cm_description_line_1",
                   "cm_description_line_2", "cm_item_display_name",
                   "cm_cost_price_eur", "cm_selling_price_ex_vat",
                   "cm_rrp_inc_vat", "cm_discount_percent"],
    "Supplier":  ["name", "supplier_name", "supplier_group", "supplier_type",
                   "country", "disabled"],
    "Address":   ["name", "address_title", "address_type", "address_line1",
                   "address_line2", "city", "state", "pincode", "country",
                   "email_id", "phone", "is_primary_address",
                   "is_shipping_address"],
    "Contact":   ["name", "first_name", "last_name", "email_id", "phone",
                   "mobile_no", "is_primary_contact"],
    "Item Price": ["name", "item_code", "item_name", "price_list",
                    "price_list_rate", "currency", "uom"],
}


def _check_access():
    if frappe.session.user not in ALLOWED_USERS:
        frappe.throw("Access denied", frappe.PermissionError)


@frappe.whitelist(methods=["GET"])
def get_data_summary():
    """Return row counts for every business doctype that will be affected by a wipe."""
    _check_access()

    counts = {}
    for dt in WIPE_DOCTYPES:
        try:
            counts[dt] = frappe.db.count(dt)
        except Exception:
            counts[dt] = -1  # table may not exist

    export_counts = {}
    for dt in EXPORTABLE_DOCTYPES:
        try:
            export_counts[dt] = frappe.db.count(dt)
        except Exception:
            export_counts[dt] = -1

    return {
        "wipe_counts": counts,
        "export_counts": export_counts,
        "preserved": PRESERVED_SUMMARY,
    }


@frappe.whitelist(methods=["GET"])
def export_doctype_data(doctype):
    """Export all records for a single doctype as JSON array."""
    _check_access()

    if doctype not in EXPORTABLE_DOCTYPES:
        frappe.throw(f"Doctype '{doctype}' is not in the exportable list.")

    fields = EXPORTABLE_DOCTYPES[doctype]
    data = frappe.get_all(doctype, fields=fields, limit_page_length=0)

    # For Address/Contact, include the Dynamic Link parent info
    if doctype == "Address":
        for row in data:
            links = frappe.get_all(
                "Dynamic Link",
                filters={"parent": row["name"], "parenttype": "Address"},
                fields=["link_doctype", "link_name"],
                limit_page_length=0,
            )
            row["links"] = links

    if doctype == "Contact":
        for row in data:
            links = frappe.get_all(
                "Dynamic Link",
                filters={"parent": row["name"], "parenttype": "Contact"},
                fields=["link_doctype", "link_name"],
                limit_page_length=0,
            )
            row["links"] = links

    return {"doctype": doctype, "count": len(data), "data": data}


@frappe.whitelist(methods=["GET"])
def export_all_data():
    """Export all exportable master data as a single JSON payload."""
    _check_access()

    result = {}
    for dt in EXPORTABLE_DOCTYPES:
        fields = EXPORTABLE_DOCTYPES[dt]
        data = frappe.get_all(dt, fields=fields, limit_page_length=0)

        if dt == "Address":
            for row in data:
                links = frappe.get_all(
                    "Dynamic Link",
                    filters={"parent": row["name"], "parenttype": "Address"},
                    fields=["link_doctype", "link_name"],
                    limit_page_length=0,
                )
                row["links"] = links

        if dt == "Contact":
            for row in data:
                links = frappe.get_all(
                    "Dynamic Link",
                    filters={"parent": row["name"], "parenttype": "Contact"},
                    fields=["link_doctype", "link_name"],
                    limit_page_length=0,
                )
                row["links"] = links

        result[dt] = {"count": len(data), "data": data}

    return result


@frappe.whitelist(methods=["POST"])
def request_wipe_code():
    """Generate a one-time confirmation code stored in Redis with 5-minute TTL."""
    _check_access()

    import secrets
    code = secrets.token_hex(4).upper()  # e.g. "A3F1B72C"
    cache_key = f"data_reset_code:{frappe.session.user}"

    frappe.cache.set_value(cache_key, code, expires_in_sec=300)

    return {"code": code}


@frappe.whitelist(methods=["POST"])
def execute_wipe(confirmation_code, typed_phrase):
    """Execute the full data wipe.

    Requires:
      - confirmation_code: must match the code from request_wipe_code()
      - typed_phrase: must be exactly "RESET CASAMODERNA"
    """
    _check_access()

    # Validate typed phrase
    if typed_phrase != "RESET CASAMODERNA":
        frappe.throw("Confirmation phrase does not match. Type: RESET CASAMODERNA")

    # Validate one-time code
    cache_key = f"data_reset_code:{frappe.session.user}"
    stored_code = frappe.cache.get_value(cache_key)

    if not stored_code:
        frappe.throw("Confirmation code expired or not generated. Please start again.")

    if confirmation_code != stored_code:
        frappe.throw("Invalid confirmation code.")

    # Consume the code so it can't be reused
    frappe.cache.delete_value(cache_key)

    # Run the wipe
    log = run_wipe(dry_run=False)

    return {"success": True, "log": log}
