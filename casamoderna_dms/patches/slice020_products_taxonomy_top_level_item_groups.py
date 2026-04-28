from __future__ import annotations

import frappe


V1_TOP_LEVEL = [
	"0100 Living Area",
	"0200 Bedroom",
	"0300 Dining Room",
	"0400 Kitchen & Utility",
	"0500 Home Office",
	"0600 Kids Bedrooms & Child Care",
	"0700 Bathroom Furniture",
	"0800 Outdoor Furniture",
	"0900 Walkin Storage & Organisation",
	"1000 Custom & Projects",
	"1100 Accessories & Décor",
	"1200 Tiles",
]

PARENT_GROUP_NAME = "CM V1 Product Categories"


def _pick_root_item_group() -> str:
	root = "All Item Groups"
	if frappe.db.exists("Item Group", root):
		return root

	groups = frappe.get_all("Item Group", pluck="name", limit=1)
	if groups:
		return groups[0]

	raise frappe.ValidationError("No Item Group records found; cannot create CM V1 taxonomy")


def _ensure_item_group(*, name: str, parent: str, is_group: int) -> str:
	if frappe.db.exists("Item Group", name):
		doc = frappe.get_doc("Item Group", name)
		changed = False
		if doc.parent_item_group != parent:
			doc.parent_item_group = parent
			changed = True
		if int(doc.is_group or 0) != int(is_group):
			doc.is_group = int(is_group)
			changed = True
		if changed:
			doc.save(ignore_permissions=True)
		return doc.name

	doc = frappe.get_doc(
		{
			"doctype": "Item Group",
			"item_group_name": name,
			"parent_item_group": parent,
			"is_group": int(is_group),
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def execute():
	"""Slice 020: create evidence-locked V1 top-level categories as Item Groups.

	Notes:
	- Does NOT delete/rename existing Item Groups.
	- Does NOT remap Items (requires a real live sold-products catalogue to be present).
	"""
	frappe.set_user("Administrator")

	root = _pick_root_item_group()
	parent = _ensure_item_group(name=PARENT_GROUP_NAME, parent=root, is_group=1)

	for name in V1_TOP_LEVEL:
		_ensure_item_group(name=name, parent=parent, is_group=1)
