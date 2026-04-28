from __future__ import annotations

import json

import frappe


def inspect():
	"""Contract 17 Phase A: inspect Item > General tab (fieldname: details).

	Prints the exact live field order inside the `details` tab and groups it by
	section breaks.
	"""
	frappe.set_user("Administrator")
	meta = frappe.get_meta("Item")

	print("== Contract 17: Item meta anchors ==")
	for fn in [
		"details",
		"image",
		"item_code",
		"item_name",
		"cm_given_name",
		"cm_description_line_1",
		"cm_description_line_2",
		"brand",
		"item_group",
		"stock_uom",
		"is_stock_item",
		"disabled",
		"cm_general_identity_section",
	]:
		df = meta.get_field(fn)
		print(fn, "=>", bool(df), (df.fieldtype if df else None), (df.label if df else None))

	# Determine which fields belong to details tab by walking after `details`.
	rows = []
	for df in meta.fields:
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
			}
		)

	in_details = False
	details_rows: list[dict] = []
	for row in rows:
		fn = row["fieldname"]
		if fn == "details" and row["fieldtype"] == "Tab Break":
			in_details = True
			details_rows.append(row)
			continue
		if in_details and row["fieldtype"] == "Tab Break" and fn and fn != "details":
			break
		if in_details:
			details_rows.append(row)

	print("\n== Contract 17: details tab field order (live meta) ==")
	print(json.dumps(details_rows, indent=2, default=str))

	print("\n== Contract 17: details tab grouped by section ==")
	groups: list[dict] = []
	current = {"section_fieldname": None, "section_label": None, "fields": []}

	def flush():
		nonlocal current
		if current["fields"] or current["section_fieldname"]:
			groups.append(current)
		current = {"section_fieldname": None, "section_label": None, "fields": []}

	for row in details_rows:
		if row["fieldtype"] == "Section Break":
			flush()
			current["section_fieldname"] = row["fieldname"]
			current["section_label"] = row["label"]
			continue
		current["fields"].append(
			{
				"fieldname": row["fieldname"],
				"label": row["label"],
				"fieldtype": row["fieldtype"],
				"hidden": row["hidden"],
			}
		)
	flush()

	print(json.dumps(groups, indent=2, default=str))

	print("\n== Contract 17: standard (non-cm_) fields inside details tab ==")
	standardish = []
	for row in details_rows:
		fn = row["fieldname"] or ""
		if not fn:
			continue
		if fn.startswith("cm_"):
			continue
		standardish.append(
			{
				"fieldname": fn,
				"label": row["label"],
				"fieldtype": row["fieldtype"],
				"hidden": row["hidden"],
			}
		)
	print(json.dumps(standardish, indent=2, default=str))
