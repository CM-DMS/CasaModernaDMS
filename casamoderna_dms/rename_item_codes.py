"""
rename_item_codes.py — Replace all item codes with random 6-digit numbers.

Replaces the old format (0301-MIL-0035, 1201-SOM-0055) with 6-digit barcoded
product codes (e.g. 482917).  Uses frappe.rename_doc which cascades to ALL
linked records (Sales Orders, Quotations, Stock Ledger, Bins, etc.).

Run via:
  bench --site two.casamodernadms.eu execute casamoderna_dms.rename_item_codes.run
"""
import random
import frappe


def _gen_code(existing: set) -> str:
    """Generate a unique random 6-digit code not already in use."""
    for _ in range(200):
        code = f"{random.randint(100000, 999999):06d}"
        if code not in existing:
            existing.add(code)
            return code
    frappe.throw("Could not generate a unique 6-digit code after 200 attempts.")


def run():
    # Get ALL items (stock + non-stock), skip CM- placeholder service items
    items = frappe.get_all(
        "Item",
        fields=["name", "item_code"],
        order_by="item_code",
        limit_page_length=0,
    )
    print(f"Total items to rename: {len(items)}")

    # Skip the CM- placeholder service items (CM-FREETEXT, CM-DELIVERY, etc.)
    skip_prefixes = ("CM-",)
    to_rename = [i for i in items if not i.item_code.startswith(skip_prefixes)]
    skipped = len(items) - len(to_rename)
    print(f"Skipping {skipped} CM- placeholder items")
    print(f"Renaming {len(to_rename)} items to 6-digit codes")

    # Collect existing codes to avoid collisions
    existing_codes = set()

    renamed = 0
    errors = 0
    for item in to_rename:
        old_code = item.name
        new_code = _gen_code(existing_codes)

        try:
            frappe.rename_doc("Item", old_code, new_code, merge=False)
            renamed += 1
            if renamed % 50 == 0:
                frappe.db.commit()
                print(f"  ... {renamed} / {len(to_rename)} renamed")
        except Exception as e:
            errors += 1
            print(f"  ERROR renaming {old_code} -> {new_code}: {e}")

    frappe.db.commit()
    print(f"\nDone: {renamed} renamed, {errors} errors, {skipped} skipped")

    # Show sample
    sample = frappe.get_all("Item", fields=["name", "item_name"], limit=5, order_by="name")
    print("\nSample new codes:")
    for s in sample:
        print(f"  {s.name}  ->  {(s.item_name or '')[:50]}")
