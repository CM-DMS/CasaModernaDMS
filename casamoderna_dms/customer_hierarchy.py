from __future__ import annotations

import frappe


_MAX_DEPTH = 50


def _customer_meta_has(fieldname: str) -> bool:
	try:
		return frappe.get_meta("Customer").has_field(fieldname)
	except Exception:
		return False


def get_root_customer(customer_name: str) -> str:
	"""Return the top-most ancestor of `customer_name`.

	Uses the stored `cm_root_customer` when available; otherwise walks `cm_parent_customer`.
	"""
	if not customer_name:
		return customer_name

	if not _customer_meta_has("cm_parent_customer"):
		return customer_name

	row = frappe.db.get_value(
		"Customer", customer_name, ["cm_root_customer", "cm_parent_customer"], as_dict=True
	)
	if not row:
		return customer_name

	root = (row.cm_root_customer or "").strip() if _customer_meta_has("cm_root_customer") else ""
	if root and frappe.db.exists("Customer", root):
		return root

	return _compute_root_via_parent_chain(customer_name)


def validate_no_cycle(customer_name: str, parent_name: str | None) -> None:
	if not parent_name:
		return
	if not customer_name:
		return

	seen = {customer_name}
	current = parent_name
	for _ in range(_MAX_DEPTH):
		current = (current or "").strip()
		if not current:
			return
		if current in seen:
			frappe.throw("Customer hierarchy cycle detected.", frappe.ValidationError)
		seen.add(current)

		next_parent = frappe.db.get_value("Customer", current, "cm_parent_customer")
		current = next_parent

	frappe.throw("Customer hierarchy nesting too deep.", frappe.ValidationError)


def update_hierarchy_fields(customer_name: str) -> None:
	"""Recompute cm_root_customer and cm_is_parent for `customer_name` and descendants."""
	_update_subtree(customer_name)


def validate_customer_hierarchy(doc, method=None) -> None:
	"""Customer.validate hook.

	- Prevent self-parenting
	- Prevent cycles
	- Maintain cm_root_customer deterministically
	"""
	if not _customer_meta_has("cm_parent_customer"):
		return

	# Preserve previous parent for on_update.
	if not getattr(doc, "_cm_old_parent_customer", None) and not doc.is_new():
		try:
			doc._cm_old_parent_customer = doc.get_db_value("cm_parent_customer")
		except Exception:
			doc._cm_old_parent_customer = None

	name = getattr(doc, "name", None)
	parent = (getattr(doc, "cm_parent_customer", None) or "").strip() or None

	if name and parent == name:
		frappe.throw("Parent Customer cannot be the same as Customer.", frappe.ValidationError)

	if parent:
		validate_no_cycle(name or "", parent)

	if not _customer_meta_has("cm_root_customer"):
		return

	if not name:
		# Name is required for stable root; on_update will backfill.
		return

	if not parent:
		doc.cm_root_customer = name
		return

	root = get_root_customer(parent) or parent
	doc.cm_root_customer = root


def on_customer_update_hierarchy(doc, method=None) -> None:
	"""Customer.on_update hook.

	- Ensure parent cm_is_parent is set when a child points to it
	- If parent changes, update subtree roots and re-evaluate old/new parents
	"""
	if not _customer_meta_has("cm_parent_customer"):
		return

	name = getattr(doc, "name", None)
	if not name:
		return

	old_parent = (getattr(doc, "_cm_old_parent_customer", None) or "").strip() or None
	new_parent = (getattr(doc, "cm_parent_customer", None) or "").strip() or None

	# Always ensure this node is consistent.
	if old_parent != new_parent:
		_update_subtree(name)
	else:
		_update_one(name)

	if new_parent:
		_set_is_parent_flag(new_parent, is_parent=1)

	if old_parent and old_parent != new_parent:
		_refresh_is_parent_flag(old_parent)


def _compute_root_via_parent_chain(customer_name: str) -> str:
	current = customer_name
	seen: set[str] = set()

	for _ in range(_MAX_DEPTH):
		current = (current or "").strip()
		if not current:
			return customer_name
		if current in seen:
			frappe.throw("Customer hierarchy cycle detected.", frappe.ValidationError)
		seen.add(current)

		parent = frappe.db.get_value("Customer", current, "cm_parent_customer")
		parent = (parent or "").strip()
		if not parent:
			return current
		current = parent

	return current


def _children_of(customer_name: str) -> list[str]:
	if not customer_name:
		return []
	return frappe.get_all(
		"Customer",
		filters={"cm_parent_customer": customer_name},
		pluck="name",
	)


def _set_is_parent_flag(customer_name: str, *, is_parent: int) -> None:
	if not _customer_meta_has("cm_is_parent"):
		return
	if not customer_name:
		return

	frappe.db.set_value(
		"Customer",
		customer_name,
		"cm_is_parent",
		1 if int(is_parent) else 0,
		update_modified=False,
	)


def _refresh_is_parent_flag(customer_name: str) -> None:
	if not _customer_meta_has("cm_is_parent"):
		return
	if not customer_name:
		return

	has_child = bool(frappe.db.exists("Customer", {"cm_parent_customer": customer_name}))
	_set_is_parent_flag(customer_name, is_parent=1 if has_child else 0)


def _update_one(customer_name: str) -> None:
	if not customer_name:
		return

	root = _compute_root_via_parent_chain(customer_name)

	if _customer_meta_has("cm_root_customer"):
		current = (frappe.db.get_value("Customer", customer_name, "cm_root_customer") or "").strip()
		if current != root:
			frappe.db.set_value(
				"Customer",
				customer_name,
				"cm_root_customer",
				root,
				update_modified=False,
			)

	_refresh_is_parent_flag(customer_name)


def _update_subtree(customer_name: str) -> None:
	if not customer_name:
		return

	queue = [customer_name]
	visited: set[str] = set()

	while queue:
		name = queue.pop(0)
		if not name or name in visited:
			continue
		visited.add(name)

		_update_one(name)

		for child in _children_of(name):
			if child not in visited:
				queue.append(child)
