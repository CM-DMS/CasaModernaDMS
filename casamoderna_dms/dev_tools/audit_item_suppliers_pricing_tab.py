from __future__ import annotations

import frappe


def audit():
	"""Print a focused audit of Item → Suppliers & Pricing (purchasing_tab) layout.

	Contract verification helper only (not used by runtime hooks).
	Run via:
	- bench --site <site> execute casamoderna_dms.audit_item_suppliers_pricing_tab.audit
	"""
	frappe.set_user("Administrator")

	meta = frappe.get_meta("Item")

	def purchasing_tab_sequence():
		seq: list[dict] = []
		in_tab = False
		for df in meta.fields:
			if df.fieldtype == "Tab Break" and df.fieldname:
				if df.fieldname == "purchasing_tab":
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

	seq = purchasing_tab_sequence()
	print("== AUDIT: Item → Suppliers & Pricing tab (purchasing_tab) field sequence ==")
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

	print("== AUDIT: Pipeline/section anchors (presence + properties) ==")
	want = [
		"cm_suppliers_pricing_section",
		"cm_supplier_name",
		"cm_supplier_code",
		"cm_supplier_variant_description",
		"purchase_uom",
		"lead_time_days",
		"supplier_items",
		"cm_supplier_price_pipeline_section",
		"cm_supplier_price_pipeline_banner",
		"cm_supplier_price_pipeline_grid",
		"cm_pricing_inputs_section",
		"cm_landed_additions_section",
		"cm_calculated_steps_section",
		"cm_pricing_outputs_section",
		"cm_erpnext_purchase_controls_section",
		"min_order_qty",
		"safety_stock",
		"is_purchase_item",
		"last_purchase_rate",
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
