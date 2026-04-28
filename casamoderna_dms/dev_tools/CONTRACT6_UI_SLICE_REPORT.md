# Contract 6 — UI Slice Evidence (Item)

Date: 2026-03-03

## Goals
- Reduce cognitive load in **General** by hiding clearly irrelevant fixed-asset + allowance controls.
- Make **Transactions** feel intentional without adding backend logic or JS overrides.
- Preserve the strict 6-tab Item model.

## Implemented Changes (Minimal)

### General (de-noise)
Hidden via Property Setter (reversible):
- `is_fixed_asset`
- `auto_create_assets`
- `is_grouped_asset`
- `asset_category`
- `asset_naming_series`
- `over_delivery_receipt_allowance`
- `over_billing_allowance`

Rationale:
- These are advanced / fixed-asset / tolerance controls and were causing the General tab to feel cluttered.
- They remain in the system (no schema deletion); only hidden from day-to-day UI.

### Transactions (make intentional)
Added 1 structural-only Custom Field:
- `cm_transactions_help` (HTML) under `dashboard_tab`

Content:
- A short guidance block with links to standard system-managed views:
  - Stock Ledger, Stock Balance, Item Prices
  - Stock Reservation Entry (Stock Allocations)
  - Stock Entry
  - Sales Orders / Purchase Orders

Rationale:
- The Transactions tab had no standard fields at all; this adds immediate operational direction without custom logic.

## Evidence Commands
- Tab content audit (visible fields):
  - `bench --site casamoderna-staging.local execute casamoderna_dms.smoke_checks_products_console.item_tab_content_audit`
- Hidden-field dump (confirmed Transactions had no hidden standard fields):
  - `bench --site casamoderna-staging.local execute casamoderna_dms.smoke_checks_products_console.item_tab_field_dump`
- Verification:
  - `bench --site casamoderna-staging.local execute casamoderna_dms.smoke_checks_products_console.run`
  - `bench --site two.casamodernadms.eu execute casamoderna_dms.smoke_checks_products_console.run`

## Notes / Limitations
- Transactions remains mostly system-managed; this slice does **not** attempt to embed dynamic per-Item transaction history inside the form.
- If fixed-asset workflows are needed occasionally, an admin can unhide the fields by reverting the relevant Property Setters.
