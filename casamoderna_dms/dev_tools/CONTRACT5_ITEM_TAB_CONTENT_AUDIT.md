# Contract 5 — Item Tab Content Audit (Evidence)

Date: 2026-03-03

Scope: This audit is read-only and reflects **current ERPNext Item meta** in this environment after Contracts 1–4 (6-tab restriction + structural grouping fields).

Method:
- Meta source: `frappe.get_meta("Item")`
- Visibility: fields included only if `hidden = 0` in meta
- Notes: Some fields are conditionally shown via `depends_on`; those conditions are listed when present.

Approved tabs audited:
- General (tab fieldname: `details`)
- Suppliers & Pricing (tab fieldname: `purchasing_tab`)
- Composition (tab fieldname: `manufacturing`)
- Stock (tab fieldname: `inventory_section`)
- Transactions (tab fieldname: `dashboard_tab`)
- Specs (tab fieldname: `variants_section`)

---

## General

Structural CM fields present:
- `cm_general_identity_section` (Section Break: **Identity**)

Visible standard fields/sections under this tab:
- `item_code` (reqd)
- `item_name`
- `item_group` (reqd)
- `stock_uom` (reqd)
- `disabled`
- `allow_alternative_item`
- `is_stock_item` (depends_on: `eval:!doc.is_fixed_asset`)
- `has_variants` (depends_on: `eval:!doc.variant_of`)
- `opening_stock` (depends_on: `eval:(doc.__islocal&&doc.is_stock_item && !doc.has_serial_no && !doc.has_batch_no)`)
- `valuation_rate` (depends_on: `is_stock_item`)
- `standard_rate` (depends_on: `eval:doc.__islocal`)
- `is_fixed_asset`
- `auto_create_assets` (depends_on: `is_fixed_asset`)
- `is_grouped_asset` (depends_on: `auto_create_assets`)
- `asset_category` (depends_on: `is_fixed_asset`)
- `asset_naming_series` (depends_on: `is_fixed_asset`)
- `over_delivery_receipt_allowance` (depends_on: `eval:!doc.__islocal && !doc.is_fixed_asset`)
- `over_billing_allowance` (depends_on: `eval:!doc.__islocal && !doc.is_fixed_asset`)
- Section Break: **Description** (`section_break_11`)
- `description`
- `brand`
- Section Break: **Units of Measure** (`unit_of_measure_conversion`)
- `uoms` (Table)

Assessment:
- **Too cluttered** (many asset + allowance fields live here; several are conditional, but the tab still contains a lot of unrelated controls for typical product work).

Low-risk recommendations for Contract 6 (do not implement in Contract 5):
- Consider relocating/de-emphasizing Fixed Asset–specific controls away from the primary “Identity” flow, *without* changing the 6-tab constraint.

---

## Suppliers & Pricing

Structural CM fields present:
- `cm_suppliers_pricing_section` (Section Break: **Suppliers & Buying Context**)

Visible standard fields/sections under this tab:
- `purchase_uom`
- `min_order_qty` (depends_on: `is_stock_item`)
- `safety_stock`
- `is_purchase_item`
- `lead_time_days`
- `last_purchase_rate`
- `is_customer_provided_item`
- `customer` (depends_on: `eval:doc.is_customer_provided_item==1`)
- Section Break: **Supplier Details** (`supplier_details`) (depends_on: `eval:!doc.is_fixed_asset`)
- `delivered_by_supplier`
- `supplier_items` (Table)
- Section Break: **Foreign Trade Details** (`foreign_trade_details`)
- `country_of_origin`
- `customs_tariff_number`

Assessment:
- **Usable** (main buying + supplier table is present; not overly cluttered).

Low-risk recommendations for Contract 6:
- If the business expects selling price context here, consider a safe, non-destructive approach to surface price-related standard fields (if any exist under currently hidden tabs) into one of the allowed tabs.

---

## Composition

Structural CM fields present:
- `cm_composition_overview_section` (Section Break: **Composition Overview**)
- `cm_composition_note` (HTML)

Visible standard fields/sections under this tab:
- `include_item_in_manufacturing` (depends_on: `eval:!doc.is_fixed_asset`)
- `is_sub_contracted_item`
- `default_bom`
- `default_item_manufacturer`
- `default_manufacturer_part_no`

Assessment:
- **Sparse but acceptable** (few fields; fine if manufacturing/BOM is only occasionally used).

Low-risk recommendations for Contract 6:
- If “Composition” is intended for materials/fabrics/etc, identify which standard ERPNext fields (if any) should be surfaced here without inventing new business fields.

---

## Stock

Structural CM fields present:
- `cm_stock_controls_section` (Section Break: **Stock Controls**)

Visible standard fields/sections under this tab:
- Section Break: **Inventory Settings** (`inventory_settings_section`)
- `shelf_life_in_days`
- `end_of_life` (depends_on: `is_stock_item`)
- `default_material_request_type`
- `valuation_method` (depends_on: `is_stock_item`)
- `warranty_period` (depends_on: `eval:doc.is_stock_item`)
- `weight_per_unit` (depends_on: `is_stock_item`)
- `weight_uom` (depends_on: `eval:doc.is_stock_item`)
- `allow_negative_stock`
- Section Break: **Barcodes** (`sb_barcodes`)
- `barcodes` (Table)
- Section Break: **Auto re-order** (`reorder_section`) (depends_on: `is_stock_item`)
- `reorder_levels` (Table)
- Section Break: **Serial Nos and Batches** (`serial_nos_and_batches`) (depends_on: `eval:doc.is_stock_item`)
- `has_batch_no` (depends_on: `eval:doc.is_stock_item`)
- `create_new_batch` (depends_on: `has_batch_no`)
- `batch_number_series` (depends_on: `eval:doc.has_batch_no==1 && doc.create_new_batch==1`)
- `has_expiry_date` (depends_on: `has_batch_no`)
- `retain_sample` (depends_on: `has_batch_no`)
- `sample_quantity` (depends_on: `eval: (doc.retain_sample && doc.has_batch_no)`)
- `has_serial_no` (depends_on: `eval:doc.is_stock_item`)
- `serial_no_series` (depends_on: `has_serial_no`)

Assessment:
- **Usable** (stock controls are present and mostly conditional to stock items).

Low-risk recommendations for Contract 6:
- None urgent; this tab is already aligned with core ERPNext stock controls.

---

## Transactions

Structural CM fields present:
- `cm_transactions_overview_section` (Section Break: **Activity**)

Visible standard fields/sections under this tab:
- (none)

Assessment:
- **Too empty** (this tab currently provides no standard fields; it’s effectively a placeholder under the enforced 6-tab model).

Low-risk recommendations for Contract 6:
- Decide what “Transactions” should mean in CM: likely Sales/Purchase history, pricing context, or a limited set of standard tables. Any move would need to remain non-destructive and avoid JS overrides.

---

## Specs

Structural CM fields present:
- `cm_specs_overview_section` (Section Break: **Specifications**)
- `cm_specs_note` (HTML)

Visible standard fields/sections under this tab:
- `variant_of` (depends_on: `variant_of`)
- `variant_based_on` (depends_on: `has_variants`)

Assessment:
- **Sparse but acceptable** (only variant controls visible).

Low-risk recommendations for Contract 6:
- Confirm whether “Specs” is intended to hold Item Attributes / variant matrix context; if so, identify which standard ERPNext variant/attribute sections are currently hidden by the tab-hiding strategy and whether they can be safely surfaced.

---

## Consistency

The audit output was generated and compared across both sites:
- `casamoderna-staging.local`
- `two.casamodernadms.eu`

No differences were observed in the tab/field lists returned by the audit helper.
