import frappe


def _upsert_custom_docperm(parent: str, role: str, permlevel: int) -> str:
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
		name = f"cm_sa_{frappe.scrub(parent)}_{permlevel}"
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

	doc.select = 1
	doc.read = 1
	doc.write = 1
	doc.create = 1
	doc.delete = 1
	doc.submit = 1
	doc.cancel = 1
	doc.amend = 1

	if doc.is_new():
		doc.insert(ignore_permissions=True)
	else:
		doc.save(ignore_permissions=True)

	return doc.name


def execute():
	"""Ensure CM Super Admin retains full access under Custom DocPerm shadowing.

	Why: If a doctype has any Custom DocPerm rows, standard DocPerm is typically shadowed.
	To keep administration functional, CM Super Admin must have full rights on those doctypes.

	Safety: idempotent upsert-by-key; only affects doctypes already using Custom DocPerm.
	"""
	frappe.set_user("Administrator")

	role = "CM Super Admin"
	if not frappe.db.exists("Role", role):
		return {"skipped": True, "reason": "Role not found", "role": role}

	# Determine the doctypes + permlevels that are already governed by Custom DocPerm.
	rows = frappe.get_all("Custom DocPerm", fields=["parent", "permlevel"], limit_page_length=0)
	by_dt: dict[str, set[int]] = {}
	for r in rows:
		parent = r.get("parent")
		if not parent:
			continue
		pl = int(r.get("permlevel") or 0)
		by_dt.setdefault(parent, set()).add(pl)

	updated = []
	for parent in sorted(by_dt.keys()):
		if not frappe.db.exists("DocType", parent):
			continue
		for permlevel in sorted(by_dt[parent]):
			updated.append(_upsert_custom_docperm(parent, role, permlevel))
		try:
			frappe.clear_cache(doctype=parent)
		except Exception:
			pass

	frappe.clear_cache()
	return {"updated": updated, "doctypes": len(by_dt)}
