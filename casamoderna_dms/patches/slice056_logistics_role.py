"""Patch: create CasaModerna Logistics role and assign to logistics@casamoderna.mt (Marcelle Demicoli).

The Logistics role is the correct exemption for the office administrator / logistics
coordinator duties.  It unlocks the following sidebar sections that isSalesConsoleOnly
was previously blocking:

  - Warehouse: Delivery Prep, Stock Pull, Pick List
  - Cash: Daily Collections
  - Service: Job Cards, Service Providers
  - Operations: Calendar, Appointments, Leave

Full role set for logistics@casamoderna.mt after this patch:
  CasaModerna Sales Console   — sales docs, customers, quotations, orders
  CasaModerna Logistics       — exempts from isSalesConsoleOnly; unlocks full sidebar  
  Sales User                  — standard ERPNext sales pairing
  Accounts User               — invoices, credit notes, payment entries
  Stock User                  — delivery notes, pick lists

Idempotent — safe to re-run.
"""
import frappe

ROLE_NAME = "CasaModerna Logistics"
USER = "logistics@casamoderna.mt"

ROLES_REQUIRED = [
    "Desk User",
    "All",
    "CasaModerna Sales Console",
    "CasaModerna Logistics",
    "Sales User",
    "Accounts User",
    "Stock User",
]


def _ensure_role_exists():
    if frappe.db.exists("Role", ROLE_NAME):
        return
    role = frappe.new_doc("Role")
    role.role_name = ROLE_NAME
    role.desk_access = 1
    role.is_custom = 1
    role.insert(ignore_permissions=True)
    frappe.db.commit()
    print(f"  Created role: {ROLE_NAME}")


def execute():
    frappe.set_user("Administrator")

    _ensure_role_exists()

    if not frappe.db.exists("User", USER):
        print(f"User {USER} does not exist — skipping role assignment.")
        return

    user_doc = frappe.get_doc("User", USER)
    existing_roles = {r.role for r in user_doc.roles}
    added = []

    for role_name in ROLES_REQUIRED:
        if role_name in existing_roles:
            continue
        if not frappe.db.exists("Role", role_name):
            print(f"  WARNING: Role '{role_name}' does not exist — skipping.")
            continue
        user_doc.append("roles", {"role": role_name})
        added.append(role_name)

    if added:
        user_doc.save(ignore_permissions=True)
        frappe.db.commit()
        print(f"Assigned {len(added)} role(s) to {USER}: {', '.join(added)}")
    else:
        print(f"All roles already assigned to {USER} — nothing to do.")


def _add_role_direct(user_email, role_name):
    """Insert into Has Role directly — avoids silent User.save() failures."""
    existing = {r[0] for r in frappe.db.sql(
        "SELECT role FROM `tabHas Role` WHERE parent=%s", [user_email]
    )}
    if role_name in existing:
        return False
    frappe.db.sql("""
        INSERT INTO `tabHas Role`
            (name, creation, modified, modified_by, owner, docstatus, idx, role, parent, parenttype, parentfield)
        VALUES (%s, NOW(), NOW(), 'Administrator', 'Administrator', 0, 1, %s, %s, 'User', 'roles')
    """, [frappe.generate_hash(length=10), role_name, user_email])
    return True
