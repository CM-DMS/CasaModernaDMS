import frappe


@frappe.whitelist()
def cm_locality_link_query(doctype, txt, searchfield, start, page_len, filters):
	"""Custom Link query for Address.cm_locality.

	Orders by CM Locality.sort_order ASC to ensure Malta block first, then Gozo.
	Any extra records (non-seeded) are pushed to a high sort_order by the seed hook,
	so they appear after the master list.
	"""
	txt = (txt or "").strip()
	like_txt = f"%{txt}%"

	return frappe.db.sql(
		"""
		SELECT name
		FROM `tabCM Locality`
		WHERE (
			name LIKE %(txt)s
			OR locality_name LIKE %(txt)s
		  )
		ORDER BY IFNULL(sort_order, 999999) ASC, name ASC
		LIMIT %(start)s, %(page_len)s
		""",
		{
			"txt": like_txt,
			"start": start,
			"page_len": page_len,
		},
	)
