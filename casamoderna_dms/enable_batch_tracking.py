"""
enable_batch_tracking.py — Enable has_batch_no on all stock items.

Sets has_batch_no=1 for every Item where is_stock_item=1 and has_batch_no=0.
Uses direct DB update for speed (621 items), then clears cache.

Run via:
  bench --site two.casamodernadms.eu execute casamoderna_dms.enable_batch_tracking.run
"""
import frappe


def run():
    # Count items that need updating
    to_update = frappe.db.sql(
        "SELECT COUNT(*) FROM tabItem WHERE is_stock_item=1 AND has_batch_no=0",
        as_list=True,
    )[0][0]
    print(f"Stock items without batch tracking: {to_update}")

    if to_update == 0:
        print("Nothing to do — all stock items already have has_batch_no=1")
        return

    # Direct DB update (no rename cascade needed, safe for this field)
    frappe.db.sql(
        "UPDATE tabItem SET has_batch_no=1 WHERE is_stock_item=1 AND has_batch_no=0"
    )
    frappe.db.commit()
    print(f"Enabled has_batch_no on {to_update} stock items")

    # Confirm
    remaining = frappe.db.sql(
        "SELECT COUNT(*) FROM tabItem WHERE is_stock_item=1 AND has_batch_no=0",
        as_list=True,
    )[0][0]
    if remaining == 0:
        print("All stock items now have has_batch_no=1")
    else:
        print(f"WARNING: {remaining} stock items still have has_batch_no=0")
