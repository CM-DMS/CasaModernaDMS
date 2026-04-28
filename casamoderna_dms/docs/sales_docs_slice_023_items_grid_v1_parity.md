```markdown
# CASAMODERNA ERPNext SALES DOCUMENTS — SLICE 023
Items Grid V1-Parity (Authoritative Visible Columns + Order)

Date: 2026-03-05

## PLAN
1) Audit BOTH sites (meta only; no guessing):
   - Identify the child table doctype used by each Sales Doc `items` grid
   - Capture visible grid columns (`in_list_view=1` and `hidden=0`)
2) Implement meta-only changes on the child table doctypes:
   - Enforce authoritative visible columns + order via Property Setters
   - No DocPerm/Role changes
   - No pricing/tax logic changes
3) Extend stabilisation gate:
   - Deterministic assertion that visible grid columns match targets per child doctype (exact order)
   - Assert critical fields still exist (we only change visibility/order)
4) Verify on BOTH sites:
   - `bench migrate`
   - `bench clear-cache`
   - stabilisation gate `run(create_docs=1)`

## SITES
- casamoderna-staging.local
- two.casamodernadms.eu

Note: both sites currently point at the same DB (`db_name` identical), so results are expected to match.

## PHASE A — AUDIT EVIDENCE (BEFORE)
Read-only audit executed on both sites:
- `/tmp/slice023_items_grid_before_casamoderna-staging.local_2026-03-05_audit.json`
- `/tmp/slice023_items_grid_before_two.casamodernadms.eu_2026-03-05_audit.json`

### Child table doctypes used by each Sales Doc
(Identical on both sites)
- Quotation → `Quotation Item`
- Sales Order → `Sales Order Item`
- Delivery Note → `Delivery Note Item`
- Sales Invoice → `Sales Invoice Item`
- POS Invoice → `POS Invoice Item`
- CM Proforma → `CM Proforma Item`

### BEFORE — visible grid columns per child doctype
(Visible = `in_list_view=1` and `hidden=0`)
- `Quotation Item`:
  - `item_code`, `description`, `cm_rrp_ex_vat`, `discount_percentage`, `cm_final_offer_inc_vat`, `qty`, `amount`
- `Sales Order Item`:
  - `item_code`, `description`, `cm_rrp_ex_vat`, `discount_percentage`, `cm_final_offer_inc_vat`, `qty`, `amount`
- `Delivery Note Item`:
  - `item_code`, `description`, `qty`, `amount`
- `Sales Invoice Item`:
  - `item_code`, `description`, `qty`, `amount`
- `POS Invoice Item`:
  - `item_code`, `description`, `qty`, `amount`
- `CM Proforma Item`:
  - `item_code`, `description`, `qty`, `amount`

## IMPLEMENTATION
### Scope / constraints honored
- Meta/UI only: DocField Property Setters (`in_list_view`, and selective `hidden=0` for target columns) + DocType `field_order`.
- No pricing math, no tax/VAT logic changes.
- No conversions/workflow/numbering/tiles/placeholders changes.
- No permission changes; stabilisation gate still enforces `custom_docperms: 0`.

### Files / records changed
Audit helper (read-only):
- `apps/casamoderna_dms/casamoderna_dms/sales_docs_slice023_items_grid_audit.py`

Idempotent patch (meta-only):
- `apps/casamoderna_dms/casamoderna_dms/patches/slice023_sales_docs_items_grid_v1_parity_authoritative.py`

Patch registration:
- `apps/casamoderna_dms/casamoderna_dms/patches.txt`
  - Added: `casamoderna_dms.patches.slice023_sales_docs_items_grid_v1_parity_authoritative`

Stabilisation gate:
- `apps/casamoderna_dms/casamoderna_dms/stabilisation_gate.py`
  - Added `_slice023_sales_docs_items_grid_v1_parity_authoritative_problems()`
  - Wired check:
    - `B7.5A8 Slice 023 UI meta: Sales Docs items grid authoritative V1-parity`
  - Replaced the older Slice 017 grid check invocation with Slice 023’s check.

Records (DB):
- Property Setters (DocField + DocType) for:
  - `Quotation Item`, `Sales Order Item`, `Delivery Note Item`, `Sales Invoice Item`, `POS Invoice Item`, `CM Proforma Item`

## COMMANDS
All commands executed from `/home/frappe/frappe/casamoderna-bench`.

### Phase A — Audit (before)
- `bench --site casamoderna-staging.local execute casamoderna_dms.sales_docs_slice023_items_grid_audit.audit_slice023_items_grid > /tmp/slice023_items_grid_before_casamoderna-staging.local_2026-03-05_audit.json`
- `bench --site two.casamodernadms.eu execute casamoderna_dms.sales_docs_slice023_items_grid_audit.audit_slice023_items_grid > /tmp/slice023_items_grid_before_two.casamodernadms.eu_2026-03-05_audit.json`

### Phase B — Apply (migrate)
- staging: `/tmp/slice023_verify_casamoderna-staging.local_2026-03-05_migrate.log`
- two: `/tmp/slice023_verify_two.casamodernadms.eu_2026-03-05_migrate.log`

### Phase C — Verify (clear cache + after audit + stabilisation gate)
Clear cache logs:
- staging: `/tmp/slice023_verify_casamoderna-staging.local_2026-03-05_clear_cache.log`
- two: `/tmp/slice023_verify_two.casamodernadms.eu_2026-03-05_clear_cache.log`

After-state audit evidence:
- `/tmp/slice023_items_grid_after_casamoderna-staging.local_2026-03-05_audit.json`
- `/tmp/slice023_items_grid_after_two.casamodernadms.eu_2026-03-05_audit.json`

Stabilisation gate logs:
- staging: `/tmp/slice023_stab_gate_casamoderna-staging.local_2026-03-05.log`
- two: `/tmp/slice023_stab_gate_two.casamodernadms.eu_2026-03-05.log`

## RESULT (AFTER)
### Target visible grid columns (authoritative)
Commercial entry surfaces (QT/SO) — V1-like pricing working columns:
- `Quotation Item`:
  - `item_code`, `description`, `cm_rrp_ex_vat`, `discount_percentage`, `cm_final_offer_inc_vat`, `qty`, `amount`
- `Sales Order Item`:
  - `item_code`, `description`, `cm_rrp_ex_vat`, `discount_percentage`, `cm_final_offer_inc_vat`, `qty`, `amount`

Downstream docs (DN/SI/POS) + PF — minimal operational/fiscal surfaces:
- `Delivery Note Item`:
  - `item_code`, `description`, `qty`
- `Sales Invoice Item`:
  - `item_code`, `description`, `qty`, `rate`, `amount`
- `POS Invoice Item`:
  - `item_code`, `description`, `qty`, `rate`, `amount`
- `CM Proforma Item`:
  - `item_code`, `description`, `qty`, `rate`, `amount`

### BEFORE → AFTER changes observed (deterministic)
- QT/SO: already matched the target list and order; unchanged.
- DN: removed `amount` from default grid surface.
- SI/POS: added `rate` to the default grid surface.
- PF: added `rate` to the default grid surface.

### Explicit exception: CM pricing display fields not present outside QT/SO
From audit meta (`cm_fields_present`):
- `Delivery Note Item`, `Sales Invoice Item`, `POS Invoice Item`, `CM Proforma Item` contain **no** `cm_*` pricing display fields.
- Therefore, V1 commercial pricing-column parity (RRP/Disc/Offer) is enforced only on QT/SO where the fields exist, and not introduced elsewhere (no data-model changes in this slice).

## SUCCESS CHECKS
### Stabilisation gate
GREEN on BOTH sites (exit code 0):
- staging: `/tmp/slice023_stab_gate_casamoderna-staging.local_2026-03-05.log`
- two: `/tmp/slice023_stab_gate_two.casamodernadms.eu_2026-03-05.log`

Gate confirms:
- `custom_docperms: 0`
- Includes deterministic meta assertion `B7.5A8` for exact visible columns + order.

## ROLLBACK
UI-only rollback (meta only; no data loss):

1) Prevent re-application:
- Remove `casamoderna_dms.patches.slice023_sales_docs_items_grid_v1_parity_authoritative` from `apps/casamoderna_dms/casamoderna_dms/patches.txt`

2) Revert meta changes (Property Setters):
- Remove/adjust DocField Property Setters of the form:
  - `<Child Doctype>-<fieldname>-in_list_view`
  - `<Child Doctype>-<fieldname>-hidden` (only used to ensure target columns are not hidden)
- Remove the DocType field order Property Setter:
  - `<Child Doctype>-field_order`

3) Run on each site:
- `bench --site <site> clear-cache`

Notes:
- Rollback is UI-only. It restores default column visibility/order by removing the applied Property Setters.

```