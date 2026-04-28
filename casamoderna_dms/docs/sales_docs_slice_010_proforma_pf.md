# Slice 010 — Proforma (PF) as a First-Class Non-Fiscal Bank Document

Date: 2026-03-05

Scope: Implement an ERPNext-first Proforma artifact **CM Proforma** (PF) on BOTH sites:
- `casamoderna-staging.local`
- `two.casamodernadms.eu`

Hard constraints (Slice 010):
- PF is **NOT** Sales Invoice / POS Invoice.
- PF is **non-fiscal**: **no fiscal record number**.
- PF must create **no GL Entry** and **no Stock Ledger Entry** deltas.
- No changes to existing QT/SO/DN/SI/POS numbering behaviors.
- No Custom DocPerm usage / no permission weakening.
- Stabilisation gate must stay **GREEN** on both sites and include deterministic PF proofs.

---

## IMPLEMENTATION SUMMARY

### Data model (ERPNext-first)
- New DocTypes (code-defined in app):
  - `CM Proforma` (parent)
  - `CM Proforma Item` (child table)
- PF is intentionally **non-submittable**; operational numbering is assigned via an explicit **Issue** action.

### Creation entry points (UI)
- Quotation form button: **Create Proforma (PF)**
- Sales Order form button: **Create Proforma (PF)**

These buttons call server methods that create PF idempotently (one PF per source):
- `casamoderna_dms.proforma_pf.create_proforma_from_quotation`
- `casamoderna_dms.proforma_pf.create_proforma_from_sales_order`

### Numbering (V1-visible)
- Draft number (on validate/insert): `PF-DRAFT-YYYYMMDDHHMMSS`
- Operational number (on Issue): `PF 000001`
- No fiscal number field is created for PF.

Implementation approach:
- PF draft uses existing validate hook (`apply_v1_draft_number`).
- PF operational uses a new helper that assigns operational number **without submit**, used only by PF.

### Print format
- Print Format: `CasaModerna Proforma`
- Set as default print format for DocType `CM Proforma`.

---

## FILES / RECORDS CHANGED

### New / updated code
- New server module: `apps/casamoderna_dms/casamoderna_dms/proforma_pf.py`
- Updated V1 numbering framework:
  - `apps/casamoderna_dms/casamoderna_dms/v1_numbering.py`
- Updated hook wiring:
  - `apps/casamoderna_dms/casamoderna_dms/hooks.py`
- New DocTypes (code-defined):
  - `apps/casamoderna_dms/casamoderna_dms/casamoderna_dms/doctype/cm_proforma/`
  - `apps/casamoderna_dms/casamoderna_dms/casamoderna_dms/doctype/cm_proforma_item/`
- Updated stabilisation gate:
  - `apps/casamoderna_dms/casamoderna_dms/stabilisation_gate.py`

### Idempotent patch (DB records)
- Patch file:
  - `apps/casamoderna_dms/casamoderna_dms/patches/slice010_proforma_pf.py`
- Registered in:
  - `apps/casamoderna_dms/casamoderna_dms/patches.txt`

Patch responsibilities:
- Ensure PF V1-number custom fields exist and are surfaced in preview/list.
- Create the QT/SO client scripts for PF creation buttons.
- Create Print Format `CasaModerna Proforma` and set as DocType default.

Explicit non-changes (guardrails):
- `tabCustom DocPerm` remains **0 rows** on both sites (proven by stabilisation inventory counts).

---

## STABILISATION GATE PROOF (DETERMINISTIC)

### What is asserted
New deterministic PF assertions in the matrix (all must be `ok=true`):
- PF is non-submittable
- PF create-from-Quotation is idempotent
- PF draft number format on insert
- PF operational number format on Issue
- No fiscal field exists for PF
- Issue does not submit PF
- PF print format renders
- No GL Entry / Stock Ledger Entry created for voucher_type `CM Proforma`

### Gate matrix JSON paths (written by stabilisation gate)
- Staging matrix: `./sites/casamoderna-staging.local/private/files/cm_stabilisation/matrix_2026-03-05.json`
- Site two matrix: `./sites/two.casamodernadms.eu/private/files/cm_stabilisation/matrix_2026-03-05.json`

### Extracted PF proof artifacts (greppable)
- Staging PF records: `/tmp/slice010_matrix_pf_casamoderna-staging.local_2026-03-05.json`
- Site two PF records: `/tmp/slice010_matrix_pf_two.casamodernadms.eu_2026-03-05.json`

---

## COMMANDS RUN (VERIFY SEQUENCE, BOTH SITES)

Commands (run per-site):
- `bench --site <site> migrate`
- `bench --site <site> clear-cache`
- `bench --site <site> execute casamoderna_dms.stabilisation_gate.run --kwargs "{'create_docs': 1}"`

Verify logs:
- Staging migrate log: `/tmp/slice010_verify_casamoderna-staging.local_2026-03-05_migrate_2.log`
- Staging clear-cache log: `/tmp/slice010_verify_casamoderna-staging.local_2026-03-05_clear_cache.log`
- Staging stabilisation gate log: `/tmp/slice010_verify_casamoderna-staging.local_2026-03-05_stabilisation_gate_2.log`
- Site two migrate log: `/tmp/slice010_verify_two.casamodernadms.eu_2026-03-05_migrate.log`
- Site two clear-cache log: `/tmp/slice010_verify_two.casamodernadms.eu_2026-03-05_clear_cache.log`
- Site two stabilisation gate log: `/tmp/slice010_verify_two.casamodernadms.eu_2026-03-05_stabilisation_gate.log`

---

## RESULT

Slice 010 is complete:
- A dedicated **CM Proforma (PF)** record exists as a first-class DocType.
- PF is created from **Quotation** and **Sales Order** via UI buttons.
- PF supports V1-visible numbering:
  - Draft: `PF-DRAFT-YYYYMMDDHHMMSS`
  - Operational: `PF 000001` (on Issue)
- PF remains **non-fiscal** and produces **no GL Entry / no Stock Ledger Entry**.
- Stabilisation gate remains green on both sites and now enforces PF invariants.

---

## ROLLBACK

If rollback is required:
1. Remove (or comment out) the patch entry in `apps/casamoderna_dms/casamoderna_dms/patches.txt`:
   - `casamoderna_dms.patches.slice010_proforma_pf`
2. Remove the DB records created by the patch (if required):
   - Print Format `CasaModerna Proforma`
   - Client Scripts:
     - `Quotation - CasaModerna Proforma (PF)`
     - `Sales Order - CasaModerna Proforma (PF)`
3. If removing the feature entirely, delete the DocTypes (only if explicitly intended) and re-run migrations.
4. Run the verify sequence again per-site (`migrate` → `clear-cache` → gate run).
