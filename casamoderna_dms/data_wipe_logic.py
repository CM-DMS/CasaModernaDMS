"""
data_wipe_logic.py — Core data wipe logic for CasaModerna DMS.

Deletes all business/transactional data in the correct dependency order,
resets all Series counters, and removes uploaded files from disk.

Preserves: User accounts, roles, Company, Chart of Accounts, Item Groups,
Warehouses, Price Lists (structure), custom fields, print formats, doctypes,
CM Locality, system settings.

Can be called from:
  1. The Data Reset admin screen API (data_reset_api.py)
  2. Directly via bench: bench --site <site> execute casamoderna_dms.data_wipe_logic.run_wipe
"""

import os
import shutil
import frappe

# ─── Doctypes to wipe, in dependency order (children before parents) ────────
# Each entry: (doctype_name, is_child_table)
# Child tables are deleted via direct SQL; parent tables go through cancel→delete.

WIPE_ORDER = [
    # ── Ledger entries (no children, just bulk-delete) ──
    ("GL Entry", False),
    ("Stock Ledger Entry", False),
    ("Payment Ledger Entry", False),

    # ── Finance document children → parents ──
    ("Sales Invoice Item", True),
    ("Sales Invoice Payment", True),
    ("Sales Invoice Advance", True),
    ("Sales Invoice", False),
    ("POS Invoice Item", True),
    ("POS Invoice", False),
    ("Payment Entry Reference", True),
    ("Payment Entry Deduction", True),
    ("Payment Entry", False),
    ("Journal Entry Account", True),
    ("Journal Entry", False),

    # ── Delivery ──
    ("Delivery Note Item", True),
    ("Delivery Note", False),

    # ── Sales ──
    ("Sales Order Item", True),
    ("Sales Order", False),
    ("Quotation Item", True),
    ("Quotation", False),

    # ── Purchasing ──
    ("Purchase Invoice Item", True),
    ("Purchase Invoice", False),
    ("Purchase Receipt Item", True),
    ("Purchase Receipt", False),
    ("Purchase Order Item", True),
    ("Purchase Order", False),
    ("Landed Cost Voucher", False),
    ("Landed Cost Taxes and Charges", True),
    ("Landed Cost Item", True),
    ("Landed Cost Purchase Receipt", True),

    # ── Stock ──
    ("Stock Entry Detail", True),
    ("Stock Entry", False),
    ("Stock Reconciliation Item", True),
    ("Stock Reconciliation", False),
    ("Bin", False),

    # ── CM Custom doctypes ──
    ("CM Custom Line", False),
    ("CM Proforma Item", True),
    ("CM Proforma", False),
    ("CM Configurator Pricing Matrix", True),
    ("CM Configurator Pricing Tier", True),
    ("CM Configurator Pricing", False),
    ("CM Price Calculator Step", True),
    ("CM Price Calculator", False),
    ("CM Price Override Request", False),
    ("CM Voucher", False),
    ("CM Customer Appointment", False),
    ("CM Leave Request", False),

    # ── Pricing ──
    ("Item Price", False),
    ("Pricing Rule", False),
    ("Pricing Rule Detail", True),

    # ── Master data ──
    ("Item Supplier", True),
    ("Item Default", True),
    ("Item Tax", True),
    ("Item", False),
    ("Dynamic Link", False),     # severs Address/Contact→Customer/Supplier links
    ("Address", False),
    ("Contact", False),
    ("Contact Phone", True),
    ("Contact Email", True),
    ("Customer", False),
    ("Supplier", False),

    # ── Audit / history ──
    ("Comment", False),
    ("Version", False),
    ("Activity Log", False),
    ("View Log", False),
    ("Communication", False),
    ("Communication Link", True),

    # ── Files ──
    ("File", False),
]

# Flat list of all doctype names for the summary endpoint
WIPE_DOCTYPES = list(dict.fromkeys(dt for dt, _ in WIPE_ORDER))

# What is preserved (shown in the UI)
PRESERVED_SUMMARY = [
    "User accounts and role assignments",
    "Company and Chart of Accounts",
    "Item Groups (product category hierarchy)",
    "Warehouses",
    "Price Lists (structure only — prices deleted)",
    "Custom Fields, Print Formats, Custom Doctypes",
    "CM Locality reference data (re-seeded on migrate)",
    "System Settings, Email Accounts, Domains",
    "Roles and Workspace",
]


def run_wipe(dry_run=False):
    """Execute the full data wipe.

    Args:
        dry_run: If True, only report what would be deleted without deleting.

    Returns:
        list of log entries describing each action taken.
    """
    log = []

    def _log(msg):
        log.append(msg)
        if not dry_run:
            frappe.publish_realtime(
                "data_reset_progress",
                {"message": msg},
                user=frappe.session.user,
            )

    _log("Starting data wipe..." if not dry_run else "DRY RUN — no data will be deleted.")

    # ── Step 1: Cancel all submitted documents ──────────────────────────
    _log("Step 1: Cancelling all submitted documents...")

    submittable_doctypes = [
        "Sales Invoice", "POS Invoice", "Payment Entry", "Journal Entry",
        "Delivery Note", "Sales Order", "Quotation",
        "Purchase Invoice", "Purchase Receipt", "Purchase Order",
        "Stock Entry", "Stock Reconciliation",
        "Landed Cost Voucher",
    ]

    for dt in submittable_doctypes:
        try:
            table = f"tab{dt}"
            count = frappe.db.sql(
                f"SELECT COUNT(*) FROM `{table}` WHERE docstatus = 1"
            )[0][0]
            if count > 0:
                if not dry_run:
                    frappe.db.sql(f"UPDATE `{table}` SET docstatus = 2 WHERE docstatus = 1")
                _log(f"  Cancelled {count} submitted {dt} records")
        except Exception as e:
            _log(f"  Skip cancel {dt}: {e}")

    if not dry_run:
        frappe.db.commit()

    # ── Step 2: Delete in dependency order ──────────────────────────────
    _log("Step 2: Deleting data in dependency order...")

    for dt, is_child in WIPE_ORDER:
        try:
            table = f"tab{dt}"
            count = frappe.db.sql(f"SELECT COUNT(*) FROM `{table}`")[0][0]
            if count == 0:
                continue

            if dt == "File":
                # Only delete non-system files (preserve Frappe core attachments)
                if not dry_run:
                    frappe.db.sql(
                        f"DELETE FROM `{table}` WHERE "
                        "IFNULL(attached_to_doctype, '') NOT IN ('DocType', 'Module Def', 'Print Format', 'Workspace', 'Web Page') "
                        "AND IFNULL(is_home_folder, 0) = 0 "
                        "AND IFNULL(is_attachments_folder, 0) = 0"
                    )
                    deleted = count - frappe.db.sql(f"SELECT COUNT(*) FROM `{table}`")[0][0]
                    _log(f"  Deleted {deleted} File records (preserved system files)")
                else:
                    _log(f"  Would delete ~{count} File records (preserving system files)")
                continue

            if dt == "Dynamic Link":
                # Only delete links to doctypes we're wiping
                if not dry_run:
                    frappe.db.sql(
                        f"DELETE FROM `{table}` WHERE link_doctype IN ('Customer', 'Supplier')"
                    )
                _log(f"  Deleted Dynamic Links for Customer/Supplier")
                continue

            if not dry_run:
                frappe.db.sql(f"DELETE FROM `{table}`")
            _log(f"  Deleted {count} {dt} records")
        except Exception as e:
            _log(f"  Skip {dt}: {e}")

    if not dry_run:
        frappe.db.commit()

    # ── Step 3: Reset all Series counters ───────────────────────────────
    _log("Step 3: Resetting all Series counters to 0...")

    if not dry_run:
        series_count = frappe.db.sql("SELECT COUNT(*) FROM `tabSeries`")[0][0]
        frappe.db.sql("UPDATE `tabSeries` SET `current` = 0")
        frappe.db.commit()
        _log(f"  Reset {series_count} Series entries to 0")
    else:
        series_count = frappe.db.sql("SELECT COUNT(*) FROM `tabSeries`")[0][0]
        _log(f"  Would reset {series_count} Series entries to 0")

    # ── Step 4: Delete uploaded files from disk ─────────────────────────
    _log("Step 4: Cleaning uploaded files from disk...")

    site_path = frappe.get_site_path()
    dirs_to_clean = [
        os.path.join(site_path, "public", "files"),
        os.path.join(site_path, "private", "files"),
    ]

    for dir_path in dirs_to_clean:
        if not os.path.isdir(dir_path):
            _log(f"  Directory not found: {dir_path}")
            continue

        file_count = 0
        for entry in os.listdir(dir_path):
            entry_path = os.path.join(dir_path, entry)
            try:
                if not dry_run:
                    if os.path.isfile(entry_path):
                        os.remove(entry_path)
                    elif os.path.isdir(entry_path):
                        shutil.rmtree(entry_path)
                file_count += 1
            except Exception as e:
                _log(f"  Error removing {entry_path}: {e}")

        _log(f"  {'Removed' if not dry_run else 'Would remove'} {file_count} items from {dir_path}")

    # ── Step 5: Clear cache ─────────────────────────────────────────────
    _log("Step 5: Clearing cache...")
    if not dry_run:
        frappe.clear_cache()
        _log("  Cache cleared")
    else:
        _log("  Would clear cache")

    # ── Done ────────────────────────────────────────────────────────────
    status = "DRY RUN complete" if dry_run else "DATA WIPE COMPLETE"
    _log(f"\n{status}. Run 'bench --site <site> migrate' to restore fixtures.")
    _log("Then run 'bench --site <site> clear-cache' to flush Redis.")

    if not dry_run:
        frappe.db.commit()

    return log
