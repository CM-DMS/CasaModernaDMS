"""Reorganise role profiles to match the new CM job-function model.

New profiles
────────────
  CM Director        — Jason           (everything + director-exclusive)
  CM System Admin    — Brian           (everything, no director-exclusive)
  CM Sales Associate — Kylie, Lee, Melanie, Safaa, Stephanie
  CM Accounts        — Mario Galea     (accounts@)
  CM Logistics       — Marcelle        (logistics@)
  CM Warehouse       — Abdullah        (stores@)
  CM Purchasing      — Emanuel         (purchasing@)

Run via bench execute:
    cd /home/frappe/frappe/casamoderna-bench-v3
    bench --site cms.local execute casamoderna_dms.dev_tools.reorganise_roles.run
"""
from __future__ import annotations

import frappe

# ---------------------------------------------------------------------------
# Profile → role definitions
# ---------------------------------------------------------------------------

PROFILES: dict[str, list[str]] = {
    "CM Director": [
        # ERPNext core
        "System Manager",
        "Sales Manager", "Sales User",
        "Accounts Manager", "Accounts User",
        "Purchase Manager", "Purchase User",
        "Stock Manager", "Stock User",
        "Item Manager",
        "Delivery Manager",
        "Projects User",
        # Custom CM — full set
        "CM Super Admin",
        "CasaModerna Sales Console",
        "CasaModerna Products Console",
        "CasaModerna Purchasing Console",
        "CasaModerna Supplier Maintainer",
        "CasaModerna Suppliers Console",
        "CasaModerna Product Maintainer",
        "CasaModerna Price Supervisor",
        "CasaModerna Credit Manager",
        "CM Purchasing Sales Manager",
        "CasaModerna Logistics",
        # Director-exclusive
        "Owner / Director",
        "Voucher Authorizer",
    ],
    "CM System Admin": [
        # Same as CM Director minus director-exclusive roles
        "System Manager",
        "Sales Manager", "Sales User",
        "Accounts Manager", "Accounts User",
        "Purchase Manager", "Purchase User",
        "Stock Manager", "Stock User",
        "Item Manager",
        "Delivery Manager",
        "Projects User",
        "CM Super Admin",
        "CasaModerna Sales Console",
        "CasaModerna Products Console",
        "CasaModerna Purchasing Console",
        "CasaModerna Supplier Maintainer",
        "CasaModerna Suppliers Console",
        "CasaModerna Product Maintainer",
        "CasaModerna Price Supervisor",
        "CasaModerna Credit Manager",
        "CM Purchasing Sales Manager",
        "CasaModerna Logistics",
    ],
    "CM Sales Associate": [
        "Sales User",
        "Stock User",
        "Projects User",
        "CasaModerna Sales Console",
        "CasaModerna Products Console",
    ],
    "CM Accounts": [
        "Accounts Manager",
        "Accounts User",
        "Sales User",
        "CasaModerna Products Console",
    ],
    "CM Logistics": [
        "Sales User",
        "Stock User",
        "Accounts User",
        "Delivery Manager",
        "CasaModerna Logistics",
        "CasaModerna Sales Console",
        "CasaModerna Products Console",
    ],
    "CM Warehouse": [
        "Stock Manager",
        "Stock User",
        "Item Manager",
        "CasaModerna Products Console",
    ],
    "CM Purchasing": [
        "Purchase Manager",
        "Purchase User",
        "Stock Manager",
        "Stock User",
        "Sales User",
        "Sales Manager",
        "Accounts Manager",
        "Item Manager",
        "CasaModerna Purchasing Console",
        "CasaModerna Products Console",
        "CasaModerna Supplier Maintainer",
        "CasaModerna Suppliers Console",
        "CasaModerna Product Maintainer",
        "CasaModerna Price Supervisor",
        "CM Purchasing Sales Manager",
    ],
}

# ---------------------------------------------------------------------------
# User → new profile
# ---------------------------------------------------------------------------

USER_PROFILES: dict[str, str] = {
    "jason@casamoderna.mt":      "CM Director",
    "brian@casamoderna.mt":      "CM System Admin",
    "kylie@casamoderna.mt":      "CM Sales Associate",
    "lee@casamoderna.mt":        "CM Sales Associate",
    "melanie@casamoderna.mt":    "CM Sales Associate",
    "safaa@casamoderna.mt":      "CM Sales Associate",
    "stephanie@casamoderna.mt":  "CM Sales Associate",
    "accounts@casamoderna.mt":   "CM Accounts",
    "logistics@casamoderna.mt":  "CM Logistics",
    "stores@casamoderna.mt":     "CM Warehouse",
    "purchasing@casamoderna.mt": "CM Purchasing",
}

# Old profile names that will no longer be in use (safe to delete)
OLD_PROFILES = ["Director", "Administrator", "Sales", "Accounts", "Logistics", "Inventory", "Purchase"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _upsert_profile(name: str, roles: list[str]) -> str:
    """Create or replace a Role Profile with the given roles. Returns 'created'|'updated'."""
    missing = [r for r in roles if not frappe.db.exists("Role", r)]
    if missing:
        print(f"  ⚠  [{name}] roles not found in DB, skipping: {', '.join(missing)}")
        roles = [r for r in roles if r not in missing]

    if frappe.db.exists("Role Profile", name):
        doc = frappe.get_doc("Role Profile", name)
        action = "updated"
    else:
        doc = frappe.new_doc("Role Profile")
        doc.role_profile = name
        action = "created"

    # Replace role list entirely
    doc.set("roles", [])
    for r in roles:
        doc.append("roles", {"role": r})

    doc.flags.ignore_permissions = True
    doc.flags.ignore_mandatory = True
    if action == "created":
        doc.insert()
    else:
        doc.save(ignore_version=True)

    return action


def _assign_user_profile(email: str, profile_name: str) -> str:
    """Replace a user's direct role list with the roles from the given profile."""
    if not frappe.db.exists("User", email):
        return f"MISSING user {email}"

    profile_roles = PROFILES[profile_name]

    doc = frappe.get_doc("User", email)
    doc.role_profile_name = profile_name

    # Replace role list with profile roles (keep only roles that exist in DB)
    doc.set("roles", [])
    for r in profile_roles:
        if frappe.db.exists("Role", r):
            doc.append("roles", {"role": r})

    doc.flags.ignore_permissions = True
    doc.flags.ignore_validate = True
    doc.flags.ignore_mandatory = True
    doc.save(ignore_version=True)

    return f"→ {profile_name} ({len(profile_roles)} roles)"


def _delete_old_profiles() -> None:
    for name in OLD_PROFILES:
        if frappe.db.exists("Role Profile", name):
            # Only delete if no user is still assigned to it
            still_used = frappe.db.count("User", {"role_profile_name": name})
            if still_used:
                print(f"  ⚠  Old profile '{name}' still has {still_used} users — skipping delete")
            else:
                frappe.delete_doc("Role Profile", name, ignore_permissions=True)
                print(f"  [OldProfile] deleted : {name}")
        else:
            print(f"  [OldProfile] not found (already gone): {name}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def run() -> None:
    print("\n" + "=" * 60)
    print("reorganise_roles — CM role profile restructure")
    print("=" * 60)

    print("\n--- Creating / updating role profiles ---")
    for profile_name, roles in PROFILES.items():
        action = _upsert_profile(profile_name, roles)
        print(f"  [Profile] {action:8s} : {profile_name} ({len(roles)} roles)")
    frappe.db.commit()

    print("\n--- Assigning users to new profiles ---")
    for email, profile in USER_PROFILES.items():
        result = _assign_user_profile(email, profile)
        print(f"  {email:40s} {result}")
    frappe.db.commit()

    print("\n--- Removing old profiles ---")
    _delete_old_profiles()
    frappe.db.commit()

    print("\n--- Summary ---")
    rows = frappe.db.sql("""
        SELECT u.name, u.role_profile_name, COUNT(hr.name) AS role_count
        FROM tabUser u
        LEFT JOIN `tabHas Role` hr ON hr.parent=u.name AND hr.parenttype='User'
        WHERE u.user_type='System User' AND u.name != 'Administrator'
        GROUP BY u.name, u.role_profile_name
        ORDER BY u.role_profile_name, u.name
    """, as_dict=True)
    for r in rows:
        print(f"  {r.name:40s} profile={r.role_profile_name or '(none)':25s} roles={r.role_count}")

    print("\n" + "=" * 60)
    print("Done.")
    print("=" * 60 + "\n")
