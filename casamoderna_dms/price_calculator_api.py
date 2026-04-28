"""price_calculator_api.py — Whitelisted API for CM Price Calculator admin.

Endpoints:
  get_price_calculators()                    → list[dict]
  get_price_calculator(name)                 → dict (with steps)
  save_price_calculator(doc)                 → dict (saved)
  delete_price_calculator(name)              → {success: true}
  apply_formula(name, base_price, lm=0.0)   → {total, trace, requires_lm}
"""

import json
import frappe
from frappe import _


def _require_product_maintainer():
    user_roles = set(frappe.get_roles(frappe.session.user))
    if not ({"Administrator", "System Manager", "CasaModerna Product Maintainer"} & user_roles):
        frappe.throw(_("Not permitted"), frappe.PermissionError)


def _require_sales_read():
    """Read-only access for sales staff — they need to list/view calculators to use
    the Supplier Price modal inside quotations and sales orders."""
    user_roles = set(frappe.get_roles(frappe.session.user))
    allowed = {
        "Administrator", "System Manager",
        "CasaModerna Product Maintainer",
        "CasaModerna Sales Console", "Sales Manager", "Sales User",
        "Owner / Director", "CM Super Admin",
    }
    if not (allowed & user_roles):
        frappe.throw(_("Not permitted"), frappe.PermissionError)


@frappe.whitelist()
def get_price_calculators():
    """List all CM Price Calculator docs with their steps."""
    _require_sales_read()
    docs = frappe.get_all(
        "CM Price Calculator",
        fields=["name", "calculator_name", "calculator_code", "requires_lm",
                "max_discount_percent", "gozo_surcharge", "notes"],
        order_by="calculator_name asc",
    )
    for doc in docs:
        doc["steps"] = frappe.get_all(
            "CM Price Calculator Step",
            filters={"parent": doc["name"], "parenttype": "CM Price Calculator"},
            fields=["name", "label", "step_type", "value", "value2", "idx"],
            order_by="idx asc",
        )
    return docs


@frappe.whitelist()
def get_price_calculator(name):
    """Get a single CM Price Calculator with all steps."""
    _require_sales_read()
    doc = frappe.get_doc("CM Price Calculator", name)
    return doc.as_dict()


@frappe.whitelist(methods=["POST"])
def save_price_calculator(doc):
    """Create or update a CM Price Calculator document."""
    _require_product_maintainer()
    if isinstance(doc, str):
        doc = json.loads(doc)

    name = doc.get("name")
    if name and frappe.db.exists("CM Price Calculator", name):
        d = frappe.get_doc("CM Price Calculator", name)
        d.calculator_name = doc.get("calculator_name", d.calculator_name)
        d.calculator_code = (doc.get("calculator_code") or d.calculator_code or "").upper()
        d.requires_lm = int(bool(doc.get("requires_lm", d.requires_lm)))
        d.max_discount_percent = float(doc.get("max_discount_percent") or 0)
        d.gozo_surcharge = float(doc.get("gozo_surcharge") or 0)
        d.notes = doc.get("notes") or ""
        d.set("steps", [])
        for step in doc.get("steps") or []:
            d.append("steps", {
                "label":     step.get("label") or "",
                "step_type": step.get("step_type") or "ADD_FIXED",
                "value":     float(step.get("value") or 0),
                "value2":    float(step.get("value2") or 0),
            })
        d.save(ignore_permissions=True)
        frappe.db.commit()
        return d.as_dict()
    else:
        d = frappe.new_doc("CM Price Calculator")
        d.calculator_name = doc.get("calculator_name") or ""
        d.calculator_code = (doc.get("calculator_code") or "").upper()
        d.requires_lm = int(bool(doc.get("requires_lm", 0)))
        d.max_discount_percent = float(doc.get("max_discount_percent") or 0)
        d.gozo_surcharge = float(doc.get("gozo_surcharge") or 0)
        d.notes = doc.get("notes") or ""
        for step in doc.get("steps") or []:
            d.append("steps", {
                "label":     step.get("label") or "",
                "step_type": step.get("step_type") or "ADD_FIXED",
                "value":     float(step.get("value") or 0),
                "value2":    float(step.get("value2") or 0),
            })
        d.insert(ignore_permissions=True)
        frappe.db.commit()
        return d.as_dict()


@frappe.whitelist(methods=["POST"])
def delete_price_calculator(name):
    """Delete a CM Price Calculator document."""
    _require_product_maintainer()
    frappe.delete_doc("CM Price Calculator", name, ignore_permissions=True)
    frappe.db.commit()
    return {"success": True}


@frappe.whitelist()
def get_vat_rate():
    """Return the configured company VAT rate as a plain float (e.g. 18.0)."""
    from casamoderna_dms.cm_sales_pricing import _get_company_vat_rate_percent
    vat = _get_company_vat_rate_percent(None)
    return float(vat) if vat is not None else 18.0


@frappe.whitelist()
def apply_formula(name, base_price, lm=0.0):
    """
    Apply a calculator's formula pipeline to a base cost price.
    Returns a step-by-step trace and the resulting selling price.

    Args:
        name:       CM Price Calculator document name
        base_price: starting cost price (float)
        lm:         linear metres (required when requires_lm is true)

    Returns:
        {total, trace: [{step, label, step_type, prev, value, delta}], requires_lm,
         gozo_surcharge}

    Note: ADD_FIXED_WEIGHTED steps are skipped in the single-item preview since
    weight distribution requires the full BOM. They are applied correctly inside
    resolve_night_collection_bom_price().
    """
    doc = frappe.get_doc("CM Price Calculator", name)
    base_price = float(base_price or 0)
    lm = float(lm or 0)

    total = base_price
    trace = [{
        "step": 0,
        "label": "Base cost price",
        "step_type": "BASE",
        "prev": 0,
        "value": round(total, 4),
        "delta": round(total, 4),
    }]

    for idx, step in enumerate(doc.steps or [], start=1):
        prev = total
        st = step.step_type
        v  = float(step.value or 0)
        v2 = float(step.value2 or 0)

        if st == "DISCOUNT_PCT":
            total = total * (1 - v / 100)
        elif st == "INCREASE_PCT":
            total = total * (1 + v / 100)
        elif st == "ADD_FIXED":
            total = total + v
        elif st == "ADD_FIXED_WEIGHTED":
            pass  # skipped in single-item preview; applied in BOM pricing
        elif st == "ADD_INSTALL_FROM_LM":
            total = total + (v * lm) + v2
        elif st == "MULTIPLY":
            total = total * v

        trace.append({
            "step":      idx,
            "label":     step.label,
            "step_type": st,
            "prev":      round(prev, 4),
            "value":     round(total, 4),
            "delta":     round(total - prev, 4),
            "skipped":   st == "ADD_FIXED_WEIGHTED",
        })

    return {
        "total":          round(total, 2),
        "trace":          trace,
        "requires_lm":    bool(doc.requires_lm),
        "gozo_surcharge": float(doc.gozo_surcharge or 0),
    }
