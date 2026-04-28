# Slice 006 — Cash Sale (CS) + Credit Note Return (CN) Flow Guardrails + V1-visible Numbering Proof

Date: 2026-03-05

## PLAN
- Determine the real cash sale implementation path in live ERPNext (no guessing).
- Implement an ERPNext-first cash sale path without weakening existing Sales Invoice derived-only guardrails.
- Add guardrails for cash-sale returns (credit notes) so orphan returns are blocked.
- Extend stabilisation gate with deterministic CS/CN creation + numbering assertions.
- Verify the full sequence on BOTH sites and keep gate GREEN.

## CURRENT STATE FOUND
- ERPNext cash-sale DocType `POS Invoice` is present and already wired into V1 numbering hooks.
- Both sites had **0** `POS Profile` records, which blocks POS Invoice flows from validating/submitting in standard ERPNext usage.
- ERPNext canonical return builder for POS cash sale returns exists (`make_sales_return` in POS Invoice implementation).

## FILES / RECORDS CHANGED

### Files changed / added
- Added: [apps/casamoderna_dms/casamoderna_dms/cash_sale_guardrails.py](../cash_sale_guardrails.py)
  - POS Invoice return guardrail: return docs must have `return_against` pointing at a submitted cash sale.
- Added: [apps/casamoderna_dms/casamoderna_dms/patches/slice006_seed_pos_profile.py](../patches/slice006_seed_pos_profile.py)
  - Idempotent patch that creates a minimal POS Profile only if none exist.
- Updated: [apps/casamoderna_dms/casamoderna_dms/hooks.py](../hooks.py)
  - Wires the guardrail into `POS Invoice.validate`.
- Updated: [apps/casamoderna_dms/casamoderna_dms/patches.txt](../patches.txt)
  - Registers the Slice 006 patch.
- Updated: [apps/casamoderna_dms/casamoderna_dms/stabilisation_gate.py](../stabilisation_gate.py)
  - Adds deterministic CS/CN proofs (B7.12–B7.20) using POS Invoice + POS return.

### Records created (persistent)
- `POS Profile`: `CasaModerna POS`
  - Created only when no POS Profile exists on the site.
  - Minimal configuration: company default, a warehouse, write-off account/cost center, and `Cash` as the default payment method.

## IMPLEMENTATION NOTES (CONSTRAINTS)
- No naming series changes: numbering remains via V1-visible custom fields (`cm_v1_*`) and does not modify ERPNext autoname/naming series.
- No weakening of existing guardrails:
  - Sales Invoice “derived-only” enforcement remains unchanged.
- No `Custom DocPerm` changes.

## STABILISATION GATE PROOFS
Added to the matrix:
- **B7.12** POS Profile exists (required for CS/CN)
- **B7.13** POS Opening Entry open (admin) (created deterministically when missing)
- **B7.14–B7.16** Cash Sale POS Invoice numbering proof:
  - Draft: `CS-DRAFT-\d{14}`
  - Operational on submit: `CS \d{6}`
  - Fiscal record on submit: `\d{4}-\d{6}`
- **B7.17–B7.19** POS return (Credit Note) numbering proof:
  - Draft: `CN-DRAFT-\d{14}`
  - Operational on submit: `CN \d{6}`
  - Fiscal record on submit: `\d{4}-\d{6}`
- **B7.20** Negative proof: orphan POS return is blocked by guardrail

Matrix evidence JSON paths (auto-written by the gate):
- Staging: `sites/casamoderna-staging.local/private/files/cm_stabilisation/matrix_2026-03-05.json`
- Site two: `sites/two.casamodernadms.eu/private/files/cm_stabilisation/matrix_2026-03-05.json`

## COMMANDS (VERIFICATION SEQUENCE)
Executed on BOTH sites:

### casamoderna-staging.local
- `bench --site casamoderna-staging.local migrate`
- `bench --site casamoderna-staging.local clear-cache`
- `bench --site casamoderna-staging.local execute casamoderna_dms.stabilisation_gate.run --kwargs "{'create_docs': 1}"`

### two.casamodernadms.eu
- `bench --site two.casamodernadms.eu migrate`
- `bench --site two.casamodernadms.eu clear-cache`
- `bench --site two.casamodernadms.eu execute casamoderna_dms.stabilisation_gate.run --kwargs "{'create_docs': 1}"`

## RESULT
- Stabilisation gate: GREEN on BOTH sites.
- CS/CN proofs: present and passing (B7.12–B7.20) on BOTH sites.
- Existing derived-only guardrails: unchanged and still enforced.

## SUCCESS CHECKS
- `POS Profile` exists (created only if previously absent).
- Creating/submitting a POS Invoice cash sale produces V1-visible numbers:
  - `cm_v1_operational_no` like `CS 000001`
  - `cm_v1_fiscal_record_no` like `2026-000001`
- Creating/submitting a POS return against that cash sale produces V1-visible numbers:
  - `cm_v1_operational_no` like `CN 000001`
  - `cm_v1_fiscal_record_no` like `2026-000001`
- Attempting to create a POS return without `return_against` fails.

## ROLLBACK
- Code rollback: revert the changes in the files listed above and run `bench --site <site> migrate` + `clear-cache`.
- Data rollback (if you want to remove the seeded POS setup): delete `POS Profile` = `CasaModerna POS` (only if safe operationally) and ensure no dependent POS Opening Entries exist.
