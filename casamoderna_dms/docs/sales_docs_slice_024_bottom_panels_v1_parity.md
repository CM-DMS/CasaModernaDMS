```markdown
# CASAMODERNA ERPNext SALES DOCUMENTS — SLICE 024
Bottom Panels V1-Parity (Attachments left, Totals right, Deposit block where applicable)

Date: 2026-03-05

## PLAN
1) Audit BOTH sites (meta only; no guessing):
   - Identify live fields/sections used for totals and deposit/payment terms
   - Identify which duplicate/noisy totals fields are still visible
2) Implement UI/meta-only changes:
   - Preserve existing unified shell bottom composition (Attachments left, Totals right)
   - Hide remaining duplicate/noisy totals fields still visible in default UI
   - Do NOT invent deposit behavior on doctypes where it is not already in the live flow
3) Extend stabilisation gate with deterministic assertions for Slice 024.
4) Verify on BOTH sites:
   - `bench migrate`
   - `bench clear-cache`
   - stabilisation gate `run(create_docs=1)`

## CURRENT STATE FOUND (BEFORE)
### Sites
- casamoderna-staging.local
- two.casamodernadms.eu

Note: both sites currently point at the same DB (`db_name` identical), so results are expected to match.

### Phase A — audit evidence (before)
Read-only audit helper executed on both sites:
- `/tmp/slice024_phaseA_like_slice018_casamoderna-staging.local_2026-03-05.json`
- `/tmp/slice024_phaseA_like_slice018_two.casamodernadms.eu_2026-03-05.json`

### Bottom panel composition (as implemented in live system)
The V1-like bottom area is rendered by the **Unified Sales Docs shell** (`CM_SALES_DOC_SHELL_V1`):
- Bottom-left: `Attachments` card (delegates to the standard attachments UI)
- Bottom-right: `Totals` card (Net Excl VAT / VAT / Grand Total)
- Bottom-right (lower, where applicable): `Deposit / Payment Terms` card

Deposit block behavior (no invention):
- Implemented only for Quotation + Sales Order, using the existing `payment_schedule` table and (where present) `payment_terms_template`.
- No deposit UI is introduced on DN/IN/POS/PF.

### BEFORE — per-doctype bottom-panel meta matrix (deterministic)
(Visible = `hidden=0` in DocType meta; shell rendering remains unchanged.)

Legend:
- Totals stack fields (preferred): `net_total`, `total_taxes_and_charges`, `grand_total`
- Deposit/payment terms anchors: `payment_schedule` (QT/SO only)
- Noisy duplicates to hide: `rounded_total`, `base_*` totals duplicates

Quotation (QT)
- Attachments: via shell card (no Attach fields on doctype)
- Totals: `net_total`, `total_taxes_and_charges`, `grand_total` visible
- Deposit area: `payment_schedule` present + visible
- Clutter still visible: `rounded_total` (visible)

Sales Order (SO)
- Attachments: via shell card (no Attach fields on doctype)
- Totals: `net_total`, `total_taxes_and_charges`, `grand_total` visible
- Deposit area: `payment_schedule` present + visible
- Clutter still visible: `rounded_total` (visible)

Delivery Note (DN)
- Attachments: via shell card
- Totals: `net_total`, `total_taxes_and_charges`, `grand_total` visible
- Deposit: not applicable (no deposit UI introduced)
- Clutter still visible: `rounded_total` (visible)

Sales Invoice (IN)
- Attachments: via shell card
- Totals: `net_total`, `total_taxes_and_charges`, `grand_total` visible
- Deposit: not applicable (no deposit UI introduced)
- Clutter still visible: `rounded_total` (visible), `base_net_total` (visible)

POS Invoice (CS)
- Attachments: via shell card
- Totals: `net_total`, `total_taxes_and_charges`, `grand_total` visible
- Deposit: not applicable (no deposit UI introduced)
- Clutter still visible: `rounded_total` (visible), `base_net_total` (visible)

CM Proforma (PF)
- Attachments: via shell card
- Totals: `net_total`, `total_taxes_and_charges`, `grand_total` visible
- Deposit: not applicable (no deposit UI introduced)
- Clutter still visible: `rounded_total` (visible)

## FILES / RECORDS CHANGED
### Code
Idempotent patch (meta-only):
- `apps/casamoderna_dms/casamoderna_dms/patches/slice024_sales_docs_bottom_panels_v1_parity.py`

Patch registration:
- `apps/casamoderna_dms/casamoderna_dms/patches.txt`
  - Added: `casamoderna_dms.patches.slice024_sales_docs_bottom_panels_v1_parity`

Stabilisation gate:
- `apps/casamoderna_dms/casamoderna_dms/stabilisation_gate.py`
  - Added `_slice024_sales_docs_bottom_panels_v1_parity_problems()`
  - Wired recorded check:
    - `B7.5A9 Slice 024 UI meta: Sales Docs bottom panels V1-parity`

### Records (DB)
Property Setter records (`DocField.hidden`) created/updated for target doctypes where fields exist:
- Hidden duplicates/noise (UI only):
  - `rounded_total`
  - `base_net_total`
  - `base_total_taxes_and_charges`
  - `base_grand_total`
  - `base_rounded_total`

No DocPerm/Custom DocPerm changes (stabilisation gate continues to report `custom_docperms: 0`).

## COMMANDS
All commands executed from `/home/frappe/frappe/casamoderna-bench`.

### Phase A — Audit (before)
- `bench --site casamoderna-staging.local execute casamoderna_dms.sales_docs_slice018_totals_bottom_panel_audit.audit_sales_docs_slice018_totals_bottom_panel > /tmp/slice024_phaseA_like_slice018_casamoderna-staging.local_2026-03-05.json`
- `bench --site two.casamodernadms.eu execute casamoderna_dms.sales_docs_slice018_totals_bottom_panel_audit.audit_sales_docs_slice018_totals_bottom_panel > /tmp/slice024_phaseA_like_slice018_two.casamodernadms.eu_2026-03-05.json`

### Phase B — Apply (migrate)
- staging: `/tmp/slice024_verify_casamoderna-staging.local_2026-03-05_migrate.log`
- two: `/tmp/slice024_verify_two.casamodernadms.eu_2026-03-05_migrate.log`

### Phase C — Verify (clear cache + after audit + stabilisation gate)
Clear cache logs:
- staging: `/tmp/slice024_verify_casamoderna-staging.local_2026-03-05_clear_cache.log`
- two: `/tmp/slice024_verify_two.casamodernadms.eu_2026-03-05_clear_cache.log`

After-state audit evidence:
- `/tmp/slice024_phaseA_like_slice018_after_casamoderna-staging.local_2026-03-05.json`
- `/tmp/slice024_phaseA_like_slice018_after_two.casamodernadms.eu_2026-03-05.json`

Stabilisation gate logs:
- staging: `/tmp/slice024_stab_gate_casamoderna-staging.local_2026-03-05.log`
- two: `/tmp/slice024_stab_gate_two.casamodernadms.eu_2026-03-05.log`

## RESULT (AFTER)
### Target bottom-panel rules achieved
- Bottom-left: Attachments access remains in the unified shell.
- Bottom-right: Totals stack remains compact and V1-like:
  - Net Excl VAT (`net_total`)
  - VAT (`total_taxes_and_charges`)
  - Grand Total (`grand_total`)
- Deposit/payment terms block remains attached under totals only where it already exists in live flow:
  - Quotation + Sales Order using `payment_schedule` (no change to logic).

### AFTER — per-doctype bottom-panel meta matrix
Quotation (QT)
- Totals fields visible: `net_total`, `total_taxes_and_charges`, `grand_total`
- Deposit/payment terms: `payment_schedule` present + visible
- Duplicate totals clutter hidden: `rounded_total` hidden

Sales Order (SO)
- Totals fields visible: `net_total`, `total_taxes_and_charges`, `grand_total`
- Deposit/payment terms: `payment_schedule` present + visible
- Duplicate totals clutter hidden: `rounded_total` hidden

Delivery Note (DN)
- Totals fields visible: `net_total`, `total_taxes_and_charges`, `grand_total`
- Duplicate totals clutter hidden: `rounded_total` hidden

Sales Invoice (IN)
- Totals fields visible: `net_total`, `total_taxes_and_charges`, `grand_total`
- Duplicate totals clutter hidden: `rounded_total` hidden, `base_net_total` hidden

POS Invoice (CS)
- Totals fields visible: `net_total`, `total_taxes_and_charges`, `grand_total`
- Duplicate totals clutter hidden: `rounded_total` hidden, `base_net_total` hidden

CM Proforma (PF)
- Totals fields visible: `net_total`, `total_taxes_and_charges`, `grand_total`
- Duplicate totals clutter hidden: `rounded_total` hidden

## SUCCESS CHECKS
### Stabilisation gate
GREEN on BOTH sites (exit code 0):
- staging: `/tmp/slice024_stab_gate_casamoderna-staging.local_2026-03-05.log`
- two: `/tmp/slice024_stab_gate_two.casamodernadms.eu_2026-03-05.log`

Gate confirms:
- `custom_docperms: 0`
- Includes deterministic meta assertion `B7.5A9` for Slice 024.

### Deterministic meta assertions (Slice 024)
`B7.5A9` asserts:
- Core totals fields are present and not hidden on all target doctypes.
- Duplicate totals clutter fields (`rounded_total`, `base_*` totals duplicates) are hidden where present.

No calculations changed; this is UI/meta-only.

## ROLLBACK
UI-only rollback (meta only; no data loss):

1) Prevent re-application:
- Remove `casamoderna_dms.patches.slice024_sales_docs_bottom_panels_v1_parity` from `apps/casamoderna_dms/casamoderna_dms/patches.txt`

2) Revert Property Setters created by this slice:
- Delete (or set value to `0`) DocField Property Setters of the form:
  - `<DocType>-rounded_total-hidden`
  - `<DocType>-base_net_total-hidden`
  - `<DocType>-base_total_taxes_and_charges-hidden`
  - `<DocType>-base_grand_total-hidden`
  - `<DocType>-base_rounded_total-hidden`

3) Run on each site:
- `bench --site <site> clear-cache`

Notes:
- Rollback restores the default field visibility; it does not modify any totals math, tax logic, or deposit logic.

```