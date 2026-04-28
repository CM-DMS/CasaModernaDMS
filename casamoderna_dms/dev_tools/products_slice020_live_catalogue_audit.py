from __future__ import annotations

import json
import re
from collections import Counter, defaultdict

import frappe


TARGET_TOP_LEVEL_V1 = [
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


def _norm_tokens(s: str) -> list[str]:
	s = (s or "").strip().lower()
	s = re.sub(r"[^a-z0-9]+", " ", s)
	tokens = [t for t in s.split() if t]
	return tokens


def audit_products_slice020_live_catalogue(limit_samples_per_group: int = 12) -> dict:
	"""Slice 020 audit: live Item catalogue evidence (read-only).

	Outputs:
	- Item Groups list (tree info)
	- Items grouped by current Item.item_group with counts + samples
	- Basic naming pattern stats (item_code prefixes, name tokens)

	Safe to run on live sites.
	"""
	frappe.set_user("Administrator")

	item_groups = frappe.get_all(
		"Item Group",
		fields=["name", "parent_item_group", "is_group", "lft", "rgt", "modified"],
		order_by="lft asc, name asc",
		limit=20000,
	)

	# Pull a wide-but-safe set of item fields.
	items = frappe.get_all(
		"Item",
		filters={},
		fields=[
			"name",
			"item_code",
			"item_name",
			"item_group",
			"disabled",
			"is_sales_item",
			"is_stock_item",
			"has_variants",
			"variant_of",
			"stock_uom",
			"brand",
			"modified",
		],
		order_by="item_group asc, item_code asc, name asc",
		limit=200000,
	)

	by_group: dict[str, list[dict]] = defaultdict(list)
	prefix_counter = Counter()
	token_counter = Counter()

	for it in items:
		ig = it.get("item_group") or "(no item_group)"
		by_group[ig].append(it)

		code = (it.get("item_code") or "").strip()
		if code:
			prefix = re.split(r"[-_/\s]", code, maxsplit=1)[0].strip().upper()
			if prefix and len(prefix) <= 12:
				prefix_counter[prefix] += 1

		name = (it.get("item_name") or "").strip()
		for t in _norm_tokens(name)[:8]:
			if len(t) <= 3:
				continue
			token_counter[t] += 1

	groups_out = []
	for ig, rows in sorted(by_group.items(), key=lambda x: (-len(x[1]), x[0])):
		samples = []
		for r in rows[: max(1, int(limit_samples_per_group))]:
			samples.append(
				{
					"item_code": r.get("item_code"),
					"item_name": r.get("item_name"),
					"disabled": int(r.get("disabled") or 0),
					"is_sales_item": int(r.get("is_sales_item") or 0),
					"is_stock_item": int(r.get("is_stock_item") or 0),
					"has_variants": int(r.get("has_variants") or 0),
					"variant_of": r.get("variant_of"),
					"stock_uom": r.get("stock_uom"),
					"brand": r.get("brand"),
				}
			)
		groups_out.append(
			{
				"item_group": ig,
				"count": len(rows),
				"count_active": sum(1 for r in rows if int(r.get("disabled") or 0) == 0),
				"count_sales": sum(1 for r in rows if int(r.get("is_sales_item") or 0) == 1 and int(r.get("disabled") or 0) == 0),
				"samples": samples,
			}
		)

	out = {
		"site": frappe.local.site,
		"v1_top_level_categories_baseline": list(TARGET_TOP_LEVEL_V1),
		"item_group_count": len(item_groups),
		"item_count": len(items),
		"item_groups": item_groups,
		"items_by_item_group": groups_out,
		"item_code_prefix_top": prefix_counter.most_common(60),
		"item_name_token_top": token_counter.most_common(60),
	}
	return json.loads(json.dumps(out, default=str))


def execute(limit_samples_per_group: int = 12) -> None:
	res = audit_products_slice020_live_catalogue(limit_samples_per_group=limit_samples_per_group)
	print(json.dumps(res, indent=2, sort_keys=True))
