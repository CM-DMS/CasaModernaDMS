from __future__ import annotations

import frappe
from frappe import _
from urllib.parse import quote


def _item_supplier_snapshot(item_code: str) -> dict:
    if not item_code:
        return {}
    row = frappe.db.get_value(
        "Item",
        item_code,
        [
            "item_name",
            "cm_supplier_item_name",
            "cm_supplier_item_code",
            "cm_supplier_variant_description",
            "stock_uom",
        ],
        as_dict=True,
    )
    return row or {}


def prepare_purchase_order_snapshot(doc, method=None):
    """Normalize Purchase Order draft stage and snapshot supplier-facing item details.

    Snapshot policy:
    - item_name: supplier product name when present, else item master name
    - cm_supplier_item_code: from item master if PO row is blank
    - description: supplier variant description if PO row is blank
    - uom: stock_uom when PO row is blank
    """
    if getattr(doc, "doctype", None) != "Purchase Order":
        return

    if (getattr(doc, "docstatus", 0) or 0) != 2 and not (getattr(doc, "cm_po_stage", None) or "").strip():
        doc.cm_po_stage = "Pricing Inquiry"

    for row in getattr(doc, "items", []) or []:
        if not getattr(row, "item_code", None):
            continue

        snap = _item_supplier_snapshot(row.item_code)
        supplier_name = (snap.get("cm_supplier_item_name") or "").strip()
        master_name = (snap.get("item_name") or "").strip()
        if supplier_name:
            row.item_name = supplier_name
        elif not (getattr(row, "item_name", None) or "").strip() and master_name:
            row.item_name = master_name

        if not (getattr(row, "cm_supplier_item_code", None) or "").strip() and (snap.get("cm_supplier_item_code") or "").strip():
            row.cm_supplier_item_code = (snap.get("cm_supplier_item_code") or "").strip()

        if not (getattr(row, "description", None) or "").strip() and (snap.get("cm_supplier_variant_description") or "").strip():
            row.description = (snap.get("cm_supplier_variant_description") or "").strip()

        if not (getattr(row, "uom", None) or "").strip() and (snap.get("stock_uom") or "").strip():
            row.uom = (snap.get("stock_uom") or "").strip()


@frappe.whitelist()
def make_receipt_from_confirmed_po(source_name: str):
    """Create GRN only from submitted + Confirmed Purchase Orders."""
    po = frappe.get_doc("Purchase Order", source_name)

    if po.docstatus != 1:
        frappe.throw(_("Only submitted Purchase Orders can be converted to GRN."))

    if (po.cm_po_stage or "") != "Confirmed":
        frappe.throw(_("Only Confirmed Purchase Orders can be converted to GRN."))

    return frappe.call(
        "erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_receipt",
        source_name=source_name,
    )


@frappe.whitelist()
def get_supplier_print_url(po_name: str) -> str:
    """Return a printable PO URL with stage-aware format fallback.

    - Pricing Inquiry: prefer the CasaModerna inquiry format, then final format.
    - Confirmed/other: prefer the CasaModerna final format.
    - Final fallback remains ERPNext's standard format.
    """
    po = frappe.get_doc("Purchase Order", po_name)

    print_format = "CasaModerna Purchase Order"
    if (po.cm_po_stage or "") == "Pricing Inquiry":
        if frappe.db.exists("Print Format", "CasaModerna Purchase Order Inquiry"):
            print_format = "CasaModerna Purchase Order Inquiry"
        elif frappe.db.exists("Print Format", "CasaModerna Purchase Order"):
            print_format = "CasaModerna Purchase Order"
        else:
            print_format = "Purchase Order"
    elif not frappe.db.exists("Print Format", print_format):
        print_format = "Purchase Order"

    return (
        "/api/method/frappe.utils.print_format.download_pdf"
        f"?doctype=Purchase%20Order&name={quote(po_name)}&format={quote(print_format)}&no_letterhead=0"
    )
