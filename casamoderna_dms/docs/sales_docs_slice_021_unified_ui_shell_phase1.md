# CASAMODERNA ERPNext SALES DOCUMENTS — SLICE 021
Unified V1 Sales Docs UI Shell — Phase 1 (Layout + Identity + Convert Placement)

Date: 2026-03-05

## PLAN
1) Phase A (Audit, read-only)
   - Inventory enabled Client Scripts per target Sales Doc doctype on BOTH sites.
   - Confirm no collisions with:
     - AB Split helpers
     - Slice 013 Convert group scripts
     - Proforma (PF) behavior
   - Confirm stable field anchors for identity strip (V1 numbers + state/status) and party/customer header.
2) Phase B (Implement, UI-only)
   - Update ONE shared JS module + ONE shared CSS file used by all doctypes.
   - Update thin per-doctype wrapper Client Scripts (idempotent patch) to pass required V1 label mapping.
   - Visually place the existing Slice 013 Convert dropdown into the identity strip (DOM move only; no logic changes).
3) Phase C (Smoke/Gate)
   - Extend stabilisation gate with deterministic assertions proving wrappers + labels + Convert scripts are enabled.
   - Verify on BOTH sites: `bench migrate`, `bench clear-cache`, stabilisation gate `run(create_docs=1)`.

## CURRENT STATE FOUND (Phase A audit)
Read-only audit script created and executed on BOTH sites:
- `apps/casamoderna_dms/casamoderna_dms/sales_docs_slice021_shell_audit.py`

Evidence outputs:
- `/tmp/slice021_audit_casamoderna-staging.local_2026-03-05.json`
- `/tmp/slice021_audit_two.casamodernadms.eu_2026-03-05.json`

Key findings (both sites identical):
- Shared shell assets are already included for Desk via hooks:
  - `/assets/casamoderna_dms/js/cm_sales_doc_shell.js`
  - `/assets/casamoderna_dms/css/cm_sales_doc_shell.css`
- Enabled Client Scripts per doctype:
  - Quotation: AB Split helpers + Slice 013 Convert + Sales Doc Shell wrapper
  - Sales Order: AB Split helpers + Slice 013 Convert + Sales Doc Shell wrapper
  - Delivery Note: Slice 013 Convert + Sales Doc Shell wrapper
  - Sales Invoice: Sales Doc Shell wrapper
  - POS Invoice: Sales Doc Shell wrapper
  - CM Proforma: Sales Doc Shell wrapper
- Anchor/field reality:
  - Quotation uses `party_name` (not `customer`) for customer linkage.
  - Sales Order uniquely has `workflow_state`.
  - Sales Invoice / POS Invoice have `cm_v1_fiscal_record_no` and `is_return` (returns behave like Credit Notes in V1).

Stable UI anchors used by the shell (no V1 access / no guessing):
- Shell container inserted before `.form-layout`.
- Items anchor uses `frm.fields_dict.items.grid.wrapper`.
- Convert group relocation searches the existing toolbar (`frm.page.inner_toolbar`) for a button labeled “Convert” and moves the existing dropdown/button group into the shell bar.

## FILES / RECORDS CHANGED

### Code
Shared shell assets (updated UI-only behavior):
- `apps/casamoderna_dms/casamoderna_dms/public/js/cm_sales_doc_shell.js`
  - Identity strip rules:
    - Shows `cm_v1_operational_no` else `cm_v1_draft_no`.
    - Shows `cm_v1_fiscal_record_no` when present.
    - Sales Order shows `workflow_state` (State) instead of Status.
    - Other docs show Status.
    - Returns (`is_return==1`) show “Credit Note” indicator.
  - Convert placement:
    - Visually relocates the *existing* Slice 013 Convert dropdown/button group into the identity strip when present (docstatus==1), without changing conversion logic.
  - Header cards:
    - Quotation customer card includes `party_name` / `quotation_to` anchors in addition to standard customer fields.
- `apps/casamoderna_dms/casamoderna_dms/public/css/cm_sales_doc_shell.css`
  - Adds minimal styling so a moved Convert dropdown fits the identity strip.

Idempotent patch (wrapper Client Scripts label mapping):
- `apps/casamoderna_dms/casamoderna_dms/patches/slice021_unified_sales_docs_ui_shell_phase1.py`
  - Updates thin per-doctype wrappers to pass V1-like doctype labels:
    - Quotation → “Quotation”
    - Sales Order → “Sales Order”
    - Delivery Note → “Delivery Note”
    - Sales Invoice → “Invoice”
    - POS Invoice → “Cash Sale”
    - CM Proforma → “Proforma”
  - Returns are handled client-side: Sales Invoice Return / POS Invoice Return display as “Credit Note”.

Patch registration:
- `apps/casamoderna_dms/casamoderna_dms/patches.txt`
  - Added: `casamoderna_dms.patches.slice021_unified_sales_docs_ui_shell_phase1`

Stabilisation gate:
- `apps/casamoderna_dms/casamoderna_dms/stabilisation_gate.py`
  - Added deterministic check:
    - `B7.5A7 Slice 021 UI shell: Identity strip label mapping + Convert scripts enabled`
  - Asserts:
    - Wrapper Client Scripts are enabled and pass the expected `doctype_label` snippet
    - Slice 013 Convert scripts remain enabled (QT/SO/DN)

### Records (DB)
Updated/ensured Client Script records (enabled):
- `Quotation - CasaModerna Sales Doc Shell`
- `Sales Order - CasaModerna Sales Doc Shell`
- `Delivery Note - CasaModerna Sales Doc Shell`
- `Sales Invoice - CasaModerna Sales Doc Shell`
- `POS Invoice - CasaModerna Sales Doc Shell`
- `CM Proforma - CasaModerna Sales Doc Shell`

No DocPerm/Custom DocPerm changes (stabilisation gate continues to report `custom_docperms: 0`).

## COMMANDS (run on BOTH sites)
All commands executed from `/home/frappe/frappe/casamoderna-bench`.

Phase A audit:
- `bench --site casamoderna-staging.local execute casamoderna_dms.sales_docs_slice021_shell_audit.execute > /tmp/slice021_audit_casamoderna-staging.local_2026-03-05.json`
- `bench --site two.casamodernadms.eu execute casamoderna_dms.sales_docs_slice021_shell_audit.execute > /tmp/slice021_audit_two.casamodernadms.eu_2026-03-05.json`

Phase B apply:
- `bench --site casamoderna-staging.local migrate`
- `bench --site two.casamodernadms.eu migrate`

Phase C verify:
- `bench --site casamoderna-staging.local clear-cache`
- `bench --site two.casamodernadms.eu clear-cache`
- `bench --site casamoderna-staging.local execute casamoderna_dms.stabilisation_gate.run --kwargs '{"create_docs": 1}'`
- `bench --site two.casamodernadms.eu execute casamoderna_dms.stabilisation_gate.run --kwargs '{"create_docs": 1}'`

## RESULT
- All Sales Docs now share a consistent V1-like shell surface:
  - Compact identity strip (doctype label + V1 numbers + state/status)
  - Consistent two-column header cards
  - Items block remains the main focus
  - Bottom blocks remain grouped (Attachments left, Totals right; plus Deposit/Payment Terms for QT/SO from Slice 018)
- Convert group:
  - The existing Slice 013 Convert dropdown is visually placed in the identity strip when present.
  - No conversion logic changed; all server methods and button actions remain those provided by Slice 013.

## SUCCESS CHECKS
- Stabilisation gate GREEN on BOTH sites.
- `matrix_tests`: 139 (increased by +1 due to B7.5A7)
- `custom_docperms`: 0
- Slice 013 Convert scripts remain enabled and unaffected.

## ROLLBACK
UI-only rollback:

1) Prevent the Slice 021 wrapper patch from re-applying:
- Remove `casamoderna_dms.patches.slice021_unified_sales_docs_ui_shell_phase1` from `apps/casamoderna_dms/casamoderna_dms/patches.txt`

2) Revert wrapper Client Script content/labels (DB):
- Edit the following Client Script records to restore prior `doctype_label` values (or disable them if reverting the shell entirely):
  - `Quotation - CasaModerna Sales Doc Shell`
  - `Sales Order - CasaModerna Sales Doc Shell`
  - `Delivery Note - CasaModerna Sales Doc Shell`
  - `Sales Invoice - CasaModerna Sales Doc Shell`
  - `POS Invoice - CasaModerna Sales Doc Shell`
  - `CM Proforma - CasaModerna Sales Doc Shell`

3) If rolling back the shared shell behavior:
- Revert the code changes in:
  - `apps/casamoderna_dms/casamoderna_dms/public/js/cm_sales_doc_shell.js`
  - `apps/casamoderna_dms/casamoderna_dms/public/css/cm_sales_doc_shell.css`

4) Clear cache on each site:
- `bench --site <site> clear-cache`

Notes:
- Rollback is UI-only; it does not change numbering, conversions, workflow, pricing, guardrails, or data integrity.
