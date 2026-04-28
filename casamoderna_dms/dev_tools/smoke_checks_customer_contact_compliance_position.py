import frappe


def run(site: str | None = None):
	if site:
		frappe.init(site=site)
		frappe.connect()

	try:
		frappe.clear_cache(doctype="Customer")
		meta = frappe.get_meta("Customer")

		fieldnames = [df.fieldname for df in meta.fields if getattr(df, "fieldname", None)]
		pos = {f: i for i, f in enumerate(fieldnames)}

		required = ["cm_mobile", "cm_email", "cm_id_card_no", "cm_vat_no"]
		missing = [f for f in required if f not in pos]
		assert not missing, f"Missing fields: {missing}"

		assert "column_break0" in pos, "Expected standard Customer.column_break0 to exist"
		assert "territory" in pos, "Expected standard Customer.territory to exist"

		cb = pos["column_break0"]
		territory = pos["territory"]
		assert cb < territory, f"Expected column_break0 before territory; got {cb} >= {territory}"

		positions = [(f, pos[f]) for f in required]
		assert all(cb < p < territory for _, p in positions), (
			"Expected Contact & Compliance fields in right column between column_break0 and territory; "
			f"got: {positions}"
		)

		order_positions = [pos[f] for f in required]
		assert order_positions == sorted(order_positions), f"Expected order {required}; got: {positions}"

		print("== Customer Contact & Compliance Position ==")
		print("Right column anchor: column_break0")
		print("Fields positioned between column_break0 and territory: YES")
		print("Order: cm_mobile, cm_email, cm_id_card_no, cm_vat_no")
		print("SMOKE OK — CUSTOMER CONTACT COMPLIANCE POSITION")
	finally:
		pass
