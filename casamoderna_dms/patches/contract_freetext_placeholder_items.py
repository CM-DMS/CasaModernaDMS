from __future__ import annotations

import frappe


PLACEHOLDERS = [
	("CM-FREETEXT", "Free Text Line"),
	("CM-DELIVERY", "Delivery Charge"),
	("CM-DELIVERY_GOZO", "Gozo Delivery Charge"),
	("CM-LIFTER", "Lifter Charge"),
	("CM-INSTALLATION", "Installation Charge"),
	# Configurator placeholder items — replaced with real item once a custom line is graduated
	("CM-SOFA", "Configured Sofa"),
	("CM-WARDROBE", "Configured Wardrobe"),
]


def _pick_item_group() -> str:
	candidates = [
		"Services",
		"Service",
		"Charges",
		"Charge",
		"Delivery",
		"Other",
		"Miscellaneous",
	]
	for name in candidates:
		if frappe.db.exists("Item Group", name):
			return name

	root = "All Item Groups"
	if not frappe.db.exists("Item Group", root):
		# Extremely unlikely, but avoid failing migrate.
		groups = frappe.get_all("Item Group", pluck="name", limit=1)
		if groups:
			root = groups[0]

	name = "CM Charges"
	if frappe.db.exists("Item Group", name):
		return name

	doc = frappe.get_doc(
		{
			"doctype": "Item Group",
			"item_group_name": name,
			"parent_item_group": root,
			"is_group": 0,
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def _pick_uom() -> str:
	for name in ["Unit", "Nos", "No", "Each"]:
		if frappe.db.exists("UOM", name):
			return name

	uoms = frappe.get_all("UOM", pluck="name", limit=1)
	if uoms:
		return uoms[0]

	# If a site has no UOMs, ERPNext is already broken; still fail loudly.
	raise frappe.ValidationError("No UOM records found; cannot create placeholder items")


def execute():
	"""Create/ensure placeholder non-stock items for free-text quoting."""
	frappe.set_user("Administrator")

	item_group = _pick_item_group()
	uom = _pick_uom()

	for code, item_name in PLACEHOLDERS:
		if frappe.db.exists("Item", code):
			item = frappe.get_doc("Item", code)
		else:
			item = frappe.new_doc("Item")
			item.item_code = code
			# name is item_code by default in ERPNext
			item.item_name = item_name

		# Deterministic baseline configuration
		item.item_name = item_name
		item.item_group = item_group
		item.stock_uom = uom
		item.is_stock_item = 0
		item.is_sales_item = 1
		# Prefer off to avoid confusion; buying can still reference item if needed.
		if hasattr(item, "is_purchase_item"):
			item.is_purchase_item = 0

		# Ensure these placeholders never participate in CM pricing engine.
		for fieldname in ["cm_rrp_ex_vat", "cm_discount_target_percent", "cm_pricing_rounding_mode"]:
			if hasattr(item, fieldname):
				setattr(item, fieldname, None)

		# Keep Item.description empty so the user must enter line description on the sales doc.
		if hasattr(item, "description"):
			item.description = ""

		# Save
		if item.is_new():
			item.insert(ignore_permissions=True)
		else:
			item.save(ignore_permissions=True)
