# Contract 9 — Product Data Model + Casa Moderna Pricing Engine

Date: 2026-03-03

## Phase A — Current State Found (live discovery)

### Standard fields reused
- Product name: `Item.item_name` (Data)
- Description: `Item.description` (Text Editor)
- Category: `Item.item_group` → `Item Group`
- Product image: `Item.image` (Attach Image) — visible and maintainer-only editable from Contract 8
- Supplier linkage: `Item.supplier_items` (child table `Item Supplier` with fields `supplier` and `supplier_part_no`)
- Pricing doctypes exist: `Item Price`, `Price List`, `Pricing Rule`

### Gaps vs Casa Moderna requirements
- Required single-line business-facing identity fields are not covered cleanly by standard fields:
  - Casa Moderna given name (separate from system `item_name`)
  - Additional description line 1 / line 2
- Supplier requirements are not covered as single fields:
  - Standard supplier linkage is multi-row (`Supplier Items` table), so we add explicit Casa Moderna supplier fields on Item.

### VAT rate architecture finding
- No reliable single “VAT %” field or default sales tax template pointer was found exposed in Company/Selling Settings/Accounts Settings.
- A safe minimal solution is to store the VAT rate explicitly on the default Company record via `Company.cm_vat_rate_percent`.

## Phase B — Minimum required Casa Moderna product fields (added)

### General (Identity)
- `cm_given_name`
- `cm_description_line_1`
- `cm_description_line_2`

### Suppliers & Pricing
- `cm_supplier_name`
- `cm_supplier_code`
- `cm_supplier_variant_description`

## Phases C–D — Pricing model + tile exception

### Inputs (source of truth)
- `cm_rrp_ex_vat` (Currency)
- `cm_discount_percent` (Percent)
- `cm_pricing_rounding_mode` (Select: `whole_euro_roundup` | `tile_decimal_pricing`)
- VAT rate: `Company.cm_vat_rate_percent` for the site’s default company

### Derived outputs (read-only)
- `cm_rrp_inc_vat`
- `cm_discounted_inc_vat`
- `cm_final_offer_inc_vat`
- `cm_final_offer_ex_vat`
- `cm_rounding_delta`

### Deterministic calculation rules
- Non-tile (`whole_euro_roundup`): rounds UP to the next whole €1 on the VAT-inclusive discounted price, then works back to ex-VAT.
- Tile (`tile_decimal_pricing`): keeps 2 decimals; no forced whole-euro rounding.

## Phase E — Categories/images reuse
- Category path remains: `Item Group` + Products Console shortcut.
- Image path remains: `Item.image` is visible and maintainer-only editable.

## Notes / Next operational step
- Before maintainers start entering RRP/discount, set `Company.cm_vat_rate_percent` on the default company used by the site.
