import frappe


def _upsert_custom_docperm(parent: str, role: str, permlevel: int, perms: dict) -> str:
	existing = frappe.get_all(
		"Custom DocPerm",
		filters={"parent": parent, "role": role, "permlevel": permlevel},
		fields=["name"],
		order_by="name asc",
		limit=1,
	)
	if existing:
		doc = frappe.get_doc("Custom DocPerm", existing[0]["name"])
	else:
		name = f"cm_sc_{frappe.scrub(parent)}_{permlevel}"
		if frappe.db.exists("Custom DocPerm", name):
			doc = frappe.get_doc("Custom DocPerm", name)
		else:
			doc = frappe.new_doc("Custom DocPerm")
			doc.name = name
			doc.parent = parent
			doc.parenttype = "DocType"
			doc.parentfield = "permissions"
			doc.role = role
			doc.permlevel = permlevel
			doc.if_owner = 0

	# Normalize core permission flags.
	doc.select = 1
	for key in ["read", "write", "create", "delete", "submit", "cancel", "amend"]:
		setattr(doc, key, int(perms.get(key, 0) or 0))

	if doc.is_new():
		doc.insert(ignore_permissions=True)
	else:
		doc.save(ignore_permissions=True)

	return doc.name


def execute():
	"""Sales Console access: ensure effective permissions exist under Custom DocPerm shadowing.

	Context: Many operational doctypes have Custom DocPerm rows (often only for CM Super Admin),
	which shadows standard DocPerm and can make standard roles (e.g. Sales User) ineffective.

	Contract intent (confirmed):
	- Sales Console persona can create/edit draft Quotation + Sales Order
	- Sales Console persona can create/edit Customer
	- Sales Console persona can read Item + Item Group (for item selection)
	- Sales Console persona can read Sales Invoice + Delivery Note (visibility only; derived-only creation rules remain)

	This patch is idempotent and avoids destructive deletes by upserting by logical key.
	"""
	frappe.set_user("Administrator")

	role = "CasaModerna Sales Console"
	if not frappe.db.exists("Role", role):
		return

	changes = []
	changes.append(_upsert_custom_docperm("Company", role, 0, {"read": 1}))
	changes.append(_upsert_custom_docperm("Item", role, 0, {"read": 1}))
	changes.append(_upsert_custom_docperm("Item Group", role, 0, {"read": 1}))
	changes.append(_upsert_custom_docperm("Customer", role, 0, {"read": 1, "write": 1, "create": 1}))
	changes.append(_upsert_custom_docperm("Quotation", role, 0, {"read": 1, "write": 1, "create": 1, "submit": 1}))
	changes.append(_upsert_custom_docperm("Sales Order", role, 0, {"read": 1, "write": 1, "create": 1, "submit": 1}))
	changes.append(_upsert_custom_docperm("Delivery Note", role, 0, {"read": 1}))
	changes.append(_upsert_custom_docperm("Sales Invoice", role, 0, {"read": 1}))

	# Clear caches for affected doctypes.
	for dt in ["Company", "Item", "Item Group", "Customer", "Quotation", "Sales Order", "Delivery Note", "Sales Invoice"]:
		try:
			frappe.clear_cache(doctype=dt)
		except Exception:
			pass

	# Ensure permission cache refresh.
	frappe.clear_cache()

	return {"updated": changes}
