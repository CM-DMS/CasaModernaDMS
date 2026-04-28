from __future__ import annotations

from decimal import Decimal

import frappe
from frappe.utils import add_days, today

from casamoderna_dms.contract9_products_pricing import compute_pricing
from casamoderna_dms.customer_ui import inspect_customer_fields


def run():
	"""Contract 13 smoke checks: CM Item pricing flows into Quotation/Sales Order rows."""
	frappe.set_user("Administrator")

	print("== Contract 13: Sales row CM pricing fields exist ==")
	for dt in ["Quotation Item", "Sales Order Item"]:
		meta = frappe.get_meta(dt)
		for fn in [
			"cm_rrp_ex_vat",
			"cm_rrp_inc_vat",
			"cm_final_offer_inc_vat",
			"cm_final_offer_ex_vat",
			"cm_effective_discount_percent",
			"cm_pricing_rounding_mode",
		]:
			df = meta.get_field(fn)
			assert df, f"Smoke check failed: {dt} missing field: {fn}"
			if fn.startswith("cm_") and fn not in {"cm_effective_discount_percent"}:
				# All traceability fields are expected read-only.
				assert int(getattr(df, "read_only", 0) or 0), f"Smoke check failed: {dt}.{fn} must be read-only"

		# Effective discount field should be read-only too
		df = meta.get_field("cm_effective_discount_percent")
		assert int(
			getattr(df, "read_only", 0) or 0
		), f"Smoke check failed: {dt}.cm_effective_discount_percent must be read-only"
	print("Row fields present")

	print("== Contract 13: Print formats reference effective discount ==")
	for pf in ["CasaModerna Quotation", "CasaModerna Sales Order"]:
		assert frappe.db.exists("Print Format", pf), f"Smoke check failed: missing Print Format: {pf}"
		pf_doc = frappe.get_doc("Print Format", pf)
		html = pf_doc.html or ""
		assert (
			"cm_effective_discount_percent" in html
		), f"Smoke check failed: Print Format {pf} does not reference cm_effective_discount_percent"
	print("Print formats OK")

	company = _pick_one("Company")
	customer_group = _pick_one("Customer Group", filters={"is_group": 0})
	territory = _pick_one("Territory", filters={"is_group": 0})
	warehouse = _pick_one("Warehouse", filters={"is_group": 0})
	customer = _get_or_create_customer("CM Pricing Smoke Customer", customer_group, territory)
	frappe.db.commit()

	vat = _get_company_vat(company)
	assert vat is not None, "Smoke check failed: Company.cm_vat_rate_percent missing"

	# Non-tile case
	item_code = _get_or_create_cm_pricing_item(
		"CM-PRICING-ITEM",
		rrp_ex_vat=Decimal("100"),
		discount_target=Decimal("10"),
		rounding_mode="whole_euro_roundup",
	)
	frappe.db.commit()
	print(
		"Item CM-PRICING-ITEM:",
		frappe.db.get_value(
			"Item",
			item_code,
			["cm_rrp_ex_vat", "cm_discount_target_percent", "cm_pricing_rounding_mode"],
		),
	)
	res = compute_pricing(
		rrp_ex_vat=Decimal("100"),
		discount_percent=Decimal("10"),
		vat_rate_percent=vat,
		rounding_mode="whole_euro_roundup",
	)
	_expected_rate = res["final_offer_ex_vat"]
	_expected_eff = res["effective_discount_percent"]
	_expected_inc = res["final_offer_inc_vat"]

	qtn = frappe.get_doc(
		{
			"doctype": "Quotation",
			"quotation_to": "Customer",
			"party_name": customer,
			"company": company,
			"transaction_date": today(),
			"valid_till": add_days(today(), 7),
			"items": [
				{
					"item_code": item_code,
					"qty": 1,
				}
			],
		}
	)
	_finalize(qtn)
	qtn.reload()
	row = qtn.items[0]
	print(
		"Quotation row:",
		{
			"item_code": row.item_code,
			"discount_percentage": row.discount_percentage,
			"rate": row.rate,
			"cm_rrp_ex_vat": getattr(row, "cm_rrp_ex_vat", None),
			"cm_final_offer_ex_vat": getattr(row, "cm_final_offer_ex_vat", None),
			"cm_final_offer_inc_vat": getattr(row, "cm_final_offer_inc_vat", None),
			"cm_effective_discount_percent": getattr(row, "cm_effective_discount_percent", None),
		},
	)
	assert Decimal(str(row.rate)).quantize(Decimal("0.01")) == _expected_rate
	assert Decimal(str(row.cm_final_offer_inc_vat)).quantize(Decimal("0.01")) == _expected_inc
	assert Decimal(str(row.cm_effective_discount_percent)).quantize(Decimal("0.001")) == _expected_eff

	so = frappe.get_doc(
		{
			"doctype": "Sales Order",
			"customer": customer,
			"company": company,
			"transaction_date": today(),
			"delivery_date": add_days(today(), 7),
			"set_warehouse": warehouse,
			"items": [
				{
					"item_code": item_code,
					"qty": 1,
					"warehouse": warehouse,
				}
			],
		}
	)
	_finalize(so)
	so.reload()
	row = so.items[0]
	print(
		"Sales Order row:",
		{
			"item_code": row.item_code,
			"discount_percentage": row.discount_percentage,
			"rate": row.rate,
			"cm_rrp_ex_vat": getattr(row, "cm_rrp_ex_vat", None),
			"cm_final_offer_ex_vat": getattr(row, "cm_final_offer_ex_vat", None),
			"cm_final_offer_inc_vat": getattr(row, "cm_final_offer_inc_vat", None),
			"cm_effective_discount_percent": getattr(row, "cm_effective_discount_percent", None),
		},
	)
	assert Decimal(str(row.rate)).quantize(Decimal("0.01")) == _expected_rate
	assert Decimal(str(row.cm_final_offer_inc_vat)).quantize(Decimal("0.01")) == _expected_inc
	assert Decimal(str(row.cm_effective_discount_percent)).quantize(Decimal("0.001")) == _expected_eff

	# Tile exception (if tested)
	tile_code = _get_or_create_cm_pricing_item(
		"CM-PRICING-TILE",
		rrp_ex_vat=Decimal("10"),
		discount_target=Decimal("12.5"),
		rounding_mode="tile_decimal_pricing",
	)
	_ensure_tile_item_has_box_to_sqm(tile_code)
	frappe.db.commit()
	print(
		"Item CM-PRICING-TILE:",
		frappe.db.get_value(
			"Item",
			tile_code,
			[
				"cm_rrp_ex_vat",
				"cm_discount_target_percent",
				"cm_pricing_rounding_mode",
				"cm_sqm_per_box",
			],
		),
	)
	res = compute_pricing(
		rrp_ex_vat=Decimal("10"),
		discount_percent=Decimal("12.5"),
		vat_rate_percent=vat,
		rounding_mode="tile_decimal_pricing",
	)
	_expected_rate = res["final_offer_ex_vat"]
	_expected_eff = res["effective_discount_percent"]
	_expected_inc = res["final_offer_inc_vat"]

	qtn2 = frappe.get_doc(
		{
			"doctype": "Quotation",
			"quotation_to": "Customer",
			"party_name": customer,
			"company": company,
			"transaction_date": today(),
			"valid_till": add_days(today(), 7),
			"items": [
				{
					"item_code": tile_code,
					"qty": 1,
				}
			],
		}
	)
	_finalize(qtn2)
	qtn2.reload()
	row = qtn2.items[0]
	print(
		"Tile Quotation row:",
		{
			"item_code": row.item_code,
			"discount_percentage": row.discount_percentage,
			"rate": row.rate,
			"cm_rrp_ex_vat": getattr(row, "cm_rrp_ex_vat", None),
			"cm_final_offer_ex_vat": getattr(row, "cm_final_offer_ex_vat", None),
			"cm_final_offer_inc_vat": getattr(row, "cm_final_offer_inc_vat", None),
			"cm_effective_discount_percent": getattr(row, "cm_effective_discount_percent", None),
		},
	)
	assert Decimal(str(row.rate)).quantize(Decimal("0.01")) == _expected_rate
	assert Decimal(str(row.cm_final_offer_inc_vat)).quantize(Decimal("0.01")) == _expected_inc
	assert Decimal(str(row.cm_effective_discount_percent)).quantize(Decimal("0.001")) == _expected_eff

	print("OK: Contract 13 sales pricing smoke passed")


def _ensure_tile_item_has_box_to_sqm(item_code: str) -> None:
	"""Contract 14 compatibility: tile rows now require cm_sqm_per_box > 0."""
	if not frappe.db.exists("Item", item_code):
		return
	val = frappe.db.get_value("Item", item_code, "cm_sqm_per_box")
	try:
		val_f = float(val or 0)
	except Exception:
		val_f = 0
	if val_f <= 0:
		frappe.db.set_value("Item", item_code, "cm_sqm_per_box", 1.0)


def _finalize(doc):
	if hasattr(doc, "set_missing_values"):
		doc.set_missing_values()
	if hasattr(doc, "calculate_taxes_and_totals"):
		doc.calculate_taxes_and_totals()
	if doc.is_new():
		doc.insert(ignore_permissions=True)
	else:
		doc.save(ignore_permissions=True)


def _pick_one(doctype: str, filters: dict | None = None) -> str:
	name = frappe.get_all(doctype, filters=filters or {}, pluck="name", limit=1)
	if not name:
		frappe.throw(f"No {doctype} found to run smoke checks")
	return name[0]


def _get_or_create_customer(customer_name: str, customer_group: str, territory: str) -> str:
	existing = frappe.get_all("Customer", filters={"customer_name": customer_name}, pluck="name", limit=1)
	if existing:
		return existing[0]

	meta = frappe.get_meta("Customer")
	info = inspect_customer_fields() or {}
	canonical_phone = info.get("canonical_phone_fieldname")
	assert canonical_phone, "No canonical phone field found (expected one of: cm_mobile, mobile_no)"
	assert meta.get_field(canonical_phone), f"Canonical phone field missing on meta: {canonical_phone}"

	cust = frappe.new_doc("Customer")
	cust.customer_name = customer_name
	setattr(cust, canonical_phone, "+356 9999 9999")

	# Satisfy any required standard link/select fields deterministically.
	for df in meta.fields:
		if not getattr(df, "reqd", 0) or not df.fieldname:
			continue
		if df.fieldname in ("customer_name", canonical_phone):
			continue
		if getattr(cust, df.fieldname, None):
			continue

		if df.fieldtype == "Link" and df.options:
			value = _pick_one(df.options)
			assert value, f"No records found for required Link {df.fieldname} -> {df.options}"
			setattr(cust, df.fieldname, value)
		elif df.fieldtype == "Select":
			options = [o.strip() for o in (df.options or "").split("\n") if o.strip()]
			assert options, f"No options for required Select {df.fieldname}"
			setattr(cust, df.fieldname, options[0])

	# Prefer provided values if the doctype uses them.
	if meta.get_field("customer_group") and not getattr(cust, "customer_group", None):
		cust.customer_group = customer_group
	if meta.get_field("territory") and not getattr(cust, "territory", None):
		cust.territory = territory

	cust.insert(ignore_permissions=True)
	return cust.name


def _get_company_vat(company: str) -> Decimal | None:
	vat = frappe.db.get_value("Company", company, "cm_vat_rate_percent")
	if vat is None:
		return None
	return Decimal(str(vat))


def _get_or_create_cm_pricing_item(item_code: str, rrp_ex_vat: Decimal, discount_target: Decimal, rounding_mode: str) -> str:
	if frappe.db.exists("Item", item_code):
		return item_code

	item = frappe.get_doc(
		{
			"doctype": "Item",
			"item_code": item_code,
			"item_name": item_code,
			"item_group": _pick_one("Item Group", filters={"is_group": 0}),
			"stock_uom": _pick_one("UOM"),
			"is_stock_item": 0,
			"cm_rrp_ex_vat": float(rrp_ex_vat),
			"cm_discount_target_percent": float(discount_target),
			"cm_pricing_rounding_mode": rounding_mode,
		}
	).insert(ignore_permissions=True)
	return item.name
