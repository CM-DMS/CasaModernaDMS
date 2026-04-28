# CASAMODERNA ERPNext PRODUCTS MODULE — CONTRACT 12
FULL PRICING ENGINE CORRECTION

Date: 2026-03-03
Bench: `/home/frappe/frappe/casamoderna-bench`
Sites:
- `casamoderna-staging.local`
- `two.casamodernadms.eu`

## PLAN

- What I inspected (Phase A)
  - Live pricing paths (server hook + client help script), Item pricing meta, and candidate cost fields.
  - Existing CasaModerna print formats for Quotation and Sales Order for any discount display.
- What I changed (Phase C/D/E)
  - Corrected pricing engine so discount is mathematically coherent after final rounding by storing an **effective discount %**.
  - Added a minimal, explicit cost input and derived profitability outputs (only when cost is provided).
  - Implemented discount display policy in PDFs (display-only whole-% rounded up).
  - Updated deterministic smoke to cover new fields + math.
- Why
  - Ensure pricing is coherent with the authoritative source of truth (`RRP ex VAT`) while obeying rounding rules.
  - Provide optional profitability visibility without relying on potentially unsafe standard “cost-like” fields.

## CURRENT STATE FOUND

### Pricing calculation path
- Pricing is applied server-side via the Item validate hook.
- The existing Item client script is informational (VAT status + guide) and does not compute pricing.

### Source of truth and rounding
- Authoritative input remained: `Item.cm_rrp_ex_vat`.
- Rounding modes remained:
  - Whole-euro roundup (non-tile)
  - 2dp pricing (tile exception)

### Cost / profitability data safety
Candidate standard fields existed on Item (e.g. `valuation_rate`, `standard_rate`, `last_purchase_rate`), but using them directly as a profitability input was deemed unsafe because they can be:
- system-maintained by stock valuation,
- inconsistent across stock/non-stock items,
- read-only or context-dependent.

Decision: add a dedicated, optional cost input `Item.cm_cost_ex_vat` and compute profitability only when it is set.

### Print formats
- `CasaModerna Quotation` and `CasaModerna Sales Order` did not display discount previously.

## FILES / RECORDS CHANGED

### Files changed
- `apps/casamoderna_dms/casamoderna_dms/contract9_products_pricing.py`
  - Contract 12 correction in `compute_pricing()`:
    - Treat input discount as **target discount**.
    - Compute `effective_discount_percent` from **final rounded offer incl VAT** vs `rrp_inc_vat`.
    - Compute optional profitability outputs when `cost_ex_vat` is provided: `profit_ex_vat`, `margin_percent`, `markup_percent`.
- `apps/casamoderna_dms/casamoderna_dms/cm_pricing.py`
  - Update Item validate hook to:
    - Use `cm_discount_target_percent` as the input (fallback to legacy `cm_discount_percent` for backward compatibility).
    - Store computed effective discount into `cm_discount_percent`.
    - Compute and write profitability outputs only when `cm_cost_ex_vat` is provided.
- `apps/casamoderna_dms/casamoderna_dms/fixtures/custom_field.json`
  - Added Item fields:
    - `cm_discount_target_percent` (editable)
    - `cm_cost_ex_vat` (editable; optional)
    - `cm_profit_ex_vat` (read-only)
    - `cm_margin_percent` (read-only)
    - `cm_markup_percent` (read-only)
  - Modified Item field:
    - `cm_discount_percent` is now **read-only effective discount**, with precision set to 3 decimals.
- `apps/casamoderna_dms/casamoderna_dms/fixtures/print_format.json`
  - Updated `CasaModerna Quotation` and `CasaModerna Sales Order`:
    - Added a **Discount** column displayed as whole % rounded up (ceil) from `row.discount_percentage` (display-only).
- `apps/casamoderna_dms/casamoderna_dms/smoke_checks_products_console.py`
  - Extended smoke to validate:
    - New fields exist and are placed under `Suppliers & Pricing`.
    - New derived fields are read-only.
    - Effective discount math is correct for whole-euro and tile modes.
    - Profit/margin/markup are computed only when a cost is provided.

### ERPNext records changed (via fixtures)
- Custom Field
  - Added:
    - `Item-cm_discount_target_percent`
    - `Item-cm_cost_ex_vat`
    - `Item-cm_profit_ex_vat`
    - `Item-cm_margin_percent`
    - `Item-cm_markup_percent`
  - Modified:
    - `Item-cm_discount_percent` (label/precision/read-only)
- Print Format
  - Modified:
    - `CasaModerna Quotation`
    - `CasaModerna Sales Order`

## COMMANDS

### Apply changes
- Staging:
  - `bench --site casamoderna-staging.local migrate`
- Second site:
  - `bench --site two.casamodernadms.eu migrate`

### Verify
- Staging:
  - `bench --site casamoderna-staging.local execute casamoderna_dms.smoke_checks_products_console.run`
- Second site:
  - `bench --site two.casamodernadms.eu execute casamoderna_dms.smoke_checks_products_console.run`

## RESULT

- Effective discount corrected
  - `cm_discount_target_percent` is the operator input.
  - `cm_discount_percent` stores the **effective discount after rounding**, ensuring coherence with the final rounded offer price.
- Profitability supported (safely)
  - If `cm_cost_ex_vat` is set, Item shows:
    - Profit (ex VAT)
    - Margin (%)
    - Markup (%)
  - If cost is empty, profitability fields remain empty (no guessing).
- UI precision implemented
  - Discount percentages are displayed to 3 decimals on Item.
- PDF discount display implemented (display-only)
  - Quotation/Sales Order PDFs show a Discount column as whole % rounded up.

## SUCCESS CHECKS

- Both sites migrated successfully.
- Both sites passed the updated deterministic Products Console smoke.
- Smoke explicitly validated:
  - effective-discount math after rounding
  - tile vs non-tile rounding behaviors
  - profitability outputs only when cost is provided

## ROLLBACK

Fast rollback options (non-destructive):

1) Revert files and re-migrate
- Revert these files to the previous version:
  - `apps/casamoderna_dms/casamoderna_dms/contract9_products_pricing.py`
  - `apps/casamoderna_dms/casamoderna_dms/cm_pricing.py`
  - `apps/casamoderna_dms/casamoderna_dms/fixtures/custom_field.json`
  - `apps/casamoderna_dms/casamoderna_dms/fixtures/print_format.json`
  - `apps/casamoderna_dms/casamoderna_dms/smoke_checks_products_console.py`

2) Apply on both sites
- `bench --site casamoderna-staging.local migrate`
- `bench --site two.casamodernadms.eu migrate`

3) Validate
- `bench --site casamoderna-staging.local execute casamoderna_dms.smoke_checks_products_console.run`
- `bench --site two.casamodernadms.eu execute casamoderna_dms.smoke_checks_products_console.run`
