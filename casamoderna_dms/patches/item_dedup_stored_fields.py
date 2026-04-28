from __future__ import annotations

"""item_dedup_stored_fields — remove redundant stored columns from Item.

Changes applied
===============
Group 1 — Display name
  cm_display_name                  is_virtual=1  (derived: item_name + cm_given_name)

Group 2 — Full discount/increase waterfall (all virtual; each derived from previous)
  cm_supplier_list_price_ex_vat    is_virtual=1  (display alias of purchase price)
  cm_after_increase_before_ex_vat  is_virtual=1  (purchase × (1 + increase_before%))
  cm_after_discount_1_ex_vat       is_virtual=1  (previous × (1 − disc1%))
  cm_after_discount_2_ex_vat       is_virtual=1  (previous × (1 − disc2%))
  cm_after_discount_3_ex_vat       is_virtual=1  (previous × (1 − disc3%))
  cm_cost_ex_vat                   is_virtual=1  (previous × (1 + increase_after%))

Group 3 — Source of truth promotion
  cm_purchase_price_ex_vat         read_only=0  (promoted to editable primary input)

Stored computed outputs (not made virtual — persisted for reporting / queries):
  cm_landed_additions_total_ex_vat — shipping + handling + other
  cm_cost_ex_vat_calculated        — cm_cost_ex_vat + landed additions

Data migration
==============
1. Backfill cm_purchase_price_ex_vat from cm_supplier_list_price_ex_vat for any
   records where purchase_price is NULL (pre-engine records).
2. Fix data bugs: any item with cm_cost_ex_vat = 0 but cm_purchase_price_ex_vat > 0
   is a recording anomaly; purchase price is authoritative.
3. NULL out all now-virtual columns so their DB cells are clean.  Frappe drops the
   MariaDB column on the next ``bench migrate`` once the Custom Field record carries
   is_virtual=1.

Also re-runs the ux_integration_item_link_search_and_title patch so that the live
search_fields property setter is updated to exclude cm_display_name.
"""

import frappe


_VIRTUAL_FIELDS = [
	"cm_display_name",
	"cm_supplier_list_price_ex_vat",
	"cm_after_increase_before_ex_vat",
	"cm_after_discount_1_ex_vat",
	"cm_after_discount_2_ex_vat",
	"cm_after_discount_3_ex_vat",
	"cm_cost_ex_vat",
]


def _set_custom_field(fieldname: str, **props) -> None:
	"""Update a Custom Field record on the Item doctype."""
	name = f"Item-{fieldname}"
	if not frappe.db.exists("Custom Field", name):
		frappe.msgprint(
			f"[item_dedup] Custom Field {name!r} not found — skipping.",
			indicator="orange",
			alert=True,
		)
		return
	cf = frappe.get_doc("Custom Field", name)
	changed = False
	for k, v in props.items():
		if getattr(cf, k, None) != v:
			setattr(cf, k, v)
			changed = True
	if changed:
		cf.save(ignore_permissions=True)


def execute():
	frappe.set_user("Administrator")

	# ------------------------------------------------------------------
	# 1. Mark virtual fields
	# ------------------------------------------------------------------
	for fn in _VIRTUAL_FIELDS:
		_set_custom_field(fn, is_virtual=1, read_only=1)

	# cm_purchase_price_ex_vat: promote from read-only computed output to
	# editable primary input (single source of truth for the ladder).
	_set_custom_field("cm_purchase_price_ex_vat", read_only=0, is_virtual=0)

	frappe.db.commit()
	frappe.clear_cache(doctype="Item")

	# ------------------------------------------------------------------
	# 2. Data backfill — purchase price
	# ------------------------------------------------------------------
	# Records created before cm_purchase_price_ex_vat existed may have NULL;
	# copy from list_price (which was the former primary input field).
	frappe.db.sql(
		"""
		UPDATE `tabItem`
		SET    cm_purchase_price_ex_vat = cm_supplier_list_price_ex_vat
		WHERE  (cm_purchase_price_ex_vat IS NULL OR cm_purchase_price_ex_vat = 0)
		  AND  cm_supplier_list_price_ex_vat IS NOT NULL
		  AND  cm_supplier_list_price_ex_vat > 0
		"""
	)

	# ------------------------------------------------------------------
	# 3. Fix data anomaly: cm_cost_ex_vat = 0 when purchase_price > 0
	# ------------------------------------------------------------------
	# In the pre-virtual schema cm_cost_ex_vat was written by the pricing engine
	# and should always equal cm_purchase_price_ex_vat (when all discounts/increases
	# are 0).  A zero value with a non-zero purchase price is a recording bug.
	# After migration cm_cost_ex_vat becomes virtual so this is cosmetic, but
	# correcting it ensures the NULL-out step below doesn't mask a real input.
	frappe.db.sql(
		"""
		UPDATE `tabItem`
		SET    cm_cost_ex_vat = cm_purchase_price_ex_vat
		WHERE  (cm_cost_ex_vat IS NULL OR cm_cost_ex_vat = 0)
		  AND  cm_purchase_price_ex_vat IS NOT NULL
		  AND  cm_purchase_price_ex_vat > 0
		"""
	)

	frappe.db.commit()

	# ------------------------------------------------------------------
	# 4. Null out all virtual-field columns (values are derived on every
	#    validate/onload going forward; DB cells no longer needed).
	#    Frappe drops the MariaDB column on next bench migrate once the
	#    Custom Field record carries is_virtual=1.
	#
	#    Note: Frappe creates decimal custom-field columns as NOT NULL
	#    with a default of 0.  ALTER TABLE … MODIFY is required before
	#    we can UPDATE to NULL.
	# ------------------------------------------------------------------
	existing_cols = {
		row[0]
		for row in frappe.db.sql("SHOW COLUMNS FROM `tabItem`")
	}

	# varchar columns can already be NULL; decimal columns need relaxing first.
	decimal_to_null = [
		"cm_supplier_list_price_ex_vat",
		"cm_after_increase_before_ex_vat",
		"cm_after_discount_1_ex_vat",
		"cm_after_discount_2_ex_vat",
		"cm_after_discount_3_ex_vat",
		"cm_cost_ex_vat",
	]
	varchar_to_null = [
		"cm_display_name",
	]

	for col in decimal_to_null:
		if col in existing_cols:
			frappe.db.sql(  # noqa: S608
				f"ALTER TABLE `tabItem` MODIFY `{col}` decimal(21,9) DEFAULT NULL"
			)
	frappe.db.commit()

	for col in decimal_to_null + varchar_to_null:
		if col in existing_cols:
			frappe.db.sql(f"UPDATE `tabItem` SET `{col}` = NULL")  # noqa: S608

	frappe.db.commit()

	# ------------------------------------------------------------------
	# 5. Re-run the UX search_fields patch to remove cm_display_name from
	#    the SQL search_fields property setter (virtual fields can't be
	#    searched via SQL WHERE … LIKE).
	# ------------------------------------------------------------------
	try:
		from casamoderna_dms.patches.ux_integration_item_link_search_and_title import execute as _ux_execute
		_ux_execute()
	except Exception as exc:
		frappe.msgprint(
			f"[item_dedup] Could not re-run ux_integration patch: {exc}",
			indicator="orange",
			alert=True,
		)

	frappe.clear_cache(doctype="Item")
