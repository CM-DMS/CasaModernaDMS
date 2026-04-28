"""One-time patch: create 'CasaModerna Customer Admin' role and assign to Brian & Jason.

This role gates who can disable (or re-enable) a Customer record.
See customer_disable.py for the server-side guard and whitelist API.

Users assigned:
  - brian@casamoderna.mt  (Brian Borg)
  - jason@casamoderna.mt  (Jason Falzon)
"""
import frappe

ROLE = "CasaModerna Customer Admin"
USERS = [
	"brian@casamoderna.mt",
	"jason@casamoderna.mt",
]


def execute():
	# 1. Create the role if it doesn't already exist.
	if not frappe.db.exists("Role", ROLE):
		role = frappe.new_doc("Role")
		role.role_name = ROLE
		role.desk_access = 1
		role.save(ignore_permissions=True)
		frappe.db.commit()
		print(f"Created role: {ROLE}")
	else:
		print(f"Role already exists: {ROLE}")

	# 2. Assign to each admin user.
	for username in USERS:
		if not frappe.db.exists("User", username):
			print(f"  WARNING: User '{username}' does not exist — skipping.")
			continue

		user_doc = frappe.get_doc("User", username)
		existing_roles = {r.role for r in user_doc.roles}

		if ROLE in existing_roles:
			print(f"  {username}: role already assigned — nothing to do.")
			continue

		user_doc.append("roles", {"role": ROLE})
		user_doc.save(ignore_permissions=True)
		frappe.db.commit()
		print(f"  Assigned '{ROLE}' to {username}")
