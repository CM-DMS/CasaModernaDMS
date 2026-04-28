"""
item_child_dedup.py — before_validate hook for Item.

Removes duplicate rows from child tables that ERPNext validates for uniqueness,
so that desk saves, patches, or API saves can never corrupt data in a way that
blocks future saves.

Tables deduped:
  uoms           — unique key: uom
  item_defaults  — unique key: company
"""


def dedup_item_child_tables(doc, method=None):
	# Deduplicate UOM Conversion Detail rows — keep first occurrence per uom
	seen_uoms = set()
	clean_uoms = []
	for row in doc.get("uoms") or []:
		if row.uom not in seen_uoms:
			seen_uoms.add(row.uom)
			clean_uoms.append(row)
	doc.uoms = clean_uoms

	# Deduplicate Item Default rows — keep first occurrence per company
	seen_companies = set()
	clean_defaults = []
	for row in doc.get("item_defaults") or []:
		if row.company not in seen_companies:
			seen_companies.add(row.company)
			clean_defaults.append(row)
	doc.item_defaults = clean_defaults
