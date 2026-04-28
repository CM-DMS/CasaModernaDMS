from __future__ import annotations

from decimal import Decimal

import frappe
from frappe.utils import add_days, today

from casamoderna_dms.customer_ui import inspect_customer_fields
from casamoderna_dms.cm_tile_box_to_sqm import apply_tile_box_to_sqm


def run():
	"""Contract 14 smoke: tile box-to-sqm conversion + print-path update."""
	frappe.set_user("Administrator")
	created_docs: list[tuple[str, str]] = []

	def _cleanup_created_docs():
		for dt, name in reversed(created_docs):
			try:
				if frappe.db.exists(dt, name):
					frappe.delete_doc(dt, name, ignore_permissions=True, force=True)
			except Exception:
				pass

	try:
		print("== Contract 14: Item tile master fields exist ==")
		item_meta = frappe.get_meta("Item")
		assert item_meta.get_field("cm_pricing_rounding_mode"), "Missing Item.cm_pricing_rounding_mode"
		assert item_meta.get_field("cm_tiles_per_box"), "Missing Item.cm_tiles_per_box"
		assert item_meta.get_field("cm_sqm_per_box"), "Missing Item.cm_sqm_per_box"
		print("OK Item fields")

		print("== Contract 14: Sales row fields exist ==")
		for dt in ["Quotation Item", "Sales Order Item"]:
			meta = frappe.get_meta(dt)
			assert meta.get_field("cm_box_qty"), f"Missing {dt}.cm_box_qty"
			assert meta.get_field("cm_tile_sqm_qty"), f"Missing {dt}.cm_tile_sqm_qty"
			# Contract 15: UI clarity hint for tile qty entry
			hint = meta.get_field("cm_tile_qty_hint")
			assert hint, f"Missing {dt}.cm_tile_qty_hint"
			assert (
				"tile_decimal_pricing" in (getattr(hint, "depends_on", "") or "")
			), f"{dt}.cm_tile_qty_hint must depend on tile_decimal_pricing"
			opts = (getattr(hint, "options", "") or "")
			assert "enter quantity in BOXES" in opts, f"{dt}.cm_tile_qty_hint must mention quantity in BOXES"
			assert "Documents show SQM" in opts, f"{dt}.cm_tile_qty_hint must mention SQM"
		print("OK row fields")

		print("== Contract 14: Print formats reference sqm display field ==")
		for pf in ["CasaModerna Quotation", "CasaModerna Sales Order"]:
			assert frappe.db.exists("Print Format", pf), f"Missing Print Format: {pf}"
			pf_doc = frappe.get_doc("Print Format", pf)
			html = pf_doc.html or ""
			assert "cm_tile_sqm_qty" in html, f"{pf} does not reference cm_tile_sqm_qty"
			assert "tile_decimal_pricing" in html, f"{pf} does not reference tile_decimal_pricing"
			assert "row.qty" in html, f"{pf} does not have a non-tile qty fallback"
		print("OK print formats")

		company = _pick_one("Company")
		customer_group = _pick_one("Customer Group", filters={"is_group": 0})
		territory = _pick_one("Territory", filters={"is_group": 0})
		warehouse = _pick_one("Warehouse", filters={"is_group": 0})
		customer = _get_or_create_customer("CM Tile Box→sqm Smoke Customer", customer_group, territory)

		print("== Contract 14: Deterministic conversion (Quotation + Sales Order) ==")
		tile_item = _get_or_create_tile_item(
			"CM-TILE-BOX-SQM",
			rrp_ex_vat=Decimal("10"),
			tiles_per_box=10,
			sqm_per_box=Decimal("1.0"),
		)
		boxes = Decimal("3")
		expected_sqm = boxes * Decimal("1.0")

		qtn = frappe.get_doc(
			{
				"doctype": "Quotation",
				"quotation_to": "Customer",
				"party_name": customer,
				"company": company,
				"transaction_date": today(),
				"valid_till": add_days(today(), 7),
				"items": [{"item_code": tile_item, "qty": float(boxes)}],
			}
		)
		_finalize(qtn)
		created_docs.append(("Quotation", qtn.name))
		qtn.reload()
		row = qtn.items[0]
		print(
			"Quotation row:",
			{"qty": row.qty, "cm_box_qty": row.cm_box_qty, "cm_tile_sqm_qty": getattr(row, "cm_tile_sqm_qty", None)},
		)
		assert Decimal(str(row.qty)) == boxes
		assert Decimal(str(row.cm_box_qty)).quantize(Decimal("0.001")) == boxes.quantize(Decimal("0.001"))
		assert Decimal(str(row.cm_tile_sqm_qty)).quantize(Decimal("0.001")) == expected_sqm.quantize(Decimal("0.001"))
		qtn_html = frappe.get_print("Quotation", qtn.name, print_format="CasaModerna Quotation", as_pdf=False)
		assert "3.00 sqm" in (qtn_html or ""), "Quotation print should show sqm quantity (2dp) for tile lines"

		so = frappe.get_doc(
			{
				"doctype": "Sales Order",
				"customer": customer,
				"company": company,
				"transaction_date": today(),
				"delivery_date": add_days(today(), 7),
				"set_warehouse": warehouse,
				"items": [{"item_code": tile_item, "qty": float(boxes), "warehouse": warehouse}],
			}
		)
		_finalize(so)
		created_docs.append(("Sales Order", so.name))
		so.reload()
		row = so.items[0]
		print(
			"Sales Order row:",
			{"qty": row.qty, "cm_box_qty": row.cm_box_qty, "cm_tile_sqm_qty": getattr(row, "cm_tile_sqm_qty", None)},
		)
		assert Decimal(str(row.qty)) == boxes
		assert Decimal(str(row.cm_box_qty)).quantize(Decimal("0.001")) == boxes.quantize(Decimal("0.001"))
		assert Decimal(str(row.cm_tile_sqm_qty)).quantize(Decimal("0.001")) == expected_sqm.quantize(Decimal("0.001"))
		so_html = frappe.get_print("Sales Order", so.name, print_format="CasaModerna Sales Order", as_pdf=False)
		assert "3.00 sqm" in (so_html or ""), "Sales Order print should show sqm quantity (2dp) for tile lines"

		print("== Contract 14: Whole-box enforcement ==")
		qtn_bad = frappe.get_doc(
			{
				"doctype": "Quotation",
				"quotation_to": "Customer",
				"party_name": customer,
				"company": company,
				"transaction_date": today(),
				"valid_till": add_days(today(), 7),
				"items": [{"item_code": tile_item, "qty": 1.5}],
			}
		)
		threw = False
		try:
			# Call our hook directly to ensure tile-only enforcement works even if the
			# UOM itself allows fractional quantities.
			apply_tile_box_to_sqm(qtn_bad)
		except Exception as e:
			threw = True
			print("Expected error:", str(e)[:140])
		assert threw, "Expected whole-box enforcement to throw"

		print("== Contract 14: Missing sqm_per_box blocks save (qty>0) ==")
		tile_item_missing = _get_or_create_tile_item(
			"CM-TILE-BOX-SQM-MISSING",
			rrp_ex_vat=Decimal("10"),
			tiles_per_box=10,
			sqm_per_box=Decimal("0"),
		)
		# Force the invalid state explicitly to avoid any surprises from Item hooks/defaults.
		frappe.db.set_value(
			"Item",
			tile_item_missing,
			{
				"cm_pricing_rounding_mode": "tile_decimal_pricing",
				"cm_sqm_per_box": 0.0,
			},
		)
		frappe.db.commit()
		qtn_missing = frappe.get_doc(
			{
				"doctype": "Quotation",
				"quotation_to": "Customer",
				"party_name": customer,
				"company": company,
				"transaction_date": today(),
				"valid_till": add_days(today(), 7),
				"items": [{"item_code": tile_item_missing, "qty": 1}],
			}
		)
		threw = False
		try:
			apply_tile_box_to_sqm(qtn_missing)
		except Exception as e:
			threw = True
			print("Expected error:", str(e)[:140])
		assert threw, "Expected missing sqm_per_box enforcement to throw"

		print("== Contract 14: Non-tile items unaffected ==")
		non_tile = _get_or_create_non_tile_item("CM-NONTILE-BOX-SQM", rrp_ex_vat=Decimal("50"))
		qtn2 = frappe.get_doc(
			{
				"doctype": "Quotation",
				"quotation_to": "Customer",
				"party_name": customer,
				"company": company,
				"transaction_date": today(),
				"valid_till": add_days(today(), 7),
				"items": [{"item_code": non_tile, "qty": 2}],
			}
		)
		_finalize(qtn2)
		created_docs.append(("Quotation", qtn2.name))
		qtn2.reload()
		row = qtn2.items[0]
		assert not getattr(row, "cm_tile_sqm_qty", None), "Non-tile row should not have cm_tile_sqm_qty"
		non_tile_html = frappe.get_print("Quotation", qtn2.name, print_format="CasaModerna Quotation", as_pdf=False)
		assert " sqm" not in (non_tile_html or ""), "Non-tile print output must not show sqm quantity"
		print("OK non-tile")

		print("SMOKE OK — TILE BOX→SQM")
	finally:
		_cleanup_created_docs()


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
	assert name, f"No {doctype} found to run smoke checks"
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
	setattr(cust, canonical_phone, "+356 9999 1234")

	# Satisfy required fields deterministically.
	for df in meta.fields:
		if not getattr(df, "reqd", 0) or not df.fieldname:
			continue
		if df.fieldname in ("customer_name", canonical_phone):
			continue
		if getattr(cust, df.fieldname, None):
			continue

		if df.fieldtype == "Link" and df.options:
			value = _pick_one(df.options)
			setattr(cust, df.fieldname, value)
		elif df.fieldtype == "Select":
			options = [o.strip() for o in (df.options or "").split("\n") if o.strip()]
			assert options, f"No options for required Select {df.fieldname}"
			setattr(cust, df.fieldname, options[0])

	if meta.get_field("customer_group") and not getattr(cust, "customer_group", None):
		cust.customer_group = customer_group
	if meta.get_field("territory") and not getattr(cust, "territory", None):
		cust.territory = territory

	cust.insert(ignore_permissions=True)
	return cust.name


def _get_or_create_tile_item(item_code: str, rrp_ex_vat: Decimal, tiles_per_box: int, sqm_per_box: Decimal) -> str:
	if frappe.db.exists("Item", item_code):
		# Ensure fields are populated.
		frappe.db.set_value(
			"Item",
			item_code,
			{
				"cm_pricing_rounding_mode": "tile_decimal_pricing",
				"cm_rrp_ex_vat": float(rrp_ex_vat),
				"cm_tiles_per_box": int(tiles_per_box),
				"cm_sqm_per_box": float(sqm_per_box),
			},
		)
		return item_code

	item = frappe.get_doc(
		{
			"doctype": "Item",
			"item_code": item_code,
			"item_name": item_code,
			"item_group": _pick_one("Item Group", filters={"is_group": 0}),
			"stock_uom": _pick_one("UOM", filters={"name": "Unit"}) or "Unit",
			"is_stock_item": 0,
			"cm_pricing_rounding_mode": "tile_decimal_pricing",
			"cm_rrp_ex_vat": float(rrp_ex_vat),
			"cm_tiles_per_box": int(tiles_per_box),
			"cm_sqm_per_box": float(sqm_per_box),
		}
	).insert(ignore_permissions=True)
	return item.name


def _get_or_create_non_tile_item(item_code: str, rrp_ex_vat: Decimal) -> str:
	if frappe.db.exists("Item", item_code):
		frappe.db.set_value(
			"Item",
			item_code,
			{
				"cm_pricing_rounding_mode": "whole_euro_roundup",
				"cm_rrp_ex_vat": float(rrp_ex_vat),
				"cm_tiles_per_box": 0,
				"cm_sqm_per_box": 0,
			},
		)
		return item_code

	item = frappe.get_doc(
		{
			"doctype": "Item",
			"item_code": item_code,
			"item_name": item_code,
			"item_group": _pick_one("Item Group", filters={"is_group": 0}),
			"stock_uom": _pick_one("UOM", filters={"name": "Unit"}) or "Unit",
			"is_stock_item": 0,
			"cm_pricing_rounding_mode": "whole_euro_roundup",
			"cm_rrp_ex_vat": float(rrp_ex_vat),
		}
	).insert(ignore_permissions=True)
	return item.name
