"""
freetext_reviews_api.py — Purchasing Free Text Reviews API.

Returns CM-FREETEXT (and legacy FT-*) Sales Order item lines so the
purchasing manager can review what free-text products have been sold before
creating them as listed products and ordering from suppliers.
"""
from __future__ import annotations

import frappe


@frappe.whitelist()
def get_free_text_reviews(
	q: str = "",
	from_date: str = "",
	to_date: str = "",
	so_status: str = "",
	limit: int = 200,
) -> list[dict]:
	"""
	Return all free-text item lines from Sales Orders.

	Includes lines where item_code = 'CM-FREETEXT' or starts with 'FT-'
	(legacy codes created before the frontend was fixed).
	"""
	filters = ["(soi.item_code = 'CM-FREETEXT' OR soi.item_code LIKE 'FT-%%')"]
	values: dict = {}

	if so_status:
		filters.append("so.status = %(so_status)s")
		values["so_status"] = so_status

	if from_date:
		filters.append("so.transaction_date >= %(from_date)s")
		values["from_date"] = from_date

	if to_date:
		filters.append("so.transaction_date <= %(to_date)s")
		values["to_date"] = to_date

	if q:
		filters.append(
			"(so.name LIKE %(q)s OR so.customer_name LIKE %(q)s OR soi.item_name LIKE %(q)s)"
		)
		values["q"] = f"%{q}%"

	# Exclude cancelled SOs
	filters.append("so.docstatus != 2")

	where = " AND ".join(filters)

	rows = frappe.db.sql(
		f"""
		SELECT
			soi.name         AS row_name,
			soi.parent       AS so_name,
			so.customer      AS customer,
			so.customer_name AS customer_name,
			so.transaction_date,
			so.delivery_date,
			so.status        AS so_status,
			so.docstatus     AS so_docstatus,
			soi.item_code,
			soi.item_name,
			soi.description,
			soi.qty,
			soi.uom,
			soi.rate,
			soi.amount
		FROM `tabSales Order Item` soi
		JOIN `tabSales Order` so ON so.name = soi.parent
		WHERE {where}
		ORDER BY so.transaction_date DESC, so.name, soi.idx
		LIMIT %(limit)s
		""",
		{**values, "limit": int(limit)},
		as_dict=True,
	)

	return rows
