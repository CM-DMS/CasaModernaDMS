from __future__ import annotations

import frappe


def audit_item_search_integration(sample_txt: str = "") -> dict:
	"""Return current Item title/search configuration and field metadata.

	Designed to be executed via `bench execute` (no Server Script / safe_exec).
	"""
	meta = frappe.get_meta("Item")
	dt = frappe.get_doc("DocType", "Item")

	def effective_search_fields() -> list[str]:
		try:
			# Meta has this helper in Frappe v15
			return list(meta.get_search_fields())
		except Exception:
			sf = (getattr(meta, "search_fields", None) or getattr(dt, "search_fields", None) or "")
			return [s.strip() for s in sf.split(",") if s.strip()]

	def field_info(fieldname: str) -> dict:
		df = meta.get_field(fieldname)
		if not df:
			return {"exists": False}
		return {
			"exists": True,
			"fieldtype": getattr(df, "fieldtype", None),
			"label": getattr(df, "label", None),
			"in_global_search": int(getattr(df, "in_global_search", 0) or 0),
			"search_index": int(getattr(df, "search_index", 0) or 0),
		}

	out = {
		"doctype": {
			"raw_title_field": dt.title_field,
			"raw_search_fields": dt.search_fields,
			"raw_show_title_field_in_link": int(dt.show_title_field_in_link or 0),
		},
		"effective": {
			"title_field": getattr(meta, "title_field", None),
			"search_fields": effective_search_fields(),
			"show_title_field_in_link": int(getattr(meta, "show_title_field_in_link", 0) or 0),
		},
		"fields": {
			"item_name": field_info("item_name"),
			"cm_given_name": field_info("cm_given_name"),
			"cm_supplier_code": field_info("cm_supplier_code"),
			"cm_display_name": field_info("cm_display_name"),
		},
	}

	if sample_txt:
		from frappe.desk.search import search_link

		# Note: search_link enforces permission; run as current user.
		out["link_search"] = search_link("Item", txt=sample_txt, page_length=5)

	return out
