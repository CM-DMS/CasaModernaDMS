from __future__ import annotations

import frappe
from frappe.model.document import Document


class CMConfiguratorPricing(Document):
	"""Holds the full pricing matrix for one configurator type + price list.

	Tiers: named thresholds (e.g. 'Standard' at €0, '3-Piece Set' at €8000).
	The system picks the highest tier whose min_order_value_inc_vat is <=
	the sum of all configured lines of this type on the quotation.

	Matrix rows: one row per (tier_name + dimension combination). Use
	role_name='OUTPUT' for the price that appears on the sales document.
	"""

	def autoname(self):
		"""Generate name as CFGP-{TYPE4}-{####}.

		Frappe's format: autoname regex doesn't handle the :.N truncation syntax,
		so we do the truncation here instead.
		"""
		import re
		from frappe.model.naming import make_autoname
		type_slug = re.sub(r"[^A-Z0-9]", "", (self.configurator_type or "").upper())[:4] or "CFGP"
		self.name = make_autoname(f"CFGP-{type_slug}-.####", doc=self)

	def validate(self):
		self._validate_base_tier_exists()
		self._validate_tier_names_consistent()

	def _validate_base_tier_exists(self):
		if not self.tiers:
			frappe.throw("At least one tier is required (base tier with min_order_value = 0).")
		has_base = any(
			float(t.min_order_value_inc_vat or 0) == 0
			for t in self.tiers
		)
		if not has_base:
			frappe.throw(
				"A base tier with Min Order Value = 0 is required so every quotation "
				"has a valid fallback tier."
			)

	def _validate_tier_names_consistent(self):
		"""Every matrix row's tier_name must match a tier in the tiers table."""
		defined_tiers = {t.tier_name for t in (self.tiers or [])}
		for row in (self.matrix_rows or []):
			if row.tier_name and row.tier_name not in defined_tiers:
				frappe.throw(
					f"Matrix row {row.idx}: tier '{row.tier_name}' is not defined in the "
					f"Tiers table. Defined tiers: {sorted(defined_tiers)}"
				)
