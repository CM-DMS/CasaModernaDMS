# CASAMODERNA ERPNext PRODUCTS MODULE — CONTRACT 10
PRICING OPERATIONS POLISH + VAT CONFIG SAFETY + PRODUCT CATALOGUE PRICING VISIBILITY

Date: 2026-03-03
Bench: `/home/frappe/frappe/casamoderna-bench`
Sites:
- `casamoderna-staging.local`
- `two.casamodernadms.eu`

## PLAN

- What I inspected
  - Live Item pricing field layout + editability + tab placement (Contract 10 Phase A) via a bench-executable inspector.
  - Live Company VAT config field presence + current value.
  - Live Item catalogue/list visibility (meta `in_list_view`) and existing shared list filters.
- What I changed
  - Added a small Item pricing help/warning block (HTML field) and a lightweight Item client script that shows VAT status + a short operational pricing guide.
  - Grouped pricing fields into `Pricing Inputs` and `Pricing Outputs` sections without changing field meanings.
  - Exposed a small set of pricing/identity columns in the Item list view and added two shared list filters for pricing maintenance.
  - Updated the deterministic Products Console smoke to verify the above.
- Why
  - Reduce operator error around the VAT dependency (`Company.cm_vat_rate_percent`) and make pricing entry clearer.
  - Improve day-to-day maintainability and catalogue scanning without altering Contract 9 pricing logic.

## CURRENT STATE FOUND

### Current pricing field layout (pre-change)
Captured from live meta on BOTH sites using:
- `bench --site casamoderna-staging.local execute casamoderna_dms.contract10_pricing_ops.inspect`
- `bench --site two.casamodernadms.eu execute casamoderna_dms.contract10_pricing_ops.inspect`

Findings (identical on both sites at inspection time):
- All Contract 9 pricing fields were under tab `purchasing_tab` (Suppliers & Pricing).
- Inputs were editable:
  - `cm_rrp_ex_vat` (source of truth)
  - `cm_discount_percent`
  - `cm_pricing_rounding_mode`
- Derived outputs were correctly read-only:
  - `cm_rrp_inc_vat`, `cm_discounted_inc_vat`, `cm_final_offer_inc_vat`, `cm_final_offer_ex_vat`, `cm_rounding_delta`
- There was no additional operational guidance/warning in the pricing area.
- Item list meta `in_list_view` did NOT include Contract 9 custom fields (catalogue scanning showed only the standard columns).

### VAT config findings
- `Company.cm_vat_rate_percent` existed and was UI-editable.
- Default company was `Casa Moderna Limited`.
- `Casa Moderna Limited.cm_vat_rate_percent` was set to `18.0` at inspection time.

### List visibility findings
- Standard list-view columns were present via Property Setters.
- Contract 9 pricing fields were not in list view (pre-change).
- Existing shared Item list filters were present (Active/Stock/Non-stock/Templates/Variants).

### What was safe to change
- Adding non-destructive Custom Fields (HTML + Section Breaks) and re-ordering via `insert_after`.
- Adding a bounded Item client script to display warnings/guidance (does not compute pricing; server remains source of truth).
- Adding `in_list_view` to a small number of existing custom fields.
- Adding shared List Filters.

## FILES / RECORDS CHANGED

### Files changed
- `apps/casamoderna_dms/casamoderna_dms/fixtures/custom_field.json`
  - Added `Item.cm_pricing_ops_help` (HTML)
  - Added `Item.cm_pricing_inputs_section` (Section Break)
  - Added `Item.cm_pricing_outputs_section` (Section Break)
  - Re-ordered pricing fields into those sections
  - Set `in_list_view=1` for: `cm_supplier_code`, `cm_rrp_ex_vat`, `cm_discount_percent`
- `apps/casamoderna_dms/casamoderna_dms/fixtures/client_script.json`
  - Added Client Script: `Item - CasaModerna Pricing Ops` (enabled)
- `apps/casamoderna_dms/casamoderna_dms/fixtures/list_filter.json`
  - Added List Filter: `CM Missing RRP`
  - Added List Filter: `CM Tile Pricing`
- `apps/casamoderna_dms/casamoderna_dms/cm_pricing.py`
  - Improved the VAT-missing validation message to be operator-actionable
- `apps/casamoderna_dms/casamoderna_dms/smoke_checks_products_console.py`
  - Smoke coverage for Contract 10:
    - new list filters exist
    - new pricing help + grouping fields exist
    - Item pricing ops client script exists and contains expected tokens
    - selected catalogue columns are `in_list_view`
- `apps/casamoderna_dms/casamoderna_dms/contract10_pricing_ops.py`
  - New: bench-executable inspector used for Phase A discovery and post-change verification

### ERPNext records changed (via fixtures)
- Custom Field
  - `Item-cm_pricing_ops_help`
  - `Item-cm_pricing_inputs_section`
  - `Item-cm_pricing_outputs_section`
  - Modified:
    - `Item-cm_supplier_name` (insert_after)
    - `Item-cm_rrp_ex_vat` (insert_after, in_list_view)
    - `Item-cm_rrp_inc_vat` (insert_after)
    - `Item-cm_supplier_code` (in_list_view)
    - `Item-cm_discount_percent` (in_list_view)
- Client Script
  - `Item - CasaModerna Pricing Ops`
- List Filter
  - `CM Missing RRP`
  - `CM Tile Pricing`

## COMMANDS

### Inspection (Phase A)
- Staging:
  - `bench --site casamoderna-staging.local execute casamoderna_dms.contract10_pricing_ops.inspect`
- Second site:
  - `bench --site two.casamodernadms.eu execute casamoderna_dms.contract10_pricing_ops.inspect`

### Fixture validation during implementation
- Validate JSON fixture:
  - `python -m json.tool apps/casamoderna_dms/casamoderna_dms/fixtures/client_script.json >/dev/null`

### Apply changes
- Staging:
  - `bench --site casamoderna-staging.local migrate`
- Second site:
  - `bench --site two.casamodernadms.eu migrate`

### Verify (Phase E)
- Staging:
  - `bench --site casamoderna-staging.local execute casamoderna_dms.smoke_checks_products_console.run`
- Second site:
  - `bench --site two.casamodernadms.eu execute casamoderna_dms.smoke_checks_products_console.run`

## RESULT

- VAT safety improvement made
  - Item form now shows an operational VAT status warning/line in the pricing area (via `cm_pricing_ops_help` + client script).
  - Server-side validation message for missing VAT is clearer and points maintainers to the exact field to set.
- Item pricing usability improvement made
  - Pricing is now visually grouped into `Pricing Inputs` and `Pricing Outputs` sections.
  - Derived fields remain read-only.
  - A short operational guide is visible (source-of-truth, discount application, rounding rule, tile exception).
- Product Catalogue pricing visibility changes made
  - Item list view now includes: `cm_supplier_code`, `cm_rrp_ex_vat`, `cm_discount_percent` (kept to 3 columns).
  - Added shared filters: `CM Missing RRP` and `CM Tile Pricing`.
- Limitations still remaining
  - The VAT warning is a UI cue (client script) plus a bounded server validation error; it does not attempt to enforce or compute VAT on the client.
  - List view visibility is meta-based; individual users can still override their personal list view settings.

## SUCCESS CHECKS

- Both sites migrated successfully after fixture import.
- Both sites passed the updated deterministic smoke:
  - `OK: Products Console smoke checks passed`
- Smoke explicitly verified:
  - 5-tab Item structure intact
  - category/image access path intact
  - Contract 9 pricing engine math intact
  - Contract 10 help/grouping fields exist
  - Contract 10 client script exists + enabled
  - Contract 10 list filters exist
  - Contract 10 list visibility columns are `in_list_view`

## ROLLBACK

Fast rollback options (non-destructive):

1) Revert fixtures and re-migrate
- Revert these files to the previous version:
  - `apps/casamoderna_dms/casamoderna_dms/fixtures/custom_field.json`
  - `apps/casamoderna_dms/casamoderna_dms/fixtures/client_script.json`
  - `apps/casamoderna_dms/casamoderna_dms/fixtures/list_filter.json`
  - `apps/casamoderna_dms/casamoderna_dms/smoke_checks_products_console.py`
  - `apps/casamoderna_dms/casamoderna_dms/cm_pricing.py` (optional: message-only)
  - `apps/casamoderna_dms/casamoderna_dms/contract10_pricing_ops.py` (optional)

2) Apply on both sites
- `bench --site casamoderna-staging.local migrate`
- `bench --site two.casamodernadms.eu migrate`

3) Validate
- `bench --site casamoderna-staging.local execute casamoderna_dms.smoke_checks_products_console.run`
- `bench --site two.casamodernadms.eu execute casamoderna_dms.smoke_checks_products_console.run`
