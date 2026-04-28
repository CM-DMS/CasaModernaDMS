import frappe


def run():
	# 1) DocType exists
	assert frappe.db.exists("DocType", "CM Locality"), "Expected DocType: CM Locality"

	# 2) Address.cm_locality exists and options are correct
	addr_meta = frappe.get_meta("Address")
	cm_locality_df = addr_meta.get_field("cm_locality")
	assert cm_locality_df, "Expected Address.cm_locality field"
	assert (
		(cm_locality_df.options or "").strip() == "CM Locality"
	), f"Expected Address.cm_locality options == CM Locality, got: {cm_locality_df.options!r}"

	# 3) CM Locality seeded count (strict)
	from casamoderna_dms.cm_locality_seed import CM_LOCALITY_LIST, CM_LOCALITY_MAX_SORT_ORDER

	seeded_count = frappe.db.count(
		"CM Locality",
		filters=[["name", "in", CM_LOCALITY_LIST]],
	)
	assert (
		seeded_count == CM_LOCALITY_MAX_SORT_ORDER
	), f"Expected {CM_LOCALITY_MAX_SORT_ORDER} seeded CM Locality records, got: {seeded_count}"

	# 4) Boundary ordering checks
	rows = frappe.get_all(
		"CM Locality",
		filters=[["name", "in", CM_LOCALITY_LIST]],
		fields=["name", "locality_name", "sort_order"],
		order_by="sort_order asc",
		limit_page_length=1000,
	)
	assert (
		len(rows) == CM_LOCALITY_MAX_SORT_ORDER
	), f"Expected {CM_LOCALITY_MAX_SORT_ORDER} ordered rows, got: {len(rows)}"

	# Boundary checks by sort_order semantics
	by_order = {int(row["sort_order"] or 0): row["name"] for row in rows}
	assert by_order.get(1) == "Attard", f"Expected sort_order=1 Attard, got: {by_order.get(1)}"
	assert (
		by_order.get(CM_LOCALITY_LIST.index("Zurrieq") + 1) == "Zurrieq"
	), "Expected Zurrieq to be last Malta locality by sort_order"
	assert (
		by_order.get(CM_LOCALITY_LIST.index("Fontana - Gozo") + 1) == "Fontana - Gozo"
	), "Expected Fontana - Gozo to be first Gozo locality by sort_order"
	assert (
		by_order.get(CM_LOCALITY_MAX_SORT_ORDER) == "Zebbuġ - Gozo"
	), f"Expected last locality Zebbuġ - Gozo at sort_order={CM_LOCALITY_MAX_SORT_ORDER}, got: {by_order.get(CM_LOCALITY_MAX_SORT_ORDER)}"

	# 5) Query method returns ordered results by sort_order
	from casamoderna_dms.cm_locality_query import cm_locality_link_query

	res = cm_locality_link_query(
		doctype="CM Locality",
		txt="",
		searchfield="name",
		start=0,
		page_len=200,
		filters=None,
	)
	assert res, "Expected query results"
	assert res[0][0] == "Attard", f"Expected query first Attard, got: {res[0][0]}"
	assert (
		len(res) >= CM_LOCALITY_MAX_SORT_ORDER
	), "Expected query results to include at least the full master list"
	assert (
		res[CM_LOCALITY_MAX_SORT_ORDER - 1][0] == "Zebbuġ - Gozo"
	), f"Expected query master-list last Zebbuġ - Gozo, got: {res[CM_LOCALITY_MAX_SORT_ORDER - 1][0]}"

	query_names = [r[0] for r in res]
	assert (
		query_names[: CM_LOCALITY_MAX_SORT_ORDER] == CM_LOCALITY_LIST
	), "Expected Link query to start with the master list in exact sort_order sequence"

	print("SMOKE OK — CM LOCALITY LIST")


def debug():
	cs = frappe.get_doc("Client Script", "Address - CasaModerna Sales UX")
	print("CLIENT_SCRIPT_ENABLED", int(cs.enabled or 0))
	print("CLIENT_SCRIPT_HAS_SET_QUERY", "set_query('cm_locality'" in (cs.script or ""))
	print("CLIENT_SCRIPT_HAS_QUERY_PATH", "casamoderna_dms.cm_locality_query.cm_locality_link_query" in (cs.script or ""))

	dupes = frappe.db.sql(
		"""
		SELECT sort_order, GROUP_CONCAT(name ORDER BY name SEPARATOR ' | ') AS names, COUNT(*) AS cnt
		FROM `tabCM Locality`
		WHERE sort_order BETWEEN 1 AND 84
		GROUP BY sort_order
		HAVING COUNT(*) > 1
		ORDER BY sort_order ASC
		""",
		as_dict=True,
	)
	print("DUPES", len(dupes))
	for d in dupes[:30]:
		print(d["sort_order"], d["cnt"], d["names"])

	keys = ["Xgħajra", "Żabbar", "Zebbiegħ", "Zebbuġ (Malta)", "Zejtun", "Zurrieq", "Fontana - Gozo", "Zebbuġ - Gozo"]
	for k in keys:
		print(k, "=>", frappe.db.get_value("CM Locality", k, "sort_order"))
