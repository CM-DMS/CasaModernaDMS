from __future__ import annotations

import re

import frappe

from casamoderna_dms.freetext_quote_placeholders import PLACEHOLDER_ITEM_CODES
from casamoderna_dms.smoke_checks_sales_pricing_cm import _get_or_create_customer as _get_or_create_customer_cm
from casamoderna_dms.smoke_checks_sales_pricing_cm import _pick_one

def _get_or_create_customer(customer_name: str) -> str:
	# Reuse the existing Contract 13 helper because Customer capture enforces a required phone field.
	customer_group = _pick_one("Customer Group")
	territory = _pick_one("Territory")
	return _get_or_create_customer_cm(customer_name, customer_group, territory)


def _get_cm_priced_item_code() -> str:
	# Contract 13 smoke already uses these; prefer them.
	for code in ["CM-PRICING-ITEM", "CM-PRICING-TILE"]:
		if frappe.db.exists("Item", code):
			return code
	# Fallback: any Item with cm_rrp_ex_vat set.
	row = frappe.db.sql(
		"""select name from `tabItem` where ifnull(cm_rrp_ex_vat, 0) > 0 and disabled = 0 limit 1""",
		as_dict=True,
	)
	if row:
		return row[0]["name"]
	raise frappe.ValidationError("Smoke check failed: no CM-priced Item found")


def _assert_placeholder_items_configured():
	print("== Free-text placeholders: Item presence/config ==")
	missing = []
	for code in sorted(PLACEHOLDER_ITEM_CODES):
		if not frappe.db.exists("Item", code):
			missing.append(code)
			continue
		it = frappe.get_doc("Item", code)
		if int(getattr(it, "is_stock_item", 0) or 0) != 0:
			frappe.throw(f"Smoke check failed: {code} must be non-stock (is_stock_item=0)")
		if int(getattr(it, "is_sales_item", 0) or 0) != 1:
			frappe.throw(f"Smoke check failed: {code} must be a sales item (is_sales_item=1)")
		if hasattr(it, "is_purchase_item") and int(getattr(it, "is_purchase_item", 0) or 0) != 0:
			frappe.throw(f"Smoke check failed: {code} must not be a purchase item (is_purchase_item=0)")
		# Ensure CM pricing doesn't apply.
		if hasattr(it, "cm_rrp_ex_vat") and (getattr(it, "cm_rrp_ex_vat", None) not in (None, 0, 0.0, "")):
			frappe.throw(f"Smoke check failed: {code} must not have cm_rrp_ex_vat set")
		print("OK Item:", code)
	if missing:
		frappe.throw(f"Smoke check failed: placeholder Items missing: {missing}")


def _strip_html(s: str) -> str:
	# Print HTML may include <br>; keep it simple/deterministic.
	return re.sub(r"<[^>]+>", "", s or "")


def run():
	"""Contract: free-text quoting via placeholder Items.

	Asserts:
	- Placeholder Items exist and are non-stock, sales enabled.
	- Quotation/Sales Order save succeeds with described placeholder lines.
	- Save fails if description missing for any placeholder line.
	- CM pricing integration does not mutate placeholder row rates or inject CM traceability.
	- Print render shows description and does not show placeholder item codes.
	"""
	frappe.set_user("Administrator")
	created_docs: list[tuple[str, str]] = []
	created_customer = False
	try:
		_assert_placeholder_items_configured()

		customer_name = _get_or_create_customer("CM Smoke Customer — Free Text")
		created_customer = False

		company = frappe.db.get_single_value("Global Defaults", "default_company")
		if not company:
			companies = frappe.get_all("Company", pluck="name", limit=1)
			company = (companies or [None])[0]
		if not company:
			raise frappe.ValidationError("Smoke check failed: no Company found")

		priced_item = _get_cm_priced_item_code()

		print("== Free-text placeholders: Quotation save + validate ==")
		qt = frappe.get_doc(
			{
				"doctype": "Quotation",
				"party_name": customer_name,
				"quotation_to": "Customer",
				"company": company,
				"items": [
					{"item_code": priced_item, "qty": 1},
					{"item_code": "CM-FREETEXT", "qty": 1, "rate": 123.45, "description": "Custom free text line"},
					{"item_code": "CM-DELIVERY", "qty": 1, "rate": 40.0, "description": "Delivery to site"},
					{"item_code": "CM-DELIVERY_GOZO", "qty": 1, "rate": 55.0, "description": "Delivery to Gozo"},
					{"item_code": "CM-LIFTER", "qty": 1, "rate": 80.0, "description": "Lifter service"},
					{"item_code": "CM-INSTALLATION", "qty": 1, "rate": 200.0, "description": "Installation works"},
				],
			}
		)
		qt.insert(ignore_permissions=True)
		created_docs.append(("Quotation", qt.name))

		# Ensure placeholder rates remain user-set and CM pricing trace is not injected.
		for row in qt.items:
			if row.item_code in PLACEHOLDER_ITEM_CODES:
				if float(row.rate or 0) == 0:
					frappe.throw(f"Smoke check failed: placeholder rate missing for {row.item_code}")
				# Note: cm_pricing_rounding_mode may have a doctype default; don't treat that as pricing applied.
				for f in [
					"cm_rrp_ex_vat",
					"cm_rrp_inc_vat",
					"cm_final_offer_ex_vat",
					"cm_final_offer_inc_vat",
					"cm_effective_discount_percent",
				]:
					if hasattr(row, f) and getattr(row, f, None) not in (None, 0, 0.0, ""):
						frappe.throw(f"Smoke check failed: placeholder row should not have {f} set ({row.item_code})")

		# Missing description should fail
		qt2 = frappe.get_doc("Quotation", qt.name)
		for row in qt2.items:
			if row.item_code == "CM-LIFTER":
				row.description = ""
				break
		try:
			qt2.save(ignore_permissions=True)
			frappe.throw("Smoke check failed: missing placeholder description should have blocked save")
		except frappe.ValidationError as e:
			if "Description is required for free-text service/charge lines." not in str(e):
				raise
			print("Expected error:", str(e))

		print("== Free-text placeholders: Sales Order save + validate ==")
		so = frappe.get_doc(
			{
				"doctype": "Sales Order",
				"customer": customer_name,
				"company": company,
				"delivery_date": frappe.utils.today(),
				"items": [
					{"item_code": priced_item, "qty": 1},
					{"item_code": "CM-FREETEXT", "qty": 1, "rate": 111.0, "description": "Custom free text line"},
					{"item_code": "CM-DELIVERY", "qty": 1, "rate": 41.0, "description": "Delivery to site"},
					{"item_code": "CM-DELIVERY_GOZO", "qty": 1, "rate": 56.0, "description": "Delivery to Gozo"},
					{"item_code": "CM-LIFTER", "qty": 1, "rate": 81.0, "description": "Lifter service"},
					{"item_code": "CM-INSTALLATION", "qty": 1, "rate": 201.0, "description": "Installation works"},
				],
			}
		)
		so.insert(ignore_permissions=True)
		created_docs.append(("Sales Order", so.name))

		for row in so.items:
			if row.item_code in PLACEHOLDER_ITEM_CODES:
				if float(row.rate or 0) == 0:
					frappe.throw(f"Smoke check failed: placeholder rate missing for {row.item_code}")
				for f in [
					"cm_rrp_ex_vat",
					"cm_rrp_inc_vat",
					"cm_final_offer_ex_vat",
					"cm_final_offer_inc_vat",
					"cm_effective_discount_percent",
				]:
					if hasattr(row, f) and getattr(row, f, None) not in (None, 0, 0.0, ""):
						frappe.throw(f"Smoke check failed: placeholder row should not have {f} set ({row.item_code})")

		so2 = frappe.get_doc("Sales Order", so.name)
		for row in so2.items:
			if row.item_code == "CM-DELIVERY":
				row.description = ""
				break
		try:
			so2.save(ignore_permissions=True)
			frappe.throw("Smoke check failed: missing placeholder description should have blocked save")
		except frappe.ValidationError as e:
			if "Description is required for free-text service/charge lines." not in str(e):
				raise
			print("Expected error:", str(e))

		print("== Free-text placeholders: Print render hides placeholder codes ==")
		qt_html = frappe.get_print("Quotation", qt.name, print_format="CasaModerna Quotation")
		so_html = frappe.get_print("Sales Order", so.name, print_format="CasaModerna Sales Order")

		for html in [qt_html, so_html]:
			text = _strip_html(html)
			if "Custom free text line" not in text:
				frappe.throw("Smoke check failed: free-text description missing in print output")
			for code in sorted(PLACEHOLDER_ITEM_CODES):
				if code in text:
					frappe.throw(f"Smoke check failed: placeholder code leaked into print output: {code}")

		print("SMOKE OK — FREE-TEXT PLACEHOLDERS")
	finally:
		frappe.set_user("Administrator")
		for dt, name in reversed(created_docs):
			try:
				if frappe.db.exists(dt, name):
					frappe.delete_doc(dt, name, ignore_permissions=True, force=True)
			except Exception:
				pass
