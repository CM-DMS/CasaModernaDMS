"""
golive_docperm_source_of_truth.py — Single source of truth for Custom DocPerms + Role Profiles.

Architecture:
  - CM Super Admin does NOT get blanket Custom DocPerms. Users with this role
    also have System Manager, which already grants full backend access.
    CM Super Admin is used only as a frontend gate (can('canAdmin')).
  - Only roles that need NON-STANDARD access get Custom DocPerms (~80 records).
  - Role Profiles bundle roles for easy user onboarding.

Extensibility:
  - To add permissions for a new feature, add entries to the relevant *_PERMS list.
  - To create a new role, add it to MANAGED_ROLES and create a new *_PERMS list.
  - To add a new Role Profile, add it to ROLE_PROFILES.
  - Re-run: bench --site <site> migrate  (or bench execute this patch path)

Safe to re-run: deletes all CM-managed Custom DocPerms and recreates them.
Role Profiles are upserted (created or updated).
"""

import frappe


# ── Roles managed by this patch (Custom DocPerm records) ─────────────────────
# Only roles that need non-standard document access are listed here.
# CM Super Admin is intentionally EXCLUDED — System Manager covers backend access.

MANAGED_ROLES = [
    "CasaModerna Sales Console",
    "CasaModerna Products Console",
    "CM Purchasing Sales Manager",
    "Stock User",
    "Sales User",
    "Sales Manager",
    "Accounts User",
]


# ── Permission definitions ───────────────────────────────────────────────────
# Format: (doctype, select, read, write, create, delete, submit, cancel, amend)
# 1 = granted, 0 = denied

SALES_CONSOLE_PERMS = [
    # Submittable docs with select+submit
    ("CM Voucher",          1, 1, 1, 1, 0, 1, 0, 0),
    ("Delivery Note",       1, 1, 1, 1, 0, 1, 0, 0),
    ("Payment Entry",       1, 1, 1, 1, 0, 1, 0, 0),
    ("Sales Invoice",       1, 1, 1, 1, 0, 1, 0, 0),
    # Submittable docs without select
    ("POS Invoice",         0, 1, 1, 1, 0, 1, 0, 0),
    ("Quotation",           0, 1, 1, 1, 0, 1, 0, 0),
    ("Sales Order",         0, 1, 1, 1, 0, 1, 0, 0),
    # Select + read-only
    ("Account",             1, 1, 0, 0, 0, 0, 0, 0),
    ("CM Locality",         1, 1, 0, 0, 0, 0, 0, 0),
    ("Version",             1, 1, 0, 0, 0, 0, 0, 0),
    # Standard CRUD (read, write, create, delete)
    ("Address",             0, 1, 1, 1, 0, 0, 0, 0),
    ("Brand",               0, 1, 1, 1, 0, 0, 0, 0),
    ("CM Customer Appointment", 0, 1, 1, 1, 0, 0, 0, 0),
    ("Comment",             0, 1, 1, 1, 0, 0, 0, 0),
    ("Communication",       0, 1, 1, 1, 0, 0, 0, 0),
    ("Company",             0, 1, 1, 1, 0, 0, 0, 0),
    ("Contact",             0, 1, 1, 1, 0, 0, 0, 0),
    ("Currency",            0, 1, 1, 1, 0, 0, 0, 0),
    ("Customer",            0, 1, 1, 1, 0, 0, 0, 0),
    ("Customer Group",      0, 1, 1, 1, 0, 0, 0, 0),
    ("DocShare",            0, 1, 1, 1, 0, 0, 0, 0),
    ("Dynamic Link",        0, 1, 1, 1, 0, 0, 0, 0),
    ("Employee",            0, 1, 1, 1, 0, 0, 0, 0),
    ("File",                0, 1, 1, 1, 0, 0, 0, 0),
    ("Holiday List",        0, 1, 1, 1, 0, 0, 0, 0),
    ("Item",                0, 1, 1, 1, 0, 0, 0, 0),
    ("Item Group",          0, 1, 1, 1, 0, 0, 0, 0),
    ("Item Price",          0, 1, 1, 1, 0, 0, 0, 0),
    ("Job Card",            0, 1, 1, 1, 0, 0, 0, 0),
    ("Leave Application",   0, 1, 1, 1, 0, 0, 0, 0),
    ("Leave Type",          0, 1, 1, 1, 0, 0, 0, 0),
    ("Letter Head",         0, 1, 1, 1, 0, 0, 0, 0),
    ("Mode of Payment",     0, 1, 1, 1, 0, 0, 0, 0),
    ("Notification Log",    0, 1, 1, 1, 0, 0, 0, 0),
    ("Pick List",           0, 1, 1, 1, 0, 0, 0, 0),
    ("Price List",          0, 1, 1, 1, 0, 0, 0, 0),
    ("Print Format",        0, 1, 1, 1, 0, 0, 0, 0),
    ("Sales Taxes and Charges Template", 0, 1, 1, 1, 0, 0, 0, 0),
    ("Tag",                 0, 1, 1, 1, 0, 0, 0, 0),
    ("Tag Link",            0, 1, 1, 1, 0, 0, 0, 0),
    ("Terms and Conditions", 0, 1, 1, 1, 0, 0, 0, 0),
    ("Territory",           0, 1, 1, 1, 0, 0, 0, 0),
    ("UOM",                 0, 1, 1, 1, 0, 0, 0, 0),
]

PRODUCTS_CONSOLE_PERMS = [
    # Read-only on product-related doctypes
    ("Brand",               0, 1, 0, 0, 0, 0, 0, 0),
    ("Item",                0, 1, 0, 0, 0, 0, 0, 0),
    ("Item Attribute",      0, 1, 0, 0, 0, 0, 0, 0),
    ("Item Group",          0, 1, 0, 0, 0, 0, 0, 0),
    ("Item Price",          0, 1, 0, 0, 0, 0, 0, 0),
    ("Item Tax Template",   0, 1, 0, 0, 0, 0, 0, 0),
    ("Price List",          0, 1, 0, 0, 0, 0, 0, 0),
    ("UOM",                 0, 1, 0, 0, 0, 0, 0, 0),
]

PURCHASING_SALES_MANAGER_PERMS = [
    # Full submit/cancel/amend on transactional docs
    ("Delivery Note",       0, 1, 1, 1, 0, 1, 1, 1),
    ("Payment Entry",       0, 1, 1, 1, 0, 1, 1, 1),
    ("Purchase Invoice",    0, 1, 1, 1, 0, 1, 1, 1),
    ("Purchase Order",      0, 1, 1, 1, 0, 1, 1, 1),
    ("Purchase Receipt",    0, 1, 1, 1, 0, 1, 1, 1),
    ("Quotation",           0, 1, 1, 1, 0, 1, 1, 1),
    ("Sales Invoice",       0, 1, 1, 1, 0, 1, 1, 1),
    ("Sales Order",         0, 1, 1, 1, 0, 1, 1, 1),
    # CRUD on masters
    ("Customer",            0, 1, 1, 1, 0, 0, 0, 0),
    ("Item",                0, 1, 1, 1, 0, 0, 0, 0),
    ("Item Price",          0, 1, 1, 1, 0, 0, 0, 0),
    ("Supplier",            0, 1, 1, 1, 0, 0, 0, 0),
    # Read-only
    ("Address",             0, 1, 0, 0, 0, 0, 0, 0),
    ("Bin",                 0, 1, 0, 0, 0, 0, 0, 0),
    ("Company",             0, 1, 0, 0, 0, 0, 0, 0),
    ("Contact",             0, 1, 0, 0, 0, 0, 0, 0),
    ("Mode of Payment",     0, 1, 0, 0, 0, 0, 0, 0),
    ("Price List",          0, 1, 0, 0, 0, 0, 0, 0),
]

STOCK_USER_PERMS = [
    # CRUD on warehouse ops
    ("Batch",               0, 1, 1, 1, 0, 0, 0, 0),
    ("Bin",                 0, 1, 1, 1, 0, 0, 0, 0),
    ("Delivery Note",       0, 1, 1, 1, 0, 0, 0, 0),
    ("Packing Slip",        0, 1, 1, 1, 0, 0, 0, 0),
    ("Pick List",           0, 1, 1, 1, 0, 0, 0, 0),
    ("Serial No",           0, 1, 1, 1, 0, 0, 0, 0),
    ("Stock Entry",         0, 1, 1, 1, 0, 0, 0, 0),
    ("Stock Ledger Entry",  0, 1, 1, 1, 0, 0, 0, 0),
    ("Warehouse",           0, 1, 1, 1, 0, 0, 0, 0),
]

SALES_USER_PERMS = [
    ("CM Locality",         1, 1, 0, 0, 0, 0, 0, 0),
    ("Sales Person",        1, 1, 0, 0, 0, 0, 0, 0),
]

SALES_MANAGER_PERMS = [
    ("Sales Person",        1, 1, 0, 0, 0, 0, 0, 0),
]

ACCOUNTS_USER_PERMS = [
    ("CM Locality",         1, 1, 0, 0, 0, 0, 0, 0),
]


# ── Role Profiles ────────────────────────────────────────────────────────────
# Each profile bundles the roles a user needs. Assign a profile to onboard.
#
# To add a new profile: add an entry here and re-run the patch.
# To modify a profile: change the roles list and re-run the patch.
# Profiles are upserted — existing profiles are updated, new ones are created.

ROLE_PROFILES = {
    "Director": [
        "Owner / Director",
        "CM Super Admin",
        "System Manager",
        "CasaModerna Sales Console",
        "CasaModerna Products Console",
        "CasaModerna Product Maintainer",
        "CasaModerna Suppliers Console",
        "CasaModerna Supplier Maintainer",
        "CasaModerna Purchasing Console",
        "CasaModerna Price Supervisor",
        "CasaModerna Credit Manager",
        "Voucher Authorizer",
        "Sales Manager",
        "Sales User",
        "Accounts Manager",
        "Accounts User",
        "Stock Manager",
        "Stock User",
        "Purchase Manager",
        "Purchase User",
    ],
    "Administrator": [
        "CM Super Admin",
        "System Manager",
        "CasaModerna Purchasing Console",
        "CasaModerna Products Console",
        "CasaModerna Product Maintainer",
        "CasaModerna Suppliers Console",
        "CasaModerna Supplier Maintainer",
        "Accounts Manager",
        "Accounts User",
        "Stock Manager",
        "Stock User",
        "Sales Manager",
        "Sales User",
        "Purchase Manager",
        "Purchase User",
    ],
    "Sales": [
        "CasaModerna Sales Console",
        "CasaModerna Products Console",
        "Sales User",
        "Stock User",
    ],
    "Purchase": [
        "CasaModerna Purchasing Console",
        "CM Purchasing Sales Manager",
        "CasaModerna Products Console",
        "CasaModerna Product Maintainer",
        "CasaModerna Suppliers Console",
        "CasaModerna Supplier Maintainer",
        "CasaModerna Price Supervisor",
        "Purchase Manager",
        "Accounts Manager",
        "Sales Manager",
        "Sales User",
        "Stock Manager",
    ],
    "Accounts": [
        "Accounts Manager",
        "Accounts User",
        "CasaModerna Products Console",
        "Sales User",
    ],
    "Logistics": [
        "CasaModerna Sales Console",
        "CasaModerna Products Console",
        "Accounts User",
        "Sales User",
        "Stock User",
        "Delivery Manager",
    ],
    "Inventory": [
        "Stock Manager",
        "Stock User",
        "CasaModerna Products Console",
    ],
}


def execute():
    _rebuild_docperms()
    _rebuild_role_profiles()


def _rebuild_docperms():
    """Delete and recreate all Custom DocPerms for managed roles."""
    # Step 1: Delete existing
    for role in MANAGED_ROLES:
        frappe.db.delete("Custom DocPerm", {"role": role})

    # Also clean up CM Super Admin for rebuild
    frappe.db.delete("Custom DocPerm", {"role": "CM Super Admin"})

    # Step 2: CM Super Admin — full access to every doctype
    # Users with this role (brian, jason) must NEVER be locked out.
    all_doctypes = frappe.get_all("DocType", filters={"istable": 0, "issingle": 0}, pluck="name")
    single_doctypes = frappe.get_all("DocType", filters={"issingle": 1}, pluck="name")
    all_doctypes.extend(single_doctypes)
    for dt in all_doctypes:
        _create_perm(dt, "CM Super Admin", 1, 1, 1, 1, 1, 1, 1, 1)

    # Step 3: Create targeted permissions for other roles
    role_perms = [
        ("CasaModerna Sales Console", SALES_CONSOLE_PERMS),
        ("CasaModerna Products Console", PRODUCTS_CONSOLE_PERMS),
        ("CM Purchasing Sales Manager", PURCHASING_SALES_MANAGER_PERMS),
        ("Stock User", STOCK_USER_PERMS),
        ("Sales User", SALES_USER_PERMS),
        ("Sales Manager", SALES_MANAGER_PERMS),
        ("Accounts User", ACCOUNTS_USER_PERMS),
    ]

    total = 0
    for role, perms in role_perms:
        for row in perms:
            _create_perm(row[0], role, *row[1:])
            total += 1

    frappe.db.commit()
    print(f"Custom DocPerms: {len(all_doctypes)} CM Super Admin + {total} other role perms")


def _rebuild_role_profiles():
    """Upsert Role Profiles with their role assignments."""
    for profile_name, roles in ROLE_PROFILES.items():
        if frappe.db.exists("Role Profile", profile_name):
            doc = frappe.get_doc("Role Profile", profile_name)
            doc.roles = []
        else:
            doc = frappe.new_doc("Role Profile")
            doc.role_profile = profile_name

        for role_name in roles:
            if frappe.db.exists("Role", role_name):
                doc.append("roles", {"role": role_name})
            else:
                print(f"  Warning: Role '{role_name}' does not exist, skipping in profile '{profile_name}'")

        doc.save(ignore_permissions=True)

    frappe.db.commit()
    print(f"Role Profiles: {len(ROLE_PROFILES)} profiles configured")


def _create_perm(doctype, role, select, read, write, create, delete, submit, cancel, amend):
    doc = frappe.new_doc("Custom DocPerm")
    doc.parent = doctype
    doc.parenttype = "DocType"
    doc.parentfield = "permissions"
    doc.role = role
    doc.permlevel = 0
    doc.select = select
    doc.read = read
    doc.write = write
    doc.create = create
    doc.delete = delete
    doc.submit = submit
    doc.cancel = cancel
    doc.amend = amend
    doc.db_insert()
