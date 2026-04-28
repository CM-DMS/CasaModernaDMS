"""One-time patch: force-recalculate pricing outputs for all items.

Bypasses the dirty-check so that items with stale computed values
(where inputs were changed without re-saving through the pricing engine)
get their outputs refreshed.

Usage:
  bench --site <site> execute casamoderna_dms.patches.fix_stale_pricing_outputs.execute
"""
from __future__ import annotations

import frappe


def execute():
	frappe.set_user("Administrator")

	from casamoderna_dms.cm_pricing import (
		apply_supplier_ladder,
		_to_decimal,
		_get_company_vat_rate_percent,
	)
	from casamoderna_dms.contract9_products_pricing import compute_pricing
	from decimal import Decimal

	items = frappe.get_all("Item", fields=["name"], limit=0)
	vat = _get_company_vat_rate_percent()

	updated = 0
	errors = 0

	for row in items:
		try:
			doc = frappe.get_doc("Item", row.name)

			# Force ladder recalculation
			ladder = apply_supplier_ladder(doc)

			# Force pricing recalculation (only if RRP is set)
			rrp = _to_decimal(getattr(doc, "cm_rrp_ex_vat", None))
			if rrp and vat is not None:
				target = _to_decimal(getattr(doc, "cm_discount_target_percent", None)) or Decimal("0")
				mode = (getattr(doc, "cm_pricing_rounding_mode", None) or "whole_euro_roundup").strip()
				cost = ladder.get("cost_ex_vat_calculated") if ladder else None

				result = compute_pricing(
					rrp_ex_vat=rrp,
					discount_percent=target,
					vat_rate_percent=vat,
					rounding_mode=mode,
					cost_ex_vat=cost,
				)

				doc.cm_rrp_inc_vat = float(result["rrp_inc_vat"])
				doc.cm_discounted_inc_vat = float(result["discounted_inc_vat"])
				doc.cm_final_offer_inc_vat = float(result["final_offer_inc_vat"])
				doc.cm_final_offer_ex_vat = float(result["final_offer_ex_vat"])
				doc.cm_rounding_delta = float(result["rounding_delta"])
				doc.standard_rate = float(result["final_offer_inc_vat"])

				eff = result.get("effective_discount_percent")
				if eff is not None:
					doc.cm_discount_percent = float(eff)

				if hasattr(doc, "cm_profit_ex_vat"):
					doc.cm_profit_ex_vat = float(result["profit_ex_vat"]) if result.get("profit_ex_vat") is not None else None
				if hasattr(doc, "cm_margin_percent"):
					doc.cm_margin_percent = float(result["margin_percent"]) if result.get("margin_percent") is not None else None
				if hasattr(doc, "cm_markup_percent"):
					doc.cm_markup_percent = float(result["markup_percent"]) if result.get("markup_percent") is not None else None

			# Save without triggering hooks (we already computed everything)
			doc.flags.ignore_validate = True
			doc.flags.ignore_permissions = True
			doc.save()
			updated += 1

		except Exception as e:
			errors += 1
			print(f"  ERROR {row.name}: {e}")

		if updated % 100 == 0 and updated > 0:
			frappe.db.commit()

	frappe.db.commit()
	print(f"Done: {updated} items recalculated, {errors} errors")
	return {"updated": updated, "errors": errors}
