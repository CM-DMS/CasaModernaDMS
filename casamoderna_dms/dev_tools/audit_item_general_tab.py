from __future__ import annotations

import frappe


def audit():
	"""Print a focused audit of Item → General (details tab) layout.

	This is for contract verification only (not used by runtime hooks).
	Run via:
	- bench --site <site> execute casamoderna_dms.audit_item_general_tab.audit
	"""
	frappe.set_user("Administrator")

	meta = frappe.get_meta("Item")

	def details_tab_sequence():
		seq = []
		in_tab = False
		for df in meta.fields:
			if df.fieldtype == "Tab Break" and df.fieldname:
				if df.fieldname == "details":
					in_tab = True
				else:
					if in_tab:
						break
			if in_tab:
				seq.append(
					{
						"fieldname": df.fieldname,
						"fieldtype": df.fieldtype,
						"label": df.label,
						"insert_after": getattr(df, "insert_after", None),
						"hidden": int(getattr(df, "hidden", 0) or 0),
						"read_only": int(getattr(df, "read_only", 0) or 0),
						"depends_on": getattr(df, "depends_on", None),
					}
				)
		return seq

	seq = details_tab_sequence()
	print("== AUDIT: Item → General tab (details) field sequence ==")
	for i, row in enumerate(seq):
		fn = row.get("fieldname") or ""
		ft = row.get("fieldtype") or ""
		lb = (row.get("label") or "").strip()
		h = row.get("hidden")
		ro = row.get("read_only")
		marker = ""
		if ft in {"Section Break", "Column Break", "Tab Break"}:
			marker = "MARK"
		print(f"{i:03d} {marker:4s} {ft:14s} {fn:40s} label={lb!r} hidden={h} ro={ro}")

	print("== AUDIT: Profile-relevant fields (presence + properties) ==")
	want = [
		"image",
		"item_code",
		"item_name",
		"cm_given_name",
		"cm_description_line_1",
		"cm_description_line_2",
		"item_group",
		"brand",
		"stock_uom",
		"cm_general_meta_panel",
		"cm_general_pricing_summary",
		"cm_general_attachments_section",
		"cm_general_admin_section",
	]
	for fn in want:
		df = meta.get_field(fn)
		if not df:
			print("MISSING:", fn)
			continue
		print(
			"OK:",
			fn,
			"type=",
			df.fieldtype,
			"label=",
			df.label,
			"insert_after=",
			getattr(df, "insert_after", None),
			"hidden=",
			int(getattr(df, "hidden", 0) or 0),
			"read_only=",
			int(getattr(df, "read_only", 0) or 0),
		)
