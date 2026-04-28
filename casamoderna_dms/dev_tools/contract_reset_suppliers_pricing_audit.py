import frappe
from frappe.utils import cint


def _iter_tab_fields(meta, tab_fieldname: str):
	fields = meta.fields
	start = None
	end = len(fields)
	for i, df in enumerate(fields):
		if df.fieldtype == "Tab Break" and df.fieldname == tab_fieldname:
			start = i
			continue
		if start is not None and i > start and df.fieldtype == "Tab Break":
			end = i
			break
	if start is None:
		raise Exception(f"Tab not found: {tab_fieldname}")
	return start, end, fields[start:end]


def _fmt_field(df):
	def short(v, n=110):
		if not isinstance(v, str):
			return v
		return (v[:n] + "…") if len(v) > n else v

	return {
		"fieldname": df.fieldname,
		"label": df.label,
		"fieldtype": df.fieldtype,
		"hidden": cint(df.hidden),
		"read_only": cint(df.read_only),
		"reqd": cint(df.reqd),
		"collapsible": cint(getattr(df, "collapsible", 0) or 0),
		"collapsed": cint(getattr(df, "collapsed", 0) or 0),
		"depends_on": short(df.depends_on),
		"read_only_depends_on": short(df.read_only_depends_on),
		"insert_after": df.insert_after,
		"options": short(df.options),
	}


def inspect_item_suppliers_pricing_tab():
	"""Phase A audit helper.

	Prints the *effective* (property-setter-applied) field order and properties
	for Item → Suppliers & Pricing (tab fieldname `purchasing_tab`).
	"""
	frappe.only_for("System Manager")

	dt = "Item"
	tab = "purchasing_tab"
	meta = frappe.get_meta(dt)
	start, end, tab_fields = _iter_tab_fields(meta, tab)

	print(f"DocType: {dt}")
	print(f"Tab: {tab} (indexes {start}..{end-1}, count={end-start})")

	print("\n== Raw field order (grouped by section/columns) ==")
	current_section = None
	col = 1
	for df in tab_fields:
		if df.fieldtype == "Section Break":
			current_section = df.label or df.fieldname or "(Section)"
			col = 1
			print(
				f"\n## SECTION: {current_section}"
				f"  (fieldname={df.fieldname}) hidden={cint(df.hidden)}"
				f" collapsible={cint(getattr(df,'collapsible',0) or 0)}"
				f" collapsed={cint(getattr(df,'collapsed',0) or 0)}"
			)
			continue

		if df.fieldtype == "Column Break":
			col += 1
			print(f"-- Column Break -> col {col} (fieldname={df.fieldname})")
			continue

		if df.fieldtype == "Tab Break":
			print(f"\n== TAB: {df.label} ({df.fieldname}) ==")
			continue

		info = _fmt_field(df)
		tags = []
		if info["fieldname"] and info["fieldname"].startswith("cm_"):
			tags.append("CM")
		if info["hidden"]:
			tags.append("hidden")
		if info["read_only"]:
			tags.append("ro")
		if info["reqd"]:
			tags.append("reqd")
		tag = ("[" + ",".join(tags) + "]") if tags else ""
		print(
			f"{tag} {info['fieldname']:<36} {str(info['label'] or ''):<30} {info['fieldtype']:<14}"
			f" insert_after={info['insert_after']}"
			f" depends_on={info['depends_on']}"
			f" ro_dep={info['read_only_depends_on']}"
			f" opts={info['options']}"
		)

	print("\n== Field presence probe (by concept) ==")
	# Concepts we must support (V1 ladder). We probe *likely* existing fieldnames here,
	# but we do not treat this probe as authoritative mapping (done in Phase B).
	required_concepts = {
		"Supplier list price ex VAT": [
			"cm_supplier_list_price_ex_vat",
			"cm_supplier_list_price",
			"supplier_list_price",
		],
		"Increase before %": ["cm_increase_before_percent", "cm_increase_before"],
		"Discount 1 %": ["cm_discount_1_percent", "cm_discount_1"],
		"Discount 2 %": ["cm_discount_2_percent", "cm_discount_2"],
		"Discount 3 %": ["cm_discount_3_percent", "cm_discount_3"],
		"Increase after %": ["cm_increase_after_percent", "cm_increase_after"],
		"Shipping %": ["cm_shipping_percent"],
		"Shipping fee": ["cm_shipping_fee"],
		"Handling fee": ["cm_handling_fee"],
		"Other landed": ["cm_other_landed"],
		"Purchase price ex VAT": ["cm_purchase_price_ex_vat", "cm_purchase_price"],
		"Cost ex VAT": ["cm_cost_ex_vat", "cm_cost_ex_vat_calculated", "cm_cost_price_ex_vat", "cm_cost_price"],
		"VAT rate context": ["cm_vat_rate_percent", "cm_vat_rate"],
		"RRP ex VAT": ["cm_rrp_ex_vat", "cm_rrp"],
		"RRP inc VAT": ["cm_rrp_inc_vat"],
		"Discounted inc VAT (pre-round)": ["cm_discounted_inc_vat"],
		"Final offer inc VAT": ["cm_final_offer_inc_vat"],
		"Final offer ex VAT": ["cm_final_offer_ex_vat"],
		"Effective discount %": ["cm_discount_percent", "cm_effective_discount_percent"],
		"Profit ex VAT": ["cm_profit_ex_vat"],
		"Margin %": ["cm_margin_percent"],
		"Markup %": ["cm_markup_percent"],
		"Rounding delta": ["cm_rounding_delta"],
	}

	present = {df.fieldname for df in meta.fields if df.fieldname}
	for concept, candidates in required_concepts.items():
		found = [c for c in candidates if c in present]
		print(f"- {concept}: {'YES ' + ', '.join(found) if found else 'NO'}")
