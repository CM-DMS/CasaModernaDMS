# Slice 009 — Surface V1-Visible Numbers in UI (List + Preview/Header)

Date: 2026-03-05

Scope: **UI-only metadata visibility** for existing V1-number fields on Sales Documents on BOTH sites:
- `casamoderna-staging.local`
- `two.casamodernadms.eu`

Target doctypes:
- Quotation
- Sales Order
- Delivery Note
- Sales Invoice (incl. Credit Note / Return path)
- POS Invoice

Hard constraints (Slice 009):
- **NO numbering logic changes** (no autoname changes, no submit hooks, no naming series changes).
- **NO print format changes**.
- **NO permission / DocPerm / Custom DocPerm changes**.
- UI-only: adjust metadata flags so fields appear in **List View** and **Preview/Header** surfaces.
- Stabilisation gate must stay **GREEN** on both sites.

---

## PLAN
- Audit current UI meta for the V1-number fields using authoritative DB metadata exports.
- Implement an idempotent patch that only adjusts `tabCustom Field` visibility flags.
- Add a deterministic stabilisation gate assertion so the desired UI meta state is continuously enforced.
- Run the required verify sequence on BOTH sites: `migrate` → `clear-cache` → stabilisation gate `run(create_docs=1)`.

---

## CURRENT STATE FOUND (BEFORE)

### Evidence capture method (authoritative)
All “before” state for this slice was captured from live DB metadata (not screenshots):
- `tabCustom Field` for `cm_v1_*` fields on target doctypes
- `tabProperty Setter` affecting those fields (none in scope)
- `tabList View Settings` for those doctypes (none in scope)

Before-state evidence artifacts (per-site TSV exports):
- `/tmp/slice009_v1_numbers_ui_audit_casamoderna-staging.local_2026-03-05.tsv`
- `/tmp/slice009_v1_numbers_ui_audit_two.casamodernadms.eu_2026-03-05.tsv`

Summary (before):
- The fields existed and were **read-only / not hidden**, but were **not surfaced**:
  - `in_preview=0` (so not visible in preview/header)
  - `in_list_view=0` (so not visible in list view)
  - `depends_on` was empty (so no conditional compact header strip)

---

## IMPLEMENTATION (UI-ONLY)

### Intended UI behavior (minimal clutter)
Because List View columns are not conditional, we chose a minimal “signal” set:
- **Preview/Header surface**
  - Draft: show `cm_v1_draft_no` only when `docstatus == 0` and value exists.
  - Submitted: show `cm_v1_operational_no` only when `docstatus == 1` and value exists.
  - Fiscal doctypes: also show `cm_v1_fiscal_record_no` only when `docstatus == 1` and value exists.
- **List View**
  - Show `cm_v1_operational_no` on all target doctypes.
  - Show `cm_v1_fiscal_record_no` on Sales Invoice and POS Invoice.
  - Do **not** show `cm_v1_draft_no` in list view to avoid “double-number noise”.

### Metadata rules applied (expected values)
- `cm_v1_draft_no`
  - `in_preview=1`
  - `in_list_view=0`
  - `depends_on=eval:doc.docstatus==0 and doc.cm_v1_draft_no`
- `cm_v1_operational_no`
  - `in_preview=1`
  - `in_list_view=1`
  - `depends_on=eval:doc.docstatus==1 and doc.cm_v1_operational_no`
- `cm_v1_fiscal_record_no` (Sales Invoice, POS Invoice)
  - `in_preview=1`
  - `in_list_view=1`
  - `depends_on=eval:doc.docstatus==1 and doc.cm_v1_fiscal_record_no`

---

## FILES / RECORDS CHANGED

### Code changes
- Added UI-only patch:
  - `apps/casamoderna_dms/casamoderna_dms/patches/slice009_v1_numbers_ui_visibility.py`
- Registered patch:
  - `apps/casamoderna_dms/casamoderna_dms/patches.txt`
- Added deterministic stabilisation assertion:
  - `apps/casamoderna_dms/casamoderna_dms/stabilisation_gate.py`
    - Helper: `_v1_numbers_ui_visibility_problems()`
    - Test record: `B7.5A Slice 009 UI meta: V1 number fields visible (list + preview)`

### DB records changed (UI-only)
- Updated existing rows in `tabCustom Field` for these doctypes/fieldnames:
  - Quotation: `cm_v1_draft_no`, `cm_v1_operational_no`
  - Sales Order: `cm_v1_draft_no`, `cm_v1_operational_no`
  - Delivery Note: `cm_v1_draft_no`, `cm_v1_operational_no`
  - Sales Invoice: `cm_v1_draft_no`, `cm_v1_operational_no`, `cm_v1_fiscal_record_no`
  - POS Invoice: `cm_v1_draft_no`, `cm_v1_operational_no`, `cm_v1_fiscal_record_no`

Explicit non-changes (guardrails):
- `tabCustom DocPerm` remained **0 rows** on BOTH sites.
  - Evidence: `/tmp/slice009_custom_docperm_count_2026-03-05.txt`

---

## AFTER STATE (EVIDENCE)

After-state evidence artifacts (per-site TSV exports):
- `/tmp/slice009_v1_numbers_ui_after_casamoderna-staging.local_2026-03-05.tsv`
- `/tmp/slice009_v1_numbers_ui_after_two.casamodernadms.eu_2026-03-05.tsv`

These exports prove (per field, per doctype):
- `in_preview=1`
- `in_list_view` set as specified (operational/fiscal shown; draft not shown)
- `depends_on` set to the compact “draft vs submitted” rules
- safety invariants retained: `hidden=0`, `read_only=1`

---

## COMMANDS RUN (VERIFY SEQUENCE, BOTH SITES)

Commands (run per-site):
- `bench --site <site> migrate`
- `bench --site <site> clear-cache`
- `bench --site <site> execute casamoderna_dms.stabilisation_gate.run --kwargs "{'create_docs': 1}"`

Verify logs (required sequence, both sites):
- Staging migrate log: `/tmp/slice009_verify_casamoderna-staging.local_2026-03-05_migrate.log`
- Staging clear-cache log: `/tmp/slice009_verify_casamoderna-staging.local_2026-03-05_clear_cache.log`
- Staging stabilisation gate log: `/tmp/slice009_verify_casamoderna-staging.local_2026-03-05_stabilisation_gate.log`
- Site two migrate log: `/tmp/slice009_verify_two.casamodernadms.eu_2026-03-05_migrate.log`
- Site two clear-cache log: `/tmp/slice009_verify_two.casamodernadms.eu_2026-03-05_clear_cache.log`
- Site two stabilisation gate log: `/tmp/slice009_verify_two.casamodernadms.eu_2026-03-05_stabilisation_gate.log`

---

## STABILISATION GATE PROOF (DETERMINISTIC)

Important note: the stabilisation gate prints only a summary JSON to stdout and writes the full test matrix to JSON.
The Slice 009 assertion is enforced as a **deterministic test matrix record**.

### Gate matrix JSON paths (written by stabilisation gate)
- Staging matrix: `./sites/casamoderna-staging.local/private/files/cm_stabilisation/matrix_2026-03-05.json`
- Site two matrix: `./sites/two.casamodernadms.eu/private/files/cm_stabilisation/matrix_2026-03-05.json`

### Extracted B7.5A proof artifacts (greppable)
- Staging: `/tmp/slice009_matrix_b7_5a_casamoderna-staging.local_2026-03-05.json`
- Site two: `/tmp/slice009_matrix_b7_5a_two.casamodernadms.eu_2026-03-05.json`

Both artifacts contain:
- `"test": "B7.5A Slice 009 UI meta: V1 number fields visible (list + preview)"`
- `"ok": true`
- `"problems": []`

---

## RESULT

Slice 009 is complete:
- All target doctypes now surface the V1-number fields in:
  - **Preview/Header** (via `in_preview=1` + conditional `depends_on`)
  - **List View** (via `in_list_view=1` for operational/fiscal as specified)
- The change is **UI-only** (metadata on existing Custom Fields).
- Stabilisation gate stays GREEN and includes deterministic proof (`B7.5A`) on both sites.

---

## SUCCESS CHECKS

Required checks (pass conditions):
- Both sites: `tabCustom DocPerm` stays at 0 rows (no permission shadow layer) → PASS
- Both sites: after-state TSVs match expected flags (`in_preview`, `in_list_view`, `depends_on`, `hidden`, `read_only`) → PASS
- Both sites: stabilisation gate matrix contains `B7.5A ... ok=true` → PASS

---

## ROLLBACK

If rollback is required:
1. Remove (or comment out) the patch entry in `apps/casamoderna_dms/casamoderna_dms/patches.txt`:
   - `casamoderna_dms.patches.slice009_v1_numbers_ui_visibility`
2. Revert the affected `tabCustom Field` flags back to the before-state (as captured in the before TSV exports):
   - Set `in_preview=0`, `in_list_view=0`, `depends_on=NULL` for the impacted `cm_v1_*` fields on the target doctypes.
3. Run the verify sequence per-site again (`migrate` → `clear-cache` → gate run) to confirm the system is coherent.
