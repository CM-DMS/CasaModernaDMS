# Products — Bulk Import / Export (Item)

This guide is for maintaining the CasaModerna product catalogue using the DMS
bulk import/export system and ERPNext Data Import.

## Unified export

The "Unified export" button in the Product List CSV modal calls the backend API
`casamoderna_dms.api.products_export.get_unified_product_data` which returns
**every product field** in a single spreadsheet:

- **Importable fields** (44 columns) — can be round-tripped: export, edit in
  Excel, re-import via UPDATE mode.
- **Computed pricing outputs** (15 columns) — read-only, server-computed on
  every Item save. Included for review/audit. Do **not** import these.
- **Stock totals** (4 columns) — aggregated from warehouse Bin table. Read-only.
  Do **not** import these.

### Column layout

Importable fields come first, then computed outputs, then stock — so operators
can delete the read-only columns before re-importing.

## Canonical importable field set

**CSV header (ready to copy):**

item_code,item_name,cm_given_name,cm_description_line_1,cm_description_line_2,item_group,brand,stock_uom,is_stock_item,disabled,cm_product_type,cm_hidden_from_catalogue,cm_supplier_code,cm_supplier_name,cm_supplier_item_code,cm_supplier_item_name,cm_supplier_variant_description,cm_supplier_currency,cm_supplier_pack,lead_time_days,image,cm_rrp_ex_vat,cm_vat_rate_percent,cm_discount_target_percent,cm_pricing_rounding_mode,cm_purchase_price_ex_vat,cm_increase_before_percent,cm_discount_1_percent,cm_discount_2_percent,cm_discount_3_percent,cm_increase_after_percent,cm_shipping_percent,cm_shipping_fee,cm_handling_fee,cm_other_landed,cm_tiles_per_box,cm_sqm_per_box,cm_product_code,cm_family_code,cm_finish_code,cm_role_name,cm_variant,cm_dimensions,cm_weight_factor

### Field categories

| Category | Fields |
|---|---|
| Identity | `item_code`, `item_name`, `cm_given_name`, `cm_description_line_1`, `cm_description_line_2`, `item_group`, `brand`, `stock_uom`, `is_stock_item`, `disabled`, `cm_product_type`, `cm_hidden_from_catalogue` |
| Supplier | `cm_supplier_code`, `cm_supplier_name`, `cm_supplier_item_code`, `cm_supplier_item_name`, `cm_supplier_variant_description`, `cm_supplier_currency`, `cm_supplier_pack`, `lead_time_days` |
| Image | `image` (file URL — works best when file already exists on site) |
| Pricing inputs | `cm_rrp_ex_vat`, `cm_vat_rate_percent`, `cm_discount_target_percent`, `cm_pricing_rounding_mode` |
| Cost ladder inputs | `cm_purchase_price_ex_vat`, `cm_increase_before_percent`, `cm_discount_1_percent`, `cm_discount_2_percent`, `cm_discount_3_percent`, `cm_increase_after_percent` |
| Landed cost inputs | `cm_shipping_percent`, `cm_shipping_fee`, `cm_handling_fee`, `cm_other_landed` |
| Pack / dimensions | `cm_tiles_per_box`, `cm_sqm_per_box` |
| Configurator / product coding | `cm_product_code`, `cm_family_code`, `cm_finish_code`, `cm_role_name`, `cm_variant`, `cm_dimensions`, `cm_weight_factor` |

Notes:
- `brand` is optional in many setups.
- `cm_pricing_rounding_mode` values: `whole_euro_roundup` or `tile_decimal_pricing`.

## Safe import modes

### INSERT mode (new Items)

Use INSERT when creating new Item records.

Minimum recommended columns:
- `item_code` (unique key)
- `item_name`
- `item_group`
- `stock_uom`
- `is_stock_item`
- `disabled`

Optional but commonly used:
- `cm_given_name`, `cm_description_line_1`, `cm_description_line_2`
- `brand`
- Supplier fields: `cm_supplier_code`, `cm_supplier_name`, `cm_supplier_item_code`, `cm_supplier_item_name`, `cm_supplier_variant_description`, `cm_supplier_currency`, `cm_supplier_pack`, `lead_time_days`
- Pricing inputs: `cm_rrp_ex_vat`, `cm_discount_target_percent`, `cm_pricing_rounding_mode`
- Cost ladder: `cm_purchase_price_ex_vat`, `cm_increase_before_percent`, `cm_discount_1/2/3_percent`, `cm_increase_after_percent`
- Landed costs: `cm_shipping_percent`, `cm_shipping_fee`, `cm_handling_fee`, `cm_other_landed`
- Tile inputs (only for tiles): `cm_tiles_per_box`, `cm_sqm_per_box`

Prerequisites before importing:
- `Item Group` values must already exist.
- `stock_uom` values must already exist in UOM.

### UPDATE mode (existing Items)

Use UPDATE when changing existing Items.

Rules:
- Use `item_code` as the key.
- Only include columns you intend to change.
- Keep updates to approved business fields (all fields in the importable set above).

## Do not import (warnings)

### Computed pricing outputs (export-only)

These are computed by the pricing engine on every Item save. Never import them:

- `cm_rrp_inc_vat`, `cm_final_offer_inc_vat`, `cm_final_offer_ex_vat`
- `cm_discount_percent` (effective discount post-rounding)
- `cm_cost_ex_vat_calculated`, `cm_landed_additions_total_ex_vat`
- `cm_profit_ex_vat`, `cm_margin_percent`, `cm_markup_percent`
- Virtual ladder intermediates: `cm_supplier_list_price_ex_vat`, `cm_after_increase_before_ex_vat`, `cm_after_discount_1/2/3_ex_vat`, `cm_cost_ex_vat`

If a price looks wrong after import:
1) check the inputs (`cm_rrp_ex_vat`, `cm_discount_target_percent`, pricing mode, VAT rate, cost ladder inputs), then
2) save the Item to re-run calculations.

### Stock columns (export-only)

Stock totals are included in the unified export for visibility:

- `total_actual_qty` — stock on hand across all warehouses
- `total_reserved_qty` — committed to sales orders
- `total_ordered_qty` — on incoming purchase orders
- `total_projected_qty` — projected availability

These are **never importable** — stock is transaction-driven (purchase receipts, delivery notes, stock entries).

### Tiles rules (must be correct before selling)

For tile products:
- Set tile pricing mode (`tile_decimal_pricing`).
- Set `cm_sqm_per_box` to a value **greater than 0**.
- Sales documents must be entered in **boxes**; customer documents display **sqm**.

If `cm_sqm_per_box` is missing or 0, the system will block saving sales documents that include that tile item.

### Cost ladder import notes

Importing cost ladder inputs (`cm_purchase_price_ex_vat`, increase/discount percentages, landed costs) will **automatically trigger recalculation** of all derived fields when ERPNext saves each Item row. No manual re-save needed — the pricing engine runs on every Item.validate.

## Helper (optional)

To print the canonical field list from the server:

`bench --site <site> execute casamoderna_dms.products_bulk_fields.print_export_fields`
