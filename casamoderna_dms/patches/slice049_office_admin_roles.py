"""One-time patch: assign Office Administration roles to logistics@casamoderna.mt (Marcelle Demicoli).

Marcelle is the office administrator. Her access extends beyond standard sales:
  - Full sales (quotations, orders, customers) — CasaModerna Sales Console + Sales User
  - Create/edit invoices and credit notes — Accounts User
  - Create/edit/plan deliveries, oversee pick lists — Stock User
  - Cash handover collections — covered by Sales Console via canCashHandover
  - Service: Job Cards, Service Providers — covered by canService frontend group
"""
import frappe


USER = "logistics@casamoderna.mt"

ROLES = [
	# Base desk access
	"Desk User",
	"All",
	# CM custom role — sales documents, customers, service access
	"CasaModerna Sales Console",
	# Standard ERPNext pairing for sales
	"Sales User",
	# Invoices + credit notes (R/W/C on Sales Invoice, Payment Entry)
	"Accounts User",
	# Deliveries, pick lists (R/W/C on Delivery Note, Pick List)
	"Stock User",
]


def execute():
	if not frappe.db.exists("User", USER):
		print(f"User {USER} does not exist — skipping role assignment.")
		return

	user_doc = frappe.get_doc("User", USER)
	existing_roles = {r.role for r in user_doc.roles}
	added = []

	for role_name in ROLES:
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
		print(f"Assigned {len(added)} roles to {USER}: {', '.join(added)}")
	else:
		print(f"All roles already assigned to {USER} — nothing to do.")
