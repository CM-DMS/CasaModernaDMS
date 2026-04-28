# CASAMODERNA ERPNext SALES DOCUMENTS — SLICE 016
Declutter: Hide unused ERPNext standard fields across Sales Docs (QT/SO/DN/SI/POS/PF)

Date: 2026-03-05

## GOAL
Reduce form clutter by hiding standard ERPNext fields that CasaModerna does not use day-to-day, while keeping:
- Core working surface (customer + document dates/info + items + totals + notes)
- All CasaModerna `cm_` fields intact
- No business logic / workflow / numbering changes
- No DocPerm / Custom DocPerm changes

## PLAN
1) Read-only audit BOTH sites to inventory visible fields (no guessing).
2) Implement an idempotent, meta-only patch using Property Setters (`DocField.hidden=1`).
3) Add stabilisation gate assertions (deterministic meta checks, not DOM).
4) Verify on BOTH sites:
   - `bench migrate`
   - `bench clear-cache`
   - stabilisation gate `run(create_docs=1)`

## CURRENT STATE FOUND (BEFORE)
Read-only declutter audits were executed on both sites and written to:
- `/tmp/slice_declutter_audit_casamoderna-staging.local_2026-03-05.json`
- `/tmp/slice_declutter_audit_two.casamodernadms.eu_2026-03-05.json`

Key finding: sales document doctypes expose a large number of visible standard fields by default (multi-currency, scanning, base totals, warehouse setters, posting time controls, etc.), creating significant day-to-day clutter.

## FILES / RECORDS CHANGED
### Code
Idempotent patch (Property Setters for standard-field hiding):
- `apps/casamoderna_dms/casamoderna_dms/patches/slice016_sales_docs_declutter_standard_fields.py`

Follow-up patch (hide a small allowlist of system-required-but-noisy fields):
- `apps/casamoderna_dms/casamoderna_dms/patches/slice016b_sales_docs_declutter_hide_required_system_fields.py`

Patch registration:
- `apps/casamoderna_dms/casamoderna_dms/patches.txt`
  - Added:
    - `casamoderna_dms.patches.slice016_sales_docs_declutter_standard_fields`
    - `casamoderna_dms.patches.slice016b_sales_docs_declutter_hide_required_system_fields`

Stabilisation gate:
- `apps/casamoderna_dms/casamoderna_dms/stabilisation_gate.py`
  - Added `_slice016_sales_docs_declutter_problems()`
  - Added recorded check: `B7.5A4 Slice 016 UI meta: Sales Docs declutter standard fields`
  - Corrected Quotation core field assertion to use `party_name` (Quotation does not have a `customer` field).

### Records (DB)
- Property Setter records (`DocField.hidden`) created/updated for target doctypes:
  - Quotation
  - Sales Order
  - Delivery Note
  - Sales Invoice
  - POS Invoice
  - CM Proforma

No DocPerm/Custom DocPerm changes (stabilisation gate continues to report `custom_docperms: 0`).

## IMPLEMENTATION DETAILS
### Slice 016 (base declutter)
Strategy:
- Keep-list per doctype: retain core fields (customer/party, dates, items, totals, notes, minimal links).
- Always-hide list: hide known noisy fields where present (scan barcode, base totals, conversion-rate related, warehouse setters, etc.).
- Safety skips:
  - Never hide `cm_` fields
  - Skip structural fieldtypes (Section Break / Tab Break / Table / etc.)
  - Skip fields with `mandatory_depends_on`
  - Skip required fields (`reqd=1`) to avoid breaking document validation

### Slice 016b (required-but-system fields)
During verification we found some “clutter” fields are marked `reqd=1` in core ERPNext (examples: `conversion_rate`, `plc_conversion_rate`, `posting_time`, `base_grand_total`).

Slice 016 intentionally did not hide required fields, so the UI remained noisy in those areas.
Slice 016b is a narrow allowlist patch that hides only these system-required fields that are not used in CasaModerna day-to-day flow and are safe to keep invisible:
- For QT/SO/DN/SI/POS:
  - `conversion_rate`, `plc_conversion_rate`
- Delivery Note:
  - `posting_time`
- Sales Invoice / POS Invoice:
  - `base_grand_total`

## COMMANDS / VERIFICATION EVIDENCE
All commands executed from `/home/frappe/frappe/casamoderna-bench`.

### Initial verify (after Slice 016 registration)
Applied and verified on both sites (migrate + cache clear + gate), but gate failed due to Slice 016 assertions not matching ERPNext meta invariants:
- `/tmp/slice016_verify_casamoderna-staging.local_2026-03-05_migrate.log`
- `/tmp/slice016_verify_casamoderna-staging.local_2026-03-05_clear_cache.log`
- `/tmp/slice016_verify_casamoderna-staging.local_2026-03-05_stabilisation_gate.log`

- `/tmp/slice016_verify_two.casamodernadms.eu_2026-03-05_migrate.log`
- `/tmp/slice016_verify_two.casamodernadms.eu_2026-03-05_clear_cache.log`
- `/tmp/slice016_verify_two.casamodernadms.eu_2026-03-05_stabilisation_gate.log`

Root causes (deterministic):
- Quotation uses `party_name` rather than a `customer` field.
- Several noisy fields are `reqd=1` in core (so Slice 016 correctly skipped hiding them).

### Final verify (after Slice 016b + gate fix)
Re-applied via migrate and re-ran stabilisation gate — GREEN on BOTH sites:
- `/tmp/slice016b_verify_casamoderna-staging.local_2026-03-05_migrate.log`
- `/tmp/slice016b_verify_casamoderna-staging.local_2026-03-05_clear_cache.log`
- `/tmp/slice016b_verify_casamoderna-staging.local_2026-03-05_stabilisation_gate.log`

- `/tmp/slice016b_verify_two.casamodernadms.eu_2026-03-05_migrate.log`
- `/tmp/slice016b_verify_two.casamodernadms.eu_2026-03-05_clear_cache.log`
- `/tmp/slice016b_verify_two.casamodernadms.eu_2026-03-05_stabilisation_gate.log`

Gate summary confirms:
- `custom_docperms: 0`
- `matrix_tests: 135` (includes `B7.5A4`)

## RESULT
- Sales Docs are materially cleaner by default (fewer standard ERPNext-only fields on the working surface).
- No business logic changed (meta-only Property Setters).
- Both sites remain aligned and stabilisation remains GREEN.

## ROLLBACK
UI-only rollback approach:

1) Remove the patches from `apps/casamoderna_dms/casamoderna_dms/patches.txt` to prevent re-application:
   - `casamoderna_dms.patches.slice016_sales_docs_declutter_standard_fields`
   - `casamoderna_dms.patches.slice016b_sales_docs_declutter_hide_required_system_fields`

2) Revert Property Setters created by these patches:
   - Property Setter naming pattern for hidden fields is: `<DocType>-<fieldname>-hidden` (DocField).
   - Slice 016b creates (where present) the following specific Property Setters:
     - `Quotation-conversion_rate-hidden`
     - `Quotation-plc_conversion_rate-hidden`
     - `Sales Order-conversion_rate-hidden`
     - `Sales Order-plc_conversion_rate-hidden`
     - `Delivery Note-conversion_rate-hidden`
     - `Delivery Note-plc_conversion_rate-hidden`
     - `Delivery Note-posting_time-hidden`
     - `Sales Invoice-conversion_rate-hidden`
     - `Sales Invoice-plc_conversion_rate-hidden`
     - `Sales Invoice-base_grand_total-hidden`
     - `POS Invoice-conversion_rate-hidden`
     - `POS Invoice-plc_conversion_rate-hidden`
     - `POS Invoice-base_grand_total-hidden`

   For Slice 016 (base declutter), remove the Property Setters for any standard fields you want visible again (same naming pattern).

3) Run on each site:
   - `bench --site <site> clear-cache`

Notes:
- Rollback is UI-only; it does not affect data integrity.
- Prefer deleting (or setting value to `0`) only the Property Setters you want to revert, to avoid disturbing unrelated UI customisations.
