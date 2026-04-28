# CASAMODERNA ERPNext SALES DOCUMENTS — SLICE 018
Sales Docs Totals + Bottom Panel V1-Parity Pass 1 (Attachments left, Totals/Deposit right)

Date: 2026-03-05

## PLAN
1) **Audit (no guessing)** on BOTH sites: identify the live fields/sections used for:
   - Attachments surface
   - Totals summary
   - Deposit / payment-terms area (where applicable)
2) **Implement UI-only changes**:
   - Use existing Unified Sales Docs shell bottom row as the primary V1-like bottom panel.
   - Hide remaining noisy standard totals inputs on the default working surface (Property Setters).
3) **Extend stabilisation gate** with deterministic meta assertions for Slice 018.
4) **Verify on BOTH sites**:
   - `bench --site <site> migrate`
   - `bench --site <site> clear-cache`
   - `bench --site <site> execute casamoderna_dms.stabilisation_gate.run --kwargs "{'create_docs': 1}"`

## CURRENT STATE FOUND (BEFORE)
Read-only audit executed on both sites and written to:
- `/tmp/slice018_totals_bottom_panel_audit_casamoderna-staging.local_2026-03-05.json`
- `/tmp/slice018_totals_bottom_panel_audit_two.casamodernadms.eu_2026-03-05.json`

Findings (deterministic):

### Attachments
- None of the target sales doctypes expose an in-form `Attach` / `Attach Image` field.
- Attachments are managed via the standard ERPNext attachment widget.
- The existing **Slice 015 Unified Sales Docs shell** already provides a bottom-left “Attachments” card that delegates to the standard attachment UI.

### Totals (core)
For all target doctypes (QT/SO/DN/SI/POS/PF):
- Core totals fields exist and are visible:
  - `net_total`
  - `total_taxes_and_charges`
  - `grand_total`

### Noisy totals surfaces still visible (pre-slice)
Across multiple doctypes, ERPNext standard totals clutter remained visible on the working surface (examples):
- Tax breakup inputs/table:
  - `taxes_and_charges` (template link)
  - `taxes` (taxes table)
- Additional discount inputs:
  - `apply_discount_on`, `additional_discount_percentage`, `discount_amount`
- Duplicate computed totals:
  - `total`

### Deposit / deposit-required area (as implemented in live system)
- Quotation and Sales Order already have **Payment Terms** support via `payment_schedule` (table) + related Payment Terms fields.
- This slice treats that existing payment schedule UI as the “deposit/payment terms” area (no new logic added).

## FILES / RECORDS CHANGED

### Code
- Bottom panel UI (Unified shell):
  - `apps/casamoderna_dms/casamoderna_dms/public/js/cm_sales_doc_shell.js`
  - `apps/casamoderna_dms/casamoderna_dms/public/css/cm_sales_doc_shell.css`

- Idempotent patch (Property Setters for totals UI declutter):
  - `apps/casamoderna_dms/casamoderna_dms/patches/slice018_sales_docs_totals_bottom_panel_v1_parity.py`

- Patch registration:
  - `apps/casamoderna_dms/casamoderna_dms/patches.txt`
    - Added: `casamoderna_dms.patches.slice018_sales_docs_totals_bottom_panel_v1_parity`

- Stabilisation gate:
  - `apps/casamoderna_dms/casamoderna_dms/stabilisation_gate.py`
    - Added `_slice018_sales_docs_totals_bottom_panel_v1_parity_problems()`
    - Added recorded check: `B7.5A6 Slice 018 UI meta: Sales Docs totals + bottom panel V1-parity`

### Records (DB)
Property Setter records (`DocField.hidden`) created/updated on target doctypes (where fields exist):
- Ensure visible: `net_total`, `total_taxes_and_charges`, `grand_total`
- Hide on default working surface:
  - `taxes_and_charges`, `taxes`
  - `total`
  - `apply_discount_on`, `additional_discount_percentage`, `discount_amount`, `coupon_code`

No DocPerm/Custom DocPerm changes (stabilisation gate continues to report `custom_docperms: 0`).

## IMPLEMENTATION DETAILS

### Bottom panel composition (V1 pattern)
Implemented via the existing Unified Sales Docs shell bottom row:
- **Bottom-left**: Attachments card (delegates to standard attachments widget)
- **Bottom-right (upper)**: Totals card (compact stack):
  - Net Excl VAT (`net_total`)
  - VAT (`total_taxes_and_charges`)
  - Grand Total (`grand_total`)
- **Bottom-right (lower, where applicable)**: Deposit / Payment Terms card
  - Shown only for **Quotation** and **Sales Order** (where `payment_schedule` exists)
  - Surfaces existing Payment Terms fields and provides an “Edit Payment Terms” button that jumps to the underlying `payment_schedule` editor

### Totals/noise declutter (meta-only)
Slice 018 patch hides remaining ERPNext totals clutter from the default sales-entry surface while keeping backend correctness intact:
- hides the `taxes` table and related template input
- hides additional discount inputs
- hides duplicate computed `total`

## COMMANDS / VERIFICATION EVIDENCE
All commands executed from `/home/frappe/frappe/casamoderna-bench`.

### Audit evidence
- BEFORE:
  - `/tmp/slice018_totals_bottom_panel_audit_casamoderna-staging.local_2026-03-05.json`
  - `/tmp/slice018_totals_bottom_panel_audit_two.casamodernadms.eu_2026-03-05.json`
- AFTER:
  - `/tmp/slice018_totals_bottom_panel_after_casamoderna-staging.local_2026-03-05.json`
  - `/tmp/slice018_totals_bottom_panel_after_two.casamodernadms.eu_2026-03-05.json`

### Apply + verify (both sites)
- Staging:
  - `/tmp/slice018_verify_casamoderna-staging.local_2026-03-05_migrate.log`
  - `/tmp/slice018_verify_casamoderna-staging.local_2026-03-05_clear_cache.log`
  - `/tmp/slice018_verify_casamoderna-staging.local_2026-03-05_stabilisation_gate.log`

- two.casamodernadms.eu:
  - `/tmp/slice018_verify_two.casamodernadms.eu_2026-03-05_migrate.log`
  - `/tmp/slice018_verify_two.casamodernadms.eu_2026-03-05_clear_cache.log`
  - `/tmp/slice018_verify_two.casamodernadms.eu_2026-03-05_stabilisation_gate.log`

Gate summary confirms:
- `custom_docperms: 0`
- `matrix_tests: 137` (includes `B7.5A6`)

## RESULT
- Sales Docs now present a consistent V1-like bottom panel:
  - Attachments on the left
  - Compact totals on the right
  - Deposit/payment-terms access directly under totals on Quotation/Sales Order
- No totals/VAT/deposit calculations were modified (UI-only changes).
- Both sites remain aligned and stabilisation gate is GREEN.

## SUCCESS CHECKS
- Bottom panel visually matches the requested pattern via the unified shell:
  - Attachments left
  - Totals right (Net Excl VAT / VAT / Grand Total)
  - Deposit/payment terms card right-lower for Quotation/Sales Order
- Meta invariants enforced by stabilisation gate:
  - core totals remain present + visible
  - payment schedule remains present + visible on QT/SO
  - targeted noisy totals UI fields are hidden

## ROLLBACK
UI-only rollback approach:

1) Disable the Slice 018 patch from automatic re-application:
- Remove `casamoderna_dms.patches.slice018_sales_docs_totals_bottom_panel_v1_parity` from `apps/casamoderna_dms/casamoderna_dms/patches.txt`

2) Revert the Property Setters created by the patch:
- Naming pattern: `<DocType>-<fieldname>-hidden`
- Typical examples created/updated by Slice 018:
  - `Quotation-taxes-hidden`, `Quotation-taxes_and_charges-hidden`, `Quotation-total-hidden`
  - `Sales Order-taxes-hidden`, `Sales Order-total-hidden`
  - `Sales Invoice-taxes-hidden`
  - `POS Invoice-taxes-hidden`
  - `*-apply_discount_on-hidden`, `*-additional_discount_percentage-hidden`, `*-discount_amount-hidden`

3) If needed, revert the unified shell bottom UI back to previous behavior:
- Revert edits in:
  - `apps/casamoderna_dms/casamoderna_dms/public/js/cm_sales_doc_shell.js`
  - `apps/casamoderna_dms/casamoderna_dms/public/css/cm_sales_doc_shell.css`

4) Run per site:
- `bench --site <site> clear-cache`

Notes:
- Rollback is UI-only; it does not affect data integrity.
- Prefer deleting or flipping only the specific Property Setters you want to revert to avoid disturbing unrelated UI work.
