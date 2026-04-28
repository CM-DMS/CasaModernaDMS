"""
migrate_to_consignment_codes.py — One-time migration to 6-digit product codes.

1. Remove all Batch records and batch_no from SLEs
2. Disable has_batch_no on all items
3. Rename all item_codes to random 6-digit numbers
   (skips CM- placeholder service items, does NOT touch supplier codes)
4. Create duplicate consignment items for FIFO test data

Run via:
  bench --site two.casamodernadms.eu execute casamoderna_dms.migrate_to_consignment_codes.run
"""
import random
import frappe


def _gen_code(existing: set) -> str:
    for _ in range(200):
        code = f"{random.randint(100000, 999999):06d}"
        if code not in existing:
            existing.add(code)
            return code
    frappe.throw("Could not generate unique code after 200 attempts.")


def run():
    print("=== Step 1: Remove batch tracking ===")

    # Delete batch records
    batch_count = frappe.db.count("Batch")
    if batch_count:
        frappe.db.sql("DELETE FROM `tabBatch`")
        print(f"  Deleted {batch_count} Batch records")

    # Clear batch_no from SLEs
    frappe.db.sql("UPDATE `tabStock Ledger Entry` SET batch_no = NULL WHERE IFNULL(batch_no, '') != ''")

    # Clear batch_no from Stock Entry Detail
    frappe.db.sql("UPDATE `tabStock Entry Detail` SET batch_no = NULL WHERE IFNULL(batch_no, '') != ''")

    # Disable has_batch_no on all items
    frappe.db.sql("UPDATE `tabItem` SET has_batch_no = 0 WHERE has_batch_no = 1")
    print("  Disabled has_batch_no on all items")

    frappe.db.commit()

    print("\n=== Step 2: Rename item codes to 6-digit ===")

    items = frappe.get_all(
        "Item",
        fields=["name", "item_code", "item_name"],
        order_by="item_code",
        limit_page_length=0,
    )

    # Skip CM- service placeholders — their codes are hardcoded in business logic
    skip_prefixes = ("CM-",)
    to_rename = [i for i in items if not i.item_code.startswith(skip_prefixes)]
    skipped = len(items) - len(to_rename)
    print(f"  Total items: {len(items)}")
    print(f"  Skipping {skipped} CM- placeholder items")
    print(f"  Renaming {len(to_rename)} items")

    # Collect all generated codes to avoid collisions
    existing = set()
    # Also reserve existing 6-digit codes if any
    for i in items:
        if i.item_code.isdigit() and len(i.item_code) == 6:
            existing.add(i.item_code)

    renamed = 0
    errors = 0
    mapping = {}  # old_code -> new_code

    for item in to_rename:
        old_code = item.name
        new_code = _gen_code(existing)
        try:
            frappe.rename_doc("Item", old_code, new_code, merge=False)
            mapping[old_code] = new_code
            renamed += 1
            if renamed % 50 == 0:
                frappe.db.commit()
                print(f"    ... {renamed} / {len(to_rename)}")
        except Exception as e:
            errors += 1
            print(f"    ERROR {old_code} -> {new_code}: {e}")

    frappe.db.commit()
    print(f"  Done: {renamed} renamed, {errors} errors")

    # Verify supplier codes are untouched
    sample = frappe.db.sql("""
        SELECT name, cm_supplier_item_code
        FROM tabItem
        WHERE IFNULL(cm_supplier_item_code, '') != ''
        LIMIT 5
    """, as_dict=True)
    print("\n  Supplier codes preserved (sample):")
    for s in sample:
        print(f"    Item {s.name} -> supplier code: {s.cm_supplier_item_code}")

    print("\n=== Step 3: Create duplicate consignment items for FIFO testing ===")
    _create_fifo_test_data(existing)

    print("\n=== Migration complete ===")


def _create_fifo_test_data(existing_codes: set):
    """For ~30 random stock items, create a second 'consignment' item
    with the same item_name but a different 6-digit code and lower stock.
    This simulates: older consignment partially sold, newer consignment just arrived.
    """
    import random as _random
    from datetime import date, timedelta

    stock_items = frappe.get_all(
        "Item",
        filters={"is_stock_item": 1, "disabled": 0},
        fields=["name", "item_code", "item_name", "cm_given_name", "item_group",
                "stock_uom", "brand", "image",
                "cm_supplier_code", "cm_supplier_name", "cm_supplier_item_code",
                "cm_supplier_item_name"],
        limit_page_length=0,
    )

    # Pick ~30 random items to duplicate
    dupes = _random.sample(stock_items, min(30, len(stock_items)))
    created = 0

    for orig in dupes:
        new_code = _gen_code(existing_codes)
        try:
            new_item = frappe.get_doc({
                "doctype": "Item",
                "item_code": new_code,
                "item_name": orig.item_name,  # SAME product name = same product
                "cm_given_name": orig.cm_given_name,
                "item_group": orig.item_group,
                "stock_uom": orig.stock_uom,
                "brand": orig.brand,
                "image": orig.image,
                "is_stock_item": 1,
                "has_batch_no": 0,
                "has_serial_no": 0,
                # Preserve supplier references
                "cm_supplier_code": orig.cm_supplier_code,
                "cm_supplier_name": orig.cm_supplier_name,
                "cm_supplier_item_code": orig.cm_supplier_item_code,
                "cm_supplier_item_name": orig.cm_supplier_item_name,
            })
            new_item.insert(ignore_permissions=True)

            # Add stock for the new consignment (older, less remaining)
            wh = _random.choice(["STV L-2 - CM", "STV L-3 - CM"])
            qty = _random.randint(2, 8)  # low stock — older consignment
            recv_date = date(2025, _random.randint(8, 11), _random.randint(1, 28))

            se = frappe.get_doc({
                "doctype": "Stock Entry",
                "stock_entry_type": "Material Receipt",
                "posting_date": str(recv_date),
                "posting_time": "09:00:00",
                "items": [{
                    "item_code": new_code,
                    "qty": qty,
                    "uom": orig.stock_uom,
                    "t_warehouse": wh,
                    "basic_rate": 0,
                }],
            })
            se.insert(ignore_permissions=True)
            se.submit()
            created += 1

            if created % 10 == 0:
                frappe.db.commit()
                print(f"    ... {created} consignment items created")

        except Exception as e:
            print(f"    ERROR creating dupe for {orig.name}: {e}")

    frappe.db.commit()
    print(f"  Created {created} duplicate consignment items for FIFO testing")
    print(f"  These share item_name with existing items but have different codes + lower stock")
