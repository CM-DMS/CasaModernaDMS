"""
restore_item_codes.py — Restore original item codes from 6-digit format back to old format.

Reads the mapping from /tmp/item_rename_mapping.json (current_code -> old_code)
and uses frappe.rename_doc to cascade the rename to all linked records.

Skips CM-, CFG-, TMP- prefixed items which were never in the migration scope.

Run via:
  bench --site two.casamodernadms.eu execute casamoderna_dms.restore_item_codes.run
"""
import json
import frappe


def run():
    mapping_path = "/tmp/item_rename_mapping.json"
    try:
        with open(mapping_path) as f:
            mapping = json.load(f)  # { current_6digit_code: old_item_code }
    except FileNotFoundError:
        frappe.throw(f"Mapping file not found at {mapping_path}. Run the mapping script first.")

    print(f"Loaded {len(mapping)} rename pairs")

    renamed = 0
    skipped = 0
    errors = 0

    for current_code, old_code in sorted(mapping.items()):
        # Skip if already renamed (e.g. old_code already exists as an item)
        if not frappe.db.exists("Item", current_code):
            skipped += 1
            print(f"  SKIP (not found): {current_code}")
            continue

        if frappe.db.exists("Item", old_code):
            # Old code already in use — skip to avoid collision
            skipped += 1
            print(f"  SKIP (old code already exists): {current_code} -> {old_code}")
            continue

        try:
            frappe.rename_doc("Item", current_code, old_code, merge=False)
            renamed += 1
            if renamed % 50 == 0:
                frappe.db.commit()
                print(f"  ... {renamed} / {len(mapping)} renamed")
        except Exception as e:
            errors += 1
            print(f"  ERROR: {current_code} -> {old_code}: {e}")

    frappe.db.commit()
    print(f"\nDone: {renamed} renamed, {skipped} skipped, {errors} errors")

    # Show sample
    sample = frappe.db.sql(
        "SELECT name, item_name FROM tabItem WHERE name NOT LIKE 'CM-%' AND name NOT LIKE 'CFG-%' ORDER BY name LIMIT 5",
        as_dict=True,
    )
    print("\nSample restored codes:")
    for s in sample:
        print(f"  {s.name}  ->  {(s.item_name or '')[:60]}")
