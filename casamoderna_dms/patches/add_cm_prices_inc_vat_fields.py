"""
Patch: add cm_prices_inc_vat Custom Fields to Customer + sales doctypes.
Run once via: bench execute casamoderna_dms.patches.add_cm_prices_inc_vat_fields.execute
"""
import json
import frappe


def execute():
    target_names = {
        "Customer-cm_prices_inc_vat",
        "Quotation-cm_prices_inc_vat",
        "Sales Order-cm_prices_inc_vat",
        "Delivery Note-cm_prices_inc_vat",
        "Sales Invoice-cm_prices_inc_vat",
    }

    fixture_path = frappe.get_app_path(
        "casamoderna_dms",
        "fixtures",
        "custom_field.json",
    )
    with open(fixture_path) as f:
        all_fields = json.load(f)

    fields_to_apply = [fd for fd in all_fields if fd.get("name") in target_names]
    print(f"Applying {len(fields_to_apply)} custom fields…")

    for fd in fields_to_apply:
        name = fd["name"]
        if frappe.db.exists("Custom Field", name):
            print(f"  already exists — skipping: {name}")
            continue
        # Remove meta keys that frappe.get_doc will treat as field data
        fd.pop("doctype", None)
        fd.pop("name", None)
        doc = frappe.get_doc({"doctype": "Custom Field", "name": name, **fd})
        doc.insert(ignore_permissions=True)
        frappe.db.commit()
        print(f"  created: {name}")

    print("Done.")
