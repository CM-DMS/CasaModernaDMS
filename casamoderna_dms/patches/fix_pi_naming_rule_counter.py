"""fix_pi_naming_rule_counter.py

The PI Document Naming Rule counter was reset to 0 while PI 000001 already
existed in the database.  On the next Proforma Quotation creation Frappe would
generate "PI 000001" again → DuplicateEntryError → HTTP 409.

Fix: set all QT and PI Document Naming Rule counters to at least the highest
existing document number so the next generated name is always unique.
"""

import frappe


def execute():
	for prefix, pattern in [("QT ", "QT %"), ("PI ", "PI %")]:
		# Find the highest existing number for this prefix.
		rows = frappe.db.sql(
			"SELECT name FROM `tabQuotation` WHERE name LIKE %s",
			(pattern,),
		)
		if not rows:
			continue

		digits = []
		for (name,) in rows:
			# Extract the numeric suffix after the prefix.
			suffix = name[len(prefix):].strip().lstrip("0") or "0"
			try:
				digits.append(int(suffix))
			except ValueError:
				pass

		if not digits:
			continue

		max_n = max(digits)

		frappe.db.sql(
			"UPDATE `tabDocument Naming Rule`"
			"  SET counter = GREATEST(counter, %s)"
			" WHERE document_type = 'Quotation' AND prefix = %s",
			(max_n, prefix),
		)
		# Also sync tabSeries (used as fallback by older Frappe code paths).
		frappe.db.sql(
			"UPDATE `tabSeries` SET current = GREATEST(current, %s)"
			" WHERE name = %s",
			(max_n, prefix),
		)
