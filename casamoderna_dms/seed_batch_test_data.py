"""
seed_batch_test_data.py — Create batch-tracked test stock for all items.

Run via: bench --site two.casamodernadms.eu execute casamoderna_dms.seed_batch_test_data.run
"""
import random
from datetime import date
import frappe


def run():
    items = frappe.get_all('Item',
        filters={'is_stock_item': 1, 'disabled': 0, 'has_batch_no': 1},
        fields=['name', 'item_code', 'item_name', 'stock_uom'],
        order_by='item_code')
    print(f"Active stock items: {len(items)}")

    WAREHOUSES = ['STV L-2 - CM', 'STV L-3 - CM']

    def gen_code():
        for _ in range(100):
            code = f"{random.randint(0, 999999):06d}"
            if not frappe.db.exists('Batch', code):
                return code
        raise Exception("Could not generate unique batch code")

    total_batches = 0
    total_entries = 0

    for item in items:
        num_batches = random.choice([1, 1, 2, 2, 2])
        wh = random.choice(WAREHOUSES)

        for b_idx in range(num_batches):
            code = gen_code()

            if b_idx == 0:
                recv_date = date(2025, random.randint(10, 12), random.randint(1, 28))
            else:
                recv_date = date(2026, random.randint(2, 3), random.randint(1, 28))

            if num_batches == 2 and b_idx == 0:
                qty = random.randint(2, 12)
            else:
                qty = random.randint(15, 100)

            batch = frappe.get_doc({
                'doctype': 'Batch',
                'batch_id': code,
                'item': item.item_code,
                'manufacturing_date': str(recv_date),
            })
            batch.insert(ignore_permissions=True)
            total_batches += 1

            se = frappe.get_doc({
                'doctype': 'Stock Entry',
                'stock_entry_type': 'Material Receipt',
                'posting_date': str(recv_date),
                'posting_time': '09:00:00',
                'items': [{
                    'item_code': item.item_code,
                    'qty': qty,
                    'uom': item.stock_uom,
                    't_warehouse': wh,
                    'batch_no': code,
                    'basic_rate': 0,
                }],
            })
            se.insert(ignore_permissions=True)
            se.submit()
            total_entries += 1

            if total_entries % 20 == 0:
                frappe.db.commit()
                print(f"  ... {total_entries} stock entries created")

    frappe.db.commit()
    print(f"\nDone: {total_batches} batches, {total_entries} stock entries")

    batch_count = frappe.db.count('Batch')
    bins = frappe.db.sql("SELECT COUNT(*) FROM tabBin WHERE actual_qty > 0")[0][0]
    print(f"Total batches: {batch_count}, Bins with stock: {bins}")
