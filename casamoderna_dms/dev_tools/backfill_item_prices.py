"""
backfill_item_prices.py — one-time sync of Item Price (Standard Selling)
for all items that have cm_final_offer_ex_vat set.

Run via:
    bench --site two.casamodernadms.eu execute \
        casamoderna_dms.dev_tools.backfill_item_prices.run
"""
import frappe
from casamoderna_dms.cm_pricing import sync_item_price


def run():
    items = frappe.get_all(
        "Item",
        filters={"cm_final_offer_ex_vat": [">", 0]},
        fields=["name"],
        limit=0,
    )
    total = len(items)
    updated = 0
    skipped = 0

    for i, row in enumerate(items, 1):
        doc = frappe.get_doc("Item", row.name)
        rate = float(doc.get("cm_final_offer_ex_vat") or 0)
        if rate <= 0:
            skipped += 1
            continue

        existing_rate = frappe.db.get_value(
            "Item Price",
            {"item_code": doc.name, "price_list": "Standard Selling", "selling": 1},
            "price_list_rate",
        )
        if existing_rate and abs(float(existing_rate) - rate) < 0.001:
            skipped += 1
        else:
            sync_item_price(doc)
            updated += 1

        if i % 20 == 0 or i == total:
            print(f"  {i}/{total}  updated={updated}  skipped={skipped}")

    frappe.db.commit()
    print(f"\nDone — {total} items processed, {updated} updated, {skipped} already correct.")
