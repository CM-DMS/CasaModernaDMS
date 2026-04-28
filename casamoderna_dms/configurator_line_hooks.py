"""
configurator_line_hooks.py — Auto-create CM Custom Line records for configured products.

When a Quotation or Sales Order is saved (insert or update), any item row
that uses a configured-product placeholder code (CM-SOFA, CM-WARDROBE) and
does not yet have a cm_custom_line_ref is automatically assigned a unique
CFG-YYYY-##### reference via a new CM Custom Line record.

The CFG code is the "temp code" that travels with the sale from Quotation
through to Sales Order.  Once the physical product is prepared for purchasing,
a buyer calls graduate_custom_line() to attach the supplier's permanent item
code to the same CM Custom Line — both codes are then retained.

QT → SO inheritance
-------------------
When ERPNext creates a Sales Order from a Quotation, it copies the item rows
but does NOT carry the cm_custom_line_ref field.  ensure_custom_lines therefore
creates a fresh CM Custom Line for each SO item — but that new record has no
config_json or pricing_json.

This is fixed here: when creating a new CM Custom Line for a Sales Order item
that has a quotation_item link, we immediately copy config_json and pricing_json
from the source Quotation's CM Custom Line.  This is lossless and automatic —
no manual re-configuration required after "Make Sales Order".
"""

from __future__ import annotations

import frappe

# Item codes that represent configured-to-order products.
# These must exist as non-stock Item records in Frappe (created by
# the contract_freetext_placeholder_items patch).
CONFIGURED_ITEM_CODES = frozenset({"CM-SOFA", "CM-WARDROBE"})


def _inherit_config_from_quotation(cl, item):
    """If this SO item was made from a Quotation item, copy config_json and
    pricing_json from the source CM Custom Line onto the newly created one.
    Returns True if data was found and copied.
    """
    qt_item_name = getattr(item, "quotation_item", None)
    if not qt_item_name:
        return False

    source_ref = frappe.db.get_value("Quotation Item", qt_item_name, "cm_custom_line_ref")
    if not source_ref:
        return False

    source = frappe.db.get_value(
        "CM Custom Line", source_ref, ["config_json", "pricing_json"], as_dict=True
    )
    if not source:
        return False

    copied = False
    if source.get("config_json"):
        cl.config_json = source["config_json"]
        copied = True
    if source.get("pricing_json"):
        cl.pricing_json = source["pricing_json"]
        copied = True
    return copied


def ensure_custom_lines(doc, method=None):
    """Create a CM Custom Line (CFG-YYYY-#####) for every configured row
    that does not yet have one, and write the reference back to the row.

    Called from on_update (after_save/after_insert) for Quotation and Sales Order.
    At this point all child rows have their database primary keys, so
    frappe.db.set_value() on the item child table is safe.
    """
    if doc.doctype not in ("Quotation", "Sales Order"):
        return

    for item in doc.items or []:
        if (item.item_code or "").strip() not in CONFIGURED_ITEM_CODES:
            continue
        if getattr(item, "cm_custom_line_ref", None):
            # Keep the CM Custom Line description in sync with the SO Item name.
            # If the user reconfigures the item after initial save the description
            # may have drifted; this keeps the tracker fallback label accurate.
            current_desc = (item.item_name or "").strip() or item.item_code
            stored_desc = frappe.db.get_value(
                "CM Custom Line", item.cm_custom_line_ref, "description"
            )
            if stored_desc is not None and stored_desc != current_desc:
                frappe.db.set_value(
                    "CM Custom Line", item.cm_custom_line_ref, "description", current_desc
                )
            continue  # already has a unique temp code — skip

        # Create the CM Custom Line; autoname produces CFG-YYYY-#####
        cl = frappe.new_doc("CM Custom Line")
        cl.line_type = "CONFIGURED"
        cl.status = "Draft"
        cl.parent_doctype = doc.doctype
        cl.parent_name = doc.name
        cl.description = (item.item_name or "").strip() or item.item_code
        cl.offer_incl_vat = float(item.rate or 0)
        cl.rrp_incl_vat = float(getattr(item, "cm_rrp_inc_vat", None) or 0)

        # For Sales Order items that came from a Quotation, inherit the
        # configurator snapshot so data is never blank after QT → SO.
        if doc.doctype == "Sales Order":
            _inherit_config_from_quotation(cl, item)

        cl.insert(ignore_permissions=True)

        # Persist the reference on the child row and update the in-memory doc
        # so the REST response already carries the new CFG code.
        # update_modified=False: this db_set runs inside on_update (after save),
        # so bumping the parent's modified timestamp here would cause the REST
        # response to carry a stale value — triggering a 409 TimestampMismatchError
        # on the very next save attempt.
        frappe.db.set_value(
            f"{doc.doctype} Item",
            item.name,
            "cm_custom_line_ref",
            cl.name,
            update_modified=False,
        )
        item.cm_custom_line_ref = cl.name

