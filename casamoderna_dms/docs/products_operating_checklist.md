# Products — Operating Checklist

This checklist describes the day-to-day operating model for the product catalogue.

## Roles and responsibilities

### Standard Product User (Products Console)

Typical work:
- Browse the catalogue and product categories.
- Use saved lists/filters to find items that need attention.
- Raise a request to the Product Maintainer when changes are needed.

What they should not do:
- Create new Items.
- Change pricing inputs.
- Upload/replace images.

### Product Maintainer

Typical work:
- Edit existing Items (names, descriptions, supplier references).
- Maintain categories (Item Groups).
- Upload/replace product images.
- Maintain pricing inputs and tile conversion inputs.

## Operating rules (do these every time)

### Pricing
- `cm_rrp_ex_vat` is the source of truth for selling price calculations.
- `cm_discount_target_percent` is a target input; the system stores the effective discount after rounding.
- Non-tile pricing is rounded up to whole euros.
- Tile pricing uses two decimal places.

### Tiles
- Tile products must have a valid `cm_sqm_per_box` (> 0) before they can be sold.
- Sales documents are entered in **boxes**.
- Customer documents (PDF) display **sqm** for tile items.

## Daily checklist

1) New product request received
- Confirm category (Item Group) exists (or create it).
- Confirm UOM choice (usually `Nos` / `Unit`).

2) Create or update the Item
- Ensure `item_code`, `item_name`, `item_group`, `stock_uom`, `is_stock_item`, `disabled` are correct.
- Fill descriptions (`cm_given_name`, `cm_description_line_1`, `cm_description_line_2`) as needed.
- Enter supplier references if available (`cm_supplier_code`, `cm_supplier_name`, `cm_supplier_variant_description`).

3) Pricing inputs
- Set `cm_rrp_ex_vat`.
- Set `cm_discount_target_percent`.
- Select the pricing mode (non-tile whole-euro vs tile two-decimal).
- If known, set `cm_cost_ex_vat`.

4) Tiles (only for tiles)
- Set tile pricing mode.
- Set `cm_sqm_per_box` (> 0).
- If known, set `cm_tiles_per_box` (> 0).

5) Image
- Upload/replace the Item image.

6) Final check
- Save the Item and confirm calculated outputs populate.
- Confirm the Item can be found in link search by CM name / display name / supplier code.

## If something looks wrong (triage)

- Price looks wrong:
  - Check `cm_rrp_ex_vat`, `cm_discount_target_percent`, pricing mode, and the site’s VAT rate on the default Company.
  - Re-save the Item to recalculate.

- Tile sales document blocked:
  - Check the Item is in tile pricing mode and `cm_sqm_per_box` is set (> 0).

- Item cannot be found in search:
  - Confirm `cm_given_name`, `cm_display_name`, and `cm_supplier_code` are filled.
  - Confirm the Item is not disabled (if it should be visible).

Escalation:
- Product data issues → Product Maintainer
- Permission/access issues → CM Super Admin
- System calculation issues → technical support team
