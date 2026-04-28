from __future__ import annotations

import json

import frappe


def inspect():
	"""Contract 16 Phase A: inspect Item > Suppliers & Pricing (purchasing_tab).

	Prints the exact live field order and groups it by section breaks to support
	V1-like 6-block layout mapping.
	"""
	frappe.set_user("Administrator")

	item_meta = frappe.get_meta("Item")
	print("== Contract 16: Item meta anchors ==")
	for fn in [
		"purchasing_tab",
		"cm_suppliers_pricing_section",
		"cm_pricing_inputs_section",
		"cm_pricing_outputs_section",
	]:
		df = item_meta.get_field(fn)
		print(fn, "=>", bool(df), (df.fieldtype if df else None), (df.label if df else None))

	print("\n== Contract 16: purchasing_tab field order (live meta) ==")
	rows = []
	for df in item_meta.fields:
		if getattr(df, "parent", None) != "Item":
			continue
		rows.append(
			{
				"idx": getattr(df, "idx", None),
				"fieldname": df.fieldname,
				"label": df.label,
				"fieldtype": df.fieldtype,
				"insert_after": getattr(df, "insert_after", None),
				"depends_on": getattr(df, "depends_on", None),
				"hidden": int(getattr(df, "hidden", 0) or 0),
				"read_only": int(getattr(df, "read_only", 0) or 0),
				"options": getattr(df, "options", None),
				"in_standard_filter": int(getattr(df, "in_standard_filter", 0) or 0),
			}
		)

	# Determine which fields belong to purchasing_tab by walking after purchasing_tab.
	in_purchasing = False
	purchasing_rows: list[dict] = []
	for row in rows:
		fn = row["fieldname"]
		if fn == "purchasing_tab":
			in_purchasing = True
			purchasing_rows.append(row)
			continue
		if in_purchasing and row["fieldtype"] == "Tab Break" and fn and fn != "purchasing_tab":
			break
		if in_purchasing:
			purchasing_rows.append(row)

	print(json.dumps(purchasing_rows, indent=2, default=str))

	print("\n== Contract 16: purchasing_tab grouped by section ==")
	groups: list[dict] = []
	current = {"section_fieldname": None, "section_label": None, "fields": []}

	def flush():
		nonlocal current
		if current["fields"] or current["section_fieldname"]:
			groups.append(current)
		current = {"section_fieldname": None, "section_label": None, "fields": []}

	for row in purchasing_rows:
		if row["fieldtype"] == "Section Break":
			flush()
			current["section_fieldname"] = row["fieldname"]
			current["section_label"] = row["label"]
			continue
		current["fields"].append({"fieldname": row["fieldname"], "label": row["label"], "fieldtype": row["fieldtype"], "hidden": row["hidden"]})
	flush()

	print(json.dumps(groups, indent=2, default=str))

	print("\n== Contract 16: standard (non-cm_) fields inside purchasing_tab ==")
	standardish = []
	for row in purchasing_rows:
		fn = row["fieldname"] or ""
		if not fn:
			continue
		if fn.startswith("cm_"):
			continue
		if row["fieldtype"] in ("Section Break", "Column Break", "HTML", "Table", "Tab Break"):
			standardish.append({"fieldname": fn, "label": row["label"], "fieldtype": row["fieldtype"], "hidden": row["hidden"]})
			continue
		# include all standard fields, but skip harmless layout helpers
		standardish.append({"fieldname": fn, "label": row["label"], "fieldtype": row["fieldtype"], "hidden": row["hidden"]})
	print(json.dumps(standardish, indent=2, default=str))

	print("\n== Contract 16: supplier table child fields (Item Supplier) ==")
	child_dt = None
	# Find the supplier items table field options.
	for row in purchasing_rows:
		if row["fieldtype"] == "Table" and row.get("options"):
			if row["options"] in ("Item Supplier", "Item Supplier Detail"):
				child_dt = row["options"]
				break

	if not child_dt:
		# fallback to common ERPNext name
		child_dt = "Item Supplier"

	child_meta = frappe.get_meta(child_dt)
	child_fields = [
		{"idx": getattr(df, "idx", None), "fieldname": df.fieldname, "label": df.label, "fieldtype": df.fieldtype, "options": getattr(df, "options", None)}
		for df in child_meta.fields
		if getattr(df, "fieldname", None)
	]
	print(child_dt)
	print(json.dumps(child_fields, indent=2, default=str))
