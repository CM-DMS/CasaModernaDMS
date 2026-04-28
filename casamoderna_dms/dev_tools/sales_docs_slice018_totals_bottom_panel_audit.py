from __future__ import annotations

import json
from dataclasses import dataclass

import frappe


TARGET_DOCTYPES = [
	"Quotation",
	"Sales Order",
	"Delivery Note",
	"Sales Invoice",
	"POS Invoice",
	"CM Proforma",
]


PAYMENT_ANCHORS = [
	"payment_schedule_section",
	"payment_terms_section",
	"advances_section",
]

TOTALS_CORE_FIELDS = [
	"net_total",  # Net Excl VAT
	"total_taxes_and_charges",  # VAT
	"grand_total",  # Grand Total
]

NOISY_TOTALS_FIELDS = [
	"base_net_total",
	"base_total_taxes_and_charges",
	"base_grand_total",
	"rounded_total",
	"base_rounded_total",
	"total",  # legacy/alt total
	"base_total",
	"discount_amount",
	"additional_discount_percentage",
	"apply_discount_on",
	"coupon_code",
]


@dataclass
class _Ctx:
	tab: str | None
	section: str | None
	last_break_fieldname: str | None


def _compute_context(meta) -> dict[str, _Ctx]:
	ctx: dict[str, _Ctx] = {}
	current_tab = None
	current_section = None
	last_break_fieldname = None

	for df in meta.fields:
		fn = getattr(df, "fieldname", None)
		ft = getattr(df, "fieldtype", None)
		label = (getattr(df, "label", None) or "").strip() or None

		if ft == "Tab Break":
			current_tab = label
			current_section = None
			last_break_fieldname = fn
		elif ft == "Section Break":
			current_section = label
			last_break_fieldname = fn
		elif ft == "Column Break":
			last_break_fieldname = fn

		if fn:
			ctx[fn] = _Ctx(tab=current_tab, section=current_section, last_break_fieldname=last_break_fieldname)

	return ctx


def _dump_field(df, ctx: _Ctx | None, idx: int) -> dict:
	return {
		"idx": idx,
		"fieldname": getattr(df, "fieldname", None),
		"label": getattr(df, "label", None),
		"fieldtype": getattr(df, "fieldtype", None),
		"options": getattr(df, "options", None),
		"tab": getattr(ctx, "tab", None),
		"section": getattr(ctx, "section", None),
		"last_break_fieldname": getattr(ctx, "last_break_fieldname", None),
		"hidden": int(getattr(df, "hidden", 0) or 0),
		"reqd": int(getattr(df, "reqd", 0) or 0),
		"read_only": int(getattr(df, "read_only", 0) or 0),
		"in_list_view": int(getattr(df, "in_list_view", 0) or 0),
		"depends_on": getattr(df, "depends_on", None),
		"mandatory_depends_on": getattr(df, "mandatory_depends_on", None),
	}


def _find_fields(meta, predicate) -> list[dict]:
	ctx = _compute_context(meta)
	rows = []
	for idx, df in enumerate(meta.fields):
		fn = getattr(df, "fieldname", None)
		if not fn:
			continue
		if predicate(df):
			rows.append(_dump_field(df, ctx.get(fn), idx))
	return rows


def _section_window(meta, anchor_fieldname: str, window: int = 12) -> dict | None:
	fields = [df for df in meta.fields if getattr(df, "fieldname", None)]
	pos = None
	for i, df in enumerate(fields):
		if df.fieldname == anchor_fieldname:
			pos = i
			break
	if pos is None:
		return None

	start = max(0, pos - window)
	end = min(len(fields), pos + window + 1)
	ctx = _compute_context(meta)
	return {
		"anchor": anchor_fieldname,
		"start": start,
		"end": end,
		"fields": [_dump_field(fields[i], ctx.get(fields[i].fieldname), i) for i in range(start, end)],
	}


def audit_sales_docs_slice018_totals_bottom_panel() -> dict:
	"""Slice 018 audit: determine existing attachments/totals/deposit bottom panel structure.

	Read-only and safe on live sites.
	"""
	frappe.set_user("Administrator")

	out = {
		"target_doctypes": list(TARGET_DOCTYPES),
		"doctypes": {},
	}

	for dt in TARGET_DOCTYPES:
		meta = frappe.get_meta(dt)
		present = {df.fieldname for df in meta.fields if getattr(df, "fieldname", None)}

		keyword_candidates = [
			fn
			for fn in sorted(present)
			if any(k in fn.lower() for k in ["payment", "advance", "deposit", "down", "outstanding", "paid"])
		]

		attach_fields = _find_fields(
			meta,
			lambda df: (getattr(df, "fieldtype", None) in {"Attach", "Attach Image"}
				or "attach" in (getattr(df, "fieldname", "") or "").lower()
				or "attachment" in (getattr(df, "label", "") or "").lower()),
		)

		deposit_fields = _find_fields(
			meta,
			lambda df: ("deposit" in (getattr(df, "fieldname", "") or "").lower()
				or "deposit" in (getattr(df, "label", "") or "").lower()),
		)

		taxes_table = _find_fields(
			meta,
			lambda df: getattr(df, "fieldtype", None) == "Table" and (getattr(df, "fieldname", None) == "taxes"),
		)
		core_fields = []
		for fn in TOTALS_CORE_FIELDS:
			if fn not in present:
				core_fields.append({"fieldname": fn, "present": 0})
				continue
			ctx = _compute_context(meta)
			df = meta.get_field(fn)
			core_fields.append({"fieldname": fn, "present": 1, **_dump_field(df, ctx.get(fn), -1)})

		noisy_fields = []
		for fn in NOISY_TOTALS_FIELDS:
			if fn not in present:
				continue
			ctx = _compute_context(meta)
			df = meta.get_field(fn)
			noisy_fields.append({"fieldname": fn, **_dump_field(df, ctx.get(fn), -1)})

		anchor = "grand_total" if "grand_total" in present else ("net_total" if "net_total" in present else None)
		window_totals = _section_window(meta, anchor, window=18) if anchor else None

		payment_windows = {}
		for a in PAYMENT_ANCHORS:
			if a in present:
				payment_windows[a] = _section_window(meta, a, window=18)

		out["doctypes"][dt] = {
			"present": sorted(present),
			"keyword_candidates": keyword_candidates,
			"attach_fields": attach_fields,
			"deposit_fields": deposit_fields,
			"taxes_table": taxes_table,
			"totals_core_fields": core_fields,
			"noisy_totals_fields": noisy_fields,
			"window_around_totals": window_totals,
			"payment_windows": payment_windows,
		}

	return json.loads(json.dumps(out, default=str))


def execute() -> None:
	"""Convenience wrapper for bench execute."""
	res = audit_sales_docs_slice018_totals_bottom_panel()
	frappe.logger("casamoderna_dms").info({"slice": "018", "audit": __name__})
	print(json.dumps(res, indent=2, sort_keys=True))
