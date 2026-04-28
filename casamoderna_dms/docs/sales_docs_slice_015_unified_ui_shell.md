# CASAMODERNA ERPNext SALES DOCUMENTS — SLICE 015
Unified V1-like Sales Docs Screen Shell (QT/SO/DN/IN/POS/PF) — Common Layout + Styling

Date: 2026-03-05

## PLAN
1) Audit BOTH sites (DB/meta only; no guessing):
   - Enabled Client Scripts per target doctype
   - Presence of V1-visible numbering fields per doctype
   - Confirm Slice 013 Convert scripts still enabled
2) Implement one shared UI-only shell (single JS module + single CSS asset) loaded in desk.
3) Add thin per-doctype wrapper Client Scripts calling the shared initializer.
4) Extend stabilisation gate with deterministic assertions:
   - Shared assets present + registered
   - Wrapper Client Scripts exist + enabled for all doctypes
   - Required V1 fields exist on meta
   - Slice 013 Convert scripts remain enabled
5) Verify on BOTH sites:
   - `bench migrate`
   - `bench clear-cache`
   - stabilisation gate `run(create_docs=1)`

## CURRENT STATE FOUND
### Target doctypes (scope)
- Quotation (QT)
- Sales Order (SO)
- Delivery Note (DN)
- Sales Invoice (IN) + returns (Credit Note via Sales Invoice Return)
- POS Invoice (CS) + returns (Credit Note via POS Return)
- CM Proforma (PF)

### Before-state audit (evidence)
Read-only audit helper executed on both sites:
- `/tmp/slice015_before_casamoderna-staging.local_2026-03-05_audit.json`
- `/tmp/slice015_before_two.casamodernadms.eu_2026-03-05_audit.json`

Key findings (before):
- V1 number fields already existed on *all* target doctypes (no field creation required in Slice 015):
  - Common: `cm_v1_operational_no`, `cm_v1_draft_no`
  - Fiscal (IN/POS/CN): `cm_v1_fiscal_record_no`
- Slice 013 Convert group Client Scripts were present and enabled:
  - `Quotation - CasaModerna Conversions`
  - `Sales Order - CasaModerna Conversions`
  - `Delivery Note - CasaModerna Conversions`
- There were no existing “Sales Doc Shell” wrapper Client Scripts on any doctype.

Notes on DOM anchors:
- DOM layout cannot be audited server-side; Slice 015 uses resilient, minimal client-side selectors and does not delete any fields/sections.

## FILES / RECORDS CHANGED
### Code
Shared assets (single implementation):
- apps/casamoderna_dms/casamoderna_dms/public/js/cm_sales_doc_shell.js
- apps/casamoderna_dms/casamoderna_dms/public/css/cm_sales_doc_shell.css

Desk asset registration:
- apps/casamoderna_dms/casamoderna_dms/hooks.py
  - Added `app_include_js` + `app_include_css` entries for the shared shell.

Idempotent patch (DB records):
- apps/casamoderna_dms/casamoderna_dms/patches/slice015_unified_sales_docs_ui_shell.py
- apps/casamoderna_dms/casamoderna_dms/patches.txt
  - Registered `casamoderna_dms.patches.slice015_unified_sales_docs_ui_shell`

Stabilisation gate:
- apps/casamoderna_dms/casamoderna_dms/stabilisation_gate.py
  - Added `_slice015_unified_sales_docs_ui_shell_problems()`
  - Added new recorded check: `B7.5A3 Slice 015 UI shell: Unified Sales Docs layout wrappers enabled`

Audit helper (read-only):
- apps/casamoderna_dms/casamoderna_dms/sales_docs_slice015_audit.py

### Records (DB)
New/updated Client Script records (thin wrappers; enabled=1):
- `Quotation - CasaModerna Sales Doc Shell`
- `Sales Order - CasaModerna Sales Doc Shell`
- `Delivery Note - CasaModerna Sales Doc Shell`
- `Sales Invoice - CasaModerna Sales Doc Shell`
- `POS Invoice - CasaModerna Sales Doc Shell`
- `CM Proforma - CasaModerna Sales Doc Shell`

No DocPerm/Custom DocPerm changes (stabilisation gate continues to report `custom_docperms: 0`).

## COMMANDS
All commands executed from `/home/frappe/frappe/casamoderna-bench`.

### Phase A — audit (before)
- `bench --site casamoderna-staging.local execute "frappe.get_attr('casamoderna_dms.sales_docs_slice015_audit.audit_slice015_sales_doc_shell')" > /tmp/slice015_before_casamoderna-staging.local_2026-03-05_audit.json`
- `bench --site two.casamodernadms.eu execute "frappe.get_attr('casamoderna_dms.sales_docs_slice015_audit.audit_slice015_sales_doc_shell')" > /tmp/slice015_before_two.casamodernadms.eu_2026-03-05_audit.json`

### Phase C — verify (both sites)
Initial verify logs:
- `/tmp/slice015_verify_<site>_2026-03-05_migrate.log`
- `/tmp/slice015_verify_<site>_2026-03-05_clear_cache.log`
- `/tmp/slice015_verify_<site>_2026-03-05_stabilisation_gate.log`

After adjusting the Slice 015 gate assertion for PF meta:
- `bench --site <site> clear-cache` (logs: `/tmp/slice015_rerun_<site>_2026-03-05_clear_cache.log`)
- `bench --site <site> execute "frappe.get_attr('casamoderna_dms.stabilisation_gate.run')" --kwargs "{'create_docs': 1}"`
  - logs: `/tmp/slice015_rerun_<site>_2026-03-05_stabilisation_gate.log`

Final migrate evidence:
- `/tmp/slice015_final_casamoderna-staging.local_2026-03-05_migrate.log`
- `/tmp/slice015_final_two.casamodernadms.eu_2026-03-05_migrate.log`

### Audit (after)
- `/tmp/slice015_after_casamoderna-staging.local_2026-03-05_audit.json`
- `/tmp/slice015_after_two.casamodernadms.eu_2026-03-05_audit.json`

## RESULT
### One shared shell, consistent across all Sales Docs
- A single shared client-side initializer (`CM_SALES_DOC_SHELL_V1`) renders a unified top “identity bar” and consistent card layout on:
  - QT / SO / DN / IN / POS / PF
- Each doctype uses only a thin wrapper Client Script that calls `window.cm_sales_doc_shell.init(frm, …)`.

### Shell behaviors (UI-only)
- Top identity bar:
  - Shows doctype label (with CN label for `is_return=1` on IN/POS)
  - Shows V1 numbers:
    - `cm_v1_operational_no` when present
    - else `cm_v1_draft_no` when present
    - plus `cm_v1_fiscal_record_no` when present (IN/POS/CN)
  - Shows state pills:
    - `workflow_state` when present (SO)
    - `status` when present
  - Right-aligned quick actions:
    - `View PDF` delegates to standard print route (`/print`) without changing formats
    - `Convert` delegates to the existing Slice 013 Convert UI if present (no logic replacement)

- Two-column header cards:
  - `Customer` (left): displays existing customer/contact/address fields when present
  - `Document Info / Notes` (right): displays existing date/info/notes fields when present

- Products block:
  - Standardized “Products” title inserted immediately above the `items` grid (common across sales docs)

- Bottom row:
  - `Attachments` (left): provides a UI entrypoint to the existing attachments UI
  - `Totals` (right): displays existing totals fields when present (no recalculation)

No underlying fields/sections are deleted; this is a non-destructive visual shell.

## SUCCESS CHECKS
### Wrapper Client Scripts enabled (after-audit)
Evidence:
- `/tmp/slice015_after_casamoderna-staging.local_2026-03-05_audit.json`
- `/tmp/slice015_after_two.casamodernadms.eu_2026-03-05_audit.json`

Both sites show the shell wrapper enabled for all doctypes:
- Quotation: `Quotation - CasaModerna Sales Doc Shell`
- Sales Order: `Sales Order - CasaModerna Sales Doc Shell`
- Delivery Note: `Delivery Note - CasaModerna Sales Doc Shell`
- Sales Invoice: `Sales Invoice - CasaModerna Sales Doc Shell`
- POS Invoice: `POS Invoice - CasaModerna Sales Doc Shell`
- CM Proforma: `CM Proforma - CasaModerna Sales Doc Shell`

### Shared asset registration
- hooks include:
  - `/assets/casamoderna_dms/js/cm_sales_doc_shell.js`
  - `/assets/casamoderna_dms/css/cm_sales_doc_shell.css`

### Stabilisation gate
- GREEN on BOTH sites (see rerun gate logs):
  - `/tmp/slice015_rerun_casamoderna-staging.local_2026-03-05_stabilisation_gate.log`
  - `/tmp/slice015_rerun_two.casamodernadms.eu_2026-03-05_stabilisation_gate.log`
- Gate summary confirms:
  - `custom_docperms: 0`
  - `matrix_tests: 134` (includes `B7.5A3`)

## ROLLBACK
UI-only rollback (no business logic impact):
1) Disable/remove the wrapper Client Scripts:
   - Disable `Quotation - CasaModerna Sales Doc Shell`
   - Disable `Sales Order - CasaModerna Sales Doc Shell`
   - Disable `Delivery Note - CasaModerna Sales Doc Shell`
   - Disable `Sales Invoice - CasaModerna Sales Doc Shell`
   - Disable `POS Invoice - CasaModerna Sales Doc Shell`
   - Disable `CM Proforma - CasaModerna Sales Doc Shell`

2) Remove desk asset registration:
   - Remove `app_include_js` / `app_include_css` entries from apps/casamoderna_dms/casamoderna_dms/hooks.py

3) Optional (code cleanup):
   - Remove the shared asset files:
     - apps/casamoderna_dms/casamoderna_dms/public/js/cm_sales_doc_shell.js
     - apps/casamoderna_dms/casamoderna_dms/public/css/cm_sales_doc_shell.css

4) Optional (prevent re-creation on migrate):
   - Remove `casamoderna_dms.patches.slice015_unified_sales_docs_ui_shell` from patches.txt

5) Run on each site:
   - `bench --site <site> clear-cache`
