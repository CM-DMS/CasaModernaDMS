# Slice 007 — Sales Invoice → Credit Note (CN) Flow Guardrails + V1-visible Numbering Proof

Date: 2026-03-05

## PLAN
- Audit the **live** ERPNext Sales Invoice return mechanism on BOTH sites (no guessing): fieldnames + linkage.
- Implement hard server-side guardrails so **Sales Invoice Credit Notes (returns)** can only be created/submitted against an **existing submitted Sales Invoice (IN)**.
- Prove V1-visible numbering for **IN** and **CN** (operational + fiscal), and add negative proofs for orphan / invalid CN.
- Keep stabilisation gate GREEN on BOTH sites.

## CURRENT STATE FOUND

### Live ERPNext return fields (audited on BOTH sites)
From `tabDocField` for `Sales Invoice`:
- `is_return` (Check)
- `return_against` (Link → `Sales Invoice`)
- `is_pos` (Check)

This confirms the canonical linkage for Sales Invoice returns is:
- CN is `Sales Invoice` with `is_return = 1`
- CN links to base IN via `return_against = <Sales Invoice name>`

### Existing CasaModerna guardrail (pre Slice 007)
- [apps/casamoderna_dms/casamoderna_dms/sales_console.py](../sales_console.py)
  - `validate_derived_only_sales_invoice` blocks direct Sales Invoice creation.
  - For returns, it only enforced: `is_return => return_against must be set`.
  - It did **not** enforce: base existence, base submitted, base not-a-return, or IN-only.

### Existing V1-visible numbering coverage (pre Slice 007)
- Sales Invoice and Credit Note numbering hooks already existed:
  - `cm_v1_operational_no` and `cm_v1_fiscal_record_no` set on submit.
  - Proof tests existed (Slice 005), but Slice 007 required additional guardrail negatives.

### Placeholder bans alignment (audit)
- There is **no** Sales Invoice-specific placeholder ban in the existing server-side guardrails.
- Therefore Slice 007 does **not** introduce any placeholder-only behavior changes; CN uses the same Sales Invoice item rules as IN.

## FILES / RECORDS CHANGED

### Files changed / added
- Added: [apps/casamoderna_dms/casamoderna_dms/invoice_credit_note_guardrails.py](../invoice_credit_note_guardrails.py)
  - Enforces CN rules for `Sales Invoice` returns:
    - `return_against` must be set
    - must reference an existing Sales Invoice
    - base must be `docstatus=1` (submitted)
    - base must not itself be a return
    - base must be **IN-only** (`is_pos=0`); Cash Sale returns are handled via POS Invoice (Slice 006)
- Updated: [apps/casamoderna_dms/casamoderna_dms/hooks.py](../hooks.py)
  - Wires guardrail into **Sales Invoice** lifecycle:
    - `before_validate` (pre-ERPNext validate)
    - `validate` (defense-in-depth)
    - `before_submit` (submit-time enforcement)
- Updated: [apps/casamoderna_dms/casamoderna_dms/stabilisation_gate.py](../stabilisation_gate.py)
  - Adds deterministic negative guardrail proofs:
    - B7.21 orphan CN blocked (`return_against` blank)
    - B7.22 CN blocked (`return_against` non-existent)
    - B7.23 CN blocked (`return_against` draft IN)

### Records changed
- None (no DocPerm/Role changes; `tabCustom DocPerm` remains 0).

## COMMANDS

### Field audit (both sites)
- `bench --site casamoderna-staging.local mariadb -e "select fieldname, fieldtype, options, reqd from tabDocField where parent='Sales Invoice' and fieldname in ('is_return','return_against','is_pos') order by fieldname;"`
- `bench --site two.casamodernadms.eu mariadb -e "select fieldname, fieldtype, options, reqd from tabDocField where parent='Sales Invoice' and fieldname in ('is_return','return_against','is_pos') order by fieldname;"`

### Verify sequence (required) — BOTH sites
#### casamoderna-staging.local
- `bench --site casamoderna-staging.local migrate`
- `bench --site casamoderna-staging.local clear-cache`
- `bench --site casamoderna-staging.local execute casamoderna_dms.stabilisation_gate.run --kwargs "{'create_docs': 1}"`

#### two.casamodernadms.eu
- `bench --site two.casamodernadms.eu migrate`
- `bench --site two.casamodernadms.eu clear-cache`
- `bench --site two.casamodernadms.eu execute casamoderna_dms.stabilisation_gate.run --kwargs "{'create_docs': 1}"`

## RESULT
- Stabilisation gate is GREEN on BOTH sites.
- IN → CN positive flow passes.
- Orphan/invalid CN flows are blocked deterministically.

## SUCCESS CHECKS

### Guardrails
- CN (`Sales Invoice.is_return=1`) is blocked unless:
  - `return_against` is set
  - base invoice exists
  - base invoice is submitted (`docstatus=1`)
  - base invoice is not a return
  - base invoice is IN-only (`is_pos=0`)

### V1-visible numbering proofs (examples from gate evidence)
- Staging examples (matrix):
  - IN operational: `IN 000008`
  - IN fiscal: `2026-000024`
  - CN operational: `CN 000012`
  - CN fiscal: `2026-000025`
- Site two examples (matrix):
  - IN operational: `IN 000009`
  - IN fiscal: `2026-000028`
  - CN operational: `CN 000014`
  - CN fiscal: `2026-000029`

### Stabilisation matrix evidence
- Staging: `sites/casamoderna-staging.local/private/files/cm_stabilisation/matrix_2026-03-05.json`
- Site two: `sites/two.casamodernadms.eu/private/files/cm_stabilisation/matrix_2026-03-05.json`

New tests:
- B7.21 Guardrail: orphan CN blocked (blank return_against)
- Expected message (custom): `Credit Note must be created as a return against an existing Sales Invoice.`
- B7.22 Guardrail: CN blocked (return_against non-existent)
  - Note: ERPNext may raise core deterministic error `Could not find Return Against: ...` before custom hook.
- B7.23 Guardrail: CN blocked (return_against draft IN)
- Expected message (custom): `Credit Note must be created against a submitted Sales Invoice (not Draft/Cancelled).`

## ROLLBACK
- Revert code changes in:
  - [apps/casamoderna_dms/casamoderna_dms/invoice_credit_note_guardrails.py](../invoice_credit_note_guardrails.py)
  - [apps/casamoderna_dms/casamoderna_dms/hooks.py](../hooks.py)
  - [apps/casamoderna_dms/casamoderna_dms/stabilisation_gate.py](../stabilisation_gate.py)
- Then run on each site:
  - `bench --site <site> migrate`
  - `bench --site <site> clear-cache`
