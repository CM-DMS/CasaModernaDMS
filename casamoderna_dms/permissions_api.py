"""
permissions_api.py — Read-only API for the Permissions Viewer admin screen.

Exposes:
  - get_permissions_overview: users, role profiles, role-to-feature mapping
  - assign_role_profile: assign a Role Profile to a user (updates their roles)
"""

import frappe


@frappe.whitelist()
def get_permissions_overview():
    """Return a complete permissions overview for the admin viewer."""
    roles = frappe.get_roles()
    if not any(r in roles for r in ("System Manager", "CM Super Admin", "Administrator")):
        frappe.throw("Access denied", frappe.PermissionError)

    # 1. Users with their roles and profile
    users = frappe.get_all(
        "User",
        filters={"enabled": 1, "name": ["not in", ["Administrator", "Guest"]]},
        fields=["name", "full_name", "role_profile_name"],
        order_by="full_name",
    )

    for user in users:
        user["roles"] = frappe.get_all(
            "Has Role",
            filters={"parent": user["name"], "parenttype": "User"},
            pluck="role",
            order_by="role",
        )

    # 2. Role Profiles with their roles
    profiles = frappe.get_all("Role Profile", pluck="name", order_by="name")
    profile_roles = {}
    for profile in profiles:
        profile_roles[profile] = frappe.get_all(
            "Has Role",
            filters={"parent": profile, "parenttype": "Role Profile"},
            pluck="role",
            order_by="role",
        )

    # 3. Custom DocPerms summary (grouped by role)
    perms = frappe.get_all(
        "Custom DocPerm",
        fields=["parent as doctype", "role", "select", "read", "write",
                "create", "delete", "submit", "cancel", "amend"],
        order_by="role, parent",
    )
    docperms_by_role = {}
    for p in perms:
        role = p.pop("role")
        docperms_by_role.setdefault(role, []).append(p)

    return {
        "users": users,
        "profiles": profile_roles,
        "docperms": docperms_by_role,
    }


@frappe.whitelist()
def assign_role_profile(user, profile):
    """Assign a Role Profile to a user, replacing their current roles with the profile's roles."""
    roles = frappe.get_roles()
    if not any(r in roles for r in ("System Manager", "CM Super Admin", "Administrator")):
        frappe.throw("Access denied", frappe.PermissionError)

    if not profile:
        frappe.throw("Profile name is required")

    # Safety: never allow downgrading users who have CM Super Admin or System Manager
    target_roles = frappe.get_all(
        "Has Role", filters={"parent": user, "parenttype": "User"}, pluck="role"
    )
    if any(r in target_roles for r in ("CM Super Admin", "System Manager")):
        frappe.throw(
            f"{user} has admin-level roles. Change their roles manually in Frappe Desk to prevent accidental lockout.",
            frappe.PermissionError,
        )

    user_doc = frappe.get_doc("User", user)
    user_doc.role_profile_name = profile
    user_doc.save(ignore_permissions=True)
    frappe.db.commit()

    # Return updated roles
    return {
        "user": user,
        "profile": profile,
        "roles": [r.role for r in user_doc.roles],
    }
