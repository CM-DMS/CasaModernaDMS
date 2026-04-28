from __future__ import annotations

import frappe
from frappe.model.document import Document


class CMCustomLine(Document):
	"""Tracks every non-catalogue line on a sales document.

	Line types:
	- CONFIGURED: produced by a configurator (Night Collection, Sofa, etc.)
	  Has config_json and pricing_json snapshots.
	- FREETEXT: manually typed by a salesperson.
	  No config snapshot; description is the source of truth.

	Reference (name) is generated on first Save of the parent quotation, not on
	keystroke. This avoids orphaned CFG- refs from abandoned draft lines.

	The graduated_item field is populated when a custom line is later registered
	as a permanent stock SKU. The CFG- reference is retained permanently.
	"""

	def before_insert(self):
		# Ensure status defaulted
		if not self.status:
			self.status = "Draft"

	def validate(self):
		if self.line_type == "FREETEXT" and not (self.description or "").strip():
			frappe.throw("Description is required for FREETEXT custom lines.")

	def on_cancel(self):
		self.status = "Cancelled"
