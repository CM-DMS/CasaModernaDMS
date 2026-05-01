"""Sync users, roles, role profiles, and sales persons from cm_export into V3.

Run via bench execute:
    cd /home/frappe/frappe/casamoderna-bench-v3
    bench --site cms.local execute \
        casamoderna_dms.dev_tools.sync_users_permissions.run

Safe to re-run (idempotent).
"""
from __future__ import annotations

import json
from pathlib import Path

import frappe

DATA_DIR = Path("/home/frappe/cm_export")

# ---------------------------------------------------------------------------
# Role profiles that exist in V2 but may be absent in V3.
# Roles listed here are the V3 equivalents (kept minimal — the user's direct
# tabHas Role rows already carry the full role set).
# ---------------------------------------------------------------------------
MISSING_ROLE_PROFILES = {
    "Administrator": [
        "System Manager",
        "CM Super Admin",
        "Sales Manager",
        "Accounts Manager",
        "Purchase Manager",
        "Stock Manager",
    ],
    "Director": [
        "System Manager",
        "CM Super Admin",
        "CM Director",
        "Sales Manager",
        "Accounts Manager",
        "Purchase Manager",
        "Stock Manager",
    ],
    "Logistics": [
        "Stock User",
        "Delivery Manager",
        "CasaModerna Logistics",
        "Sales User",
    ],
}

# Roles that exist in V2 but were not migrated to V3 yet
MISSING_ROLES = [
    "Owner / Director",
    "Voucher Authorizer",
]


def _ensure_role(role_name: str) -> None:
    if not frappe.db.exists("Role", role_name):
        doc = frappe.new_doc("Role")
        doc.role_name = role_name
        doc.desk_access = 1
        doc.flags.ignore_permissions = True
        doc.insert()
        frappe.db.commit()
        print(f"  [Role] created  : {role_name}")
    else:
        print(f"  [Role] exists   : {role_name}")


def _ensure_role_profile(profile_name: str, roles: list[str]) -> None:
    if frappe.db.exists("Role Profile", profile_name):
        print(f"  [RoleProfile] exists   : {profile_name}")
        return
    doc = frappe.new_doc("Role Profile")
    doc.role_profile = profile_name
    for r in roles:
        if frappe.db.exists("Role", r):
            doc.append("roles", {"role": r})
    doc.flags.ignore_permissions = True
    doc.insert()
    frappe.db.commit()
    print(f"  [RoleProfile] created  : {profile_name}")


def _sync_user(u: dict) -> str:
    """Update role_profile_name and patch any missing role assignments."""
    email = u["name"]
    roles_from_export = u.pop("roles", [])

    if not frappe.db.exists("User", email):
        return f"  [User] MISSING (not expected): {email}"

    doc = frappe.get_doc("User", email)

    # Update scalar fields from export (first_name, last_name, language, etc.)
    _skip = {"name", "email", "modified", "creation", "modified_by", "owner",
             "mobile_no", "phone"}  # mobile_no has unique constraint; V2 has duplicates
    for k, v in u.items():
        if k in _skip:
            continue
        if hasattr(doc, k) and v is not None:
            setattr(doc, k, v)

    # Patch role_profile_name only if the profile exists in V3
    desired_profile = u.get("role_profile_name")
    if desired_profile and not frappe.db.exists("Role Profile", desired_profile):
        doc.role_profile_name = None  # profile missing — clear it rather than error
    elif desired_profile:
        doc.role_profile_name = desired_profile

    # Ensure every role from the export is present (additive, never removes)
    existing_roles = {r.role for r in doc.get("roles", [])}
    added = []
    for role in roles_from_export:
        if role not in existing_roles:
            if frappe.db.exists("Role", role):
                doc.append("roles", {"role": role})
                added.append(role)
            else:
                print(f"    ⚠ role not in V3, skipping: {role}")

    doc.flags.ignore_permissions = True
    doc.flags.ignore_validate = True
    doc.flags.ignore_mandatory = True
    doc.flags.ignore_version = True
    doc.save(ignore_version=True)

    if added:
        return f"  [User] updated  : {email}  (+roles: {', '.join(added)})"
    return f"  [User] synced   : {email}"


def _sync_sales_persons(salespeople: list[dict]) -> None:
    for sp in salespeople:
        name = sp["name"]
        if frappe.db.exists("Sales Person", name):
            print(f"  [SalesPerson] exists   : {name}")
        else:
            doc = frappe.new_doc("Sales Person")
            doc.update(sp)
            doc.flags.ignore_permissions = True
            doc.insert()
            frappe.db.commit()
            print(f"  [SalesPerson] created  : {name}")


def run() -> None:
    print("\n" + "=" * 60)
    print("sync_users_permissions — V3 user/role sync")
    print("=" * 60)

    # 1. Ensure all required roles exist
    print("\n--- Roles ---")
    for role in MISSING_ROLES:
        _ensure_role(role)

    # 2. Ensure required role profiles exist
    print("\n--- Role Profiles ---")
    for profile, roles in MISSING_ROLE_PROFILES.items():
        _ensure_role_profile(profile, roles)

    # 3. Sync users
    print("\n--- Users ---")
    users = json.loads((DATA_DIR / "users.json").read_text())
    for u in users:
        msg = _sync_user(u)
        print(msg)
    frappe.db.commit()

    # 4. Sync sales persons
    print("\n--- Sales Persons ---")
    salespeople = json.loads((DATA_DIR / "salespeople.json").read_text())
    _sync_sales_persons(salespeople)

    print("\n" + "=" * 60)
    print("Done.")
    print("=" * 60 + "\n")
