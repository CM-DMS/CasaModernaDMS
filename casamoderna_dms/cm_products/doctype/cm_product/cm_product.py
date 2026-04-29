from __future__ import annotations

from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP

import frappe
from frappe.model.document import Document


# ── Group prefix map (confirmed 2026-04-29) ───────────────────────────────────
GROUP_PREFIX_MAP: dict[str, str] = {
	"Living Area":              "0100",
	"Sofas and Armchairs":      "0200",
	"Custom Sofas":             "0300",
	"Bedrooms":                 "0400",
	"Kids Bedrooms":            "0500",
	"Walkin Storage & Wardrobes": "0600",
	"Dining Tables":            "0700",
	"Dining Chairs":            "0800",
	"Kitchen & Utility":        "0900",
	"Bathrooms":                "1000",
	"Office":                   "1100",
	"Outdoor Furniture":        "1200",
	"Accessories and Deco":     "1300",
	"Tiles":                    "1400",
	"Internal & External Doors": "1500",
	"Miscellaneous Items":      "1600",
}

DEFAULT_VAT_RATE   = Decimal("18")
TIER1_FACTOR       = Decimal("0.70")   # Tier 1 default = 70% of RRP inc VAT


def _ceil_euro(value: Decimal) -> Decimal:
	"""Round up to the nearest whole euro (ceiling)."""
	return value.to_integral_value(rounding=ROUND_CEILING)


def _to_d(value) -> Decimal:
	return Decimal(str(value or 0))


class CMProduct(Document):
	# ── Naming ───────────────────────────────────────────────────────────────

	def autoname(self):
		self.cm_given_code = self._generate_code()
		self.name = self.cm_given_code

	# ── Lifecycle ────────────────────────────────────────────────────────────

	def validate(self):
		self._normalise_supplier_code()
		self._detect_rrp_override()
		self._compute_pricing()

	def after_insert(self):
		self._sync_erpnext_item()

	def on_update(self):
		self._sync_erpnext_item()

	# ── Code generation ──────────────────────────────────────────────────────

	def _generate_code(self) -> str:
		prefix = GROUP_PREFIX_MAP.get(self.item_group)
		if not prefix:
			frappe.throw(
				f"Product Group '{self.item_group}' does not have a code prefix assigned. "
				f"Allowed groups: {', '.join(sorted(GROUP_PREFIX_MAP))}."
			)

		sup = (self.cm_supplier_code or "").strip().upper()
		if len(sup) != 3 or not sup.isalpha():
			frappe.throw("Supplier Code must be exactly 3 alphabetic letters (e.g. ARE, MIL).")

		pattern = f"{prefix}-{sup}-%"
		last = frappe.db.sql(
			"SELECT name FROM `tabCM Product` WHERE name LIKE %s ORDER BY name DESC LIMIT 1",
			(pattern,),
		)
		if last:
			try:
				seq = int(last[0][0].rsplit("-", 1)[-1]) + 1
			except (ValueError, IndexError):
				seq = 1
		else:
			seq = 1

		return f"{prefix}-{sup}-{seq:05d}"

	# ── Validation helpers ───────────────────────────────────────────────────

	def _normalise_supplier_code(self):
		sup = (self.cm_supplier_code or "").strip().upper()
		if sup != (self.cm_supplier_code or ""):
			self.cm_supplier_code = sup

	def _detect_rrp_override(self):
		"""Set cm_rrp_manual_override when the user has edited RRP directly.

		Logic: if cm_rrp_ex_vat differs from what auto-compute would produce
		(given the current cost and margin %) we treat it as a manual override
		and stop touching it on subsequent saves.  The flag is cleared
		automatically when the cost inputs change (margin_pct > 0 AND cost > 0
		AND rrp_ex_vat == 0 means the user just cleared the field to let
		auto-compute take over again).
		"""
		if not self.is_new():
			before = self.get_doc_before_save()
			if before and float(before.get("cm_rrp_ex_vat") or 0) != float(self.cm_rrp_ex_vat or 0):
				# RRP changed on this save — flag it as manual unless it was zeroed
				if float(self.cm_rrp_ex_vat or 0) != 0:
					self.cm_rrp_manual_override = 1
				else:
					self.cm_rrp_manual_override = 0

	# ── Pricing computation ──────────────────────────────────────────────────

	def _compute_pricing(self):
		vat        = _to_d(self.cm_vat_rate_percent or DEFAULT_VAT_RATE)
		vat_mult   = 1 + vat / 100
		purchase   = _to_d(self.cm_purchase_price_ex_vat)

		# ── Landed additions ──
		ship_pct  = _to_d(self.cm_shipping_percent)
		ship_fee  = _to_d(self.cm_shipping_fee)
		handling  = _to_d(self.cm_handling_fee)
		other     = _to_d(self.cm_other_landed)
		delivery  = _to_d(self.cm_delivery_installation_fee)

		landed = (purchase * ship_pct / 100) + ship_fee + handling + other + delivery
		self.cm_landed_additions_total_ex_vat = float(
			landed.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
		)

		total_cost = purchase + landed
		self.cm_cost_ex_vat_calculated = float(
			total_cost.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
		)

		# ── RRP ──
		margin_pct = _to_d(self.cm_target_margin_percent)
		if (
			not self.cm_rrp_manual_override
			and margin_pct > 0
			and total_cost > 0
		):
			rrp_ex = total_cost / (1 - margin_pct / 100)
			self.cm_rrp_ex_vat = float(
				rrp_ex.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
			)

		rrp_ex  = _to_d(self.cm_rrp_ex_vat)
		rrp_inc = _ceil_euro(rrp_ex * vat_mult)
		self.cm_rrp_inc_vat = float(rrp_inc)

		# ── Tier 1 auto-suggest (RRP × 70%, only when blank) ──
		if rrp_inc > 0 and not (self.cm_offer_tier1_inc_vat or 0):
			self.cm_offer_tier1_inc_vat = float(_ceil_euro(rrp_inc * TIER1_FACTOR))

		# ── Per-tier ex-VAT and discount % ──
		for n in (1, 2, 3):
			inc_field  = f"cm_offer_tier{n}_inc_vat"
			ex_field   = f"cm_offer_tier{n}_ex_vat"
			disc_field = f"cm_offer_tier{n}_discount_pct"

			tier_inc = _to_d(self.get(inc_field))
			if tier_inc > 0:
				tier_ex = tier_inc / vat_mult
				self.set(ex_field,   float(tier_ex.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)))
				if rrp_inc > 0:
					disc = (1 - tier_inc / rrp_inc) * 100
					self.set(disc_field, float(disc.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)))
				else:
					self.set(disc_field, 0.0)
			else:
				self.set(ex_field,   0.0)
				self.set(disc_field, 0.0)

	# ── ERPNext Item thin sync ────────────────────────────────────────────────

	def _sync_erpnext_item(self):
		"""Auto-create or update the thin ERPNext Item that backs this CM Product.

		The thin Item exists solely so that Quotations, Sales Orders, and Purchase
		Orders can reference item_code.  It is invisible to end-users; all product
		management happens through CM Product.

		Uses ignore_doc_events to avoid triggering the old 157-field pricing hooks
		(product_code_auto, cm_pricing, etc.) which are no longer relevant for
		CM Product-managed items.
		"""
		item_code = self.cm_given_code
		if not item_code:
			return

		if frappe.db.exists("Item", item_code):
			item = frappe.get_doc("Item", item_code)
			is_new = False
		else:
			item = frappe.new_doc("Item")
			item.item_code = item_code
			is_new = True

		# Core identity fields
		item.item_name  = self.cm_given_name or self.item_name or item_code
		item.item_group = self.item_group
		item.stock_uom  = self.stock_uom or "EA"
		item.is_stock_item = int(self.is_stock_item or 0)
		item.disabled      = int(self.disabled or 0)

		# Pricing fields required by cm_sales_pricing.py for legacy code-paths.
		# Tier 1 (ex VAT) is the default selling price / cm_final_offer.
		item.cm_rrp_ex_vat            = self.cm_rrp_ex_vat or 0
		item.cm_vat_rate_percent       = float(self.cm_vat_rate_percent or DEFAULT_VAT_RATE)
		item.cm_final_offer_ex_vat     = self.cm_offer_tier1_ex_vat or 0
		item.cm_final_offer_inc_vat    = self.cm_offer_tier1_inc_vat or 0
		item.cm_discount_target_percent = self.cm_offer_tier1_discount_pct or 0
		item.cm_pricing_rounding_mode   = "whole_euro_roundup"
		item.image                       = self.image or None

		# Ensure the UOM conversion table has the stock UOM listed, otherwise
		# ERPNext raises "UOM <uom> not found in Item" on transaction validation.
		if is_new:
			uom_val = item.stock_uom or "EA"
			item.set("uoms", [{"uom": uom_val, "conversion_factor": 1.0}])

		# Skip all external hooks — this Item is purely a reference placeholder.
		item.flags.ignore_permissions  = True
		item.flags.ignore_validate     = True
		item.flags.ignore_mandatory    = True
		item.flags.ignore_links        = True
		item.flags.ignore_doc_events   = True

		try:
			if is_new:
				item.insert(ignore_permissions=True)
			else:
				item.save(ignore_permissions=True)
		except Exception as exc:
			# Log but do not abort the CM Product save — the Item can be
			# resynchronised later by re-saving this CM Product.
			frappe.log_error(
				title=f"CM Product thin Item sync failed [{item_code}]",
				message=str(exc),
			)
