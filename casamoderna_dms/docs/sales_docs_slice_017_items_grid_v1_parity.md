# CASAMODERNA ERPNext SALES DOCUMENTS — SLICE 017
Sales Docs Items Grid V1-Parity Pass 1 (keep only V1 input columns; no extra ERPNext row clutter)

Date: 2026-03-05

## PLAN
1) Audit BOTH sites (meta only; no guessing):
   - Identify the child table doctype used by each Sales Doc `items` grid
   - Capture current visible grid columns (`in_list_view=1` and `hidden=0`)
   - Capture current field order and presence of operational/pricing fields
2) Implement meta-only changes on the child table doctypes:
   - Set `in_list_view=1` only for the V1-like working columns
   - Remove clutter columns from the grid by setting `in_list_view=0`
   - Unhide CM pricing display fields on QT/SO rows where required
   - Enforce column order via child doctype `field_order` Property Setter
3) Extend stabilisation gate:
   - Deterministic assertion that visible grid columns match targets per child doctype
   - Assert critical operational fields still exist (we only change visibility)
4) Verify on BOTH sites:
   - `bench migrate`
   - `bench clear-cache`
   - stabilisation gate `run(create_docs=1)`

## CURRENT STATE FOUND
### Sites
- casamoderna-staging.local
- two.casamodernadms.eu

### Phase A — audit evidence (before)
Read-only audit helper executed on both sites:
- `/tmp/slice017_items_grid_before_casamoderna-staging.local_2026-03-05_audit.json`
- `/tmp/slice017_items_grid_before_two.casamodernadms.eu_2026-03-05_audit.json`

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
  - `item_code`, `qty`, `cm_effective_discount_percent`, `rate`, `amount`
- `Sales Order Item`:
  - `item_code`, `delivery_date`, `qty`, `cm_effective_discount_percent`, `rate`, `amount`, `warehouse`
- `Delivery Note Item`:
  - `item_code`, `qty`, `uom`, `rate`, `amount`, `warehouse`
- `Sales Invoice Item`:
  - `item_code`, `qty`, `rate`, `amount`, `warehouse`
- `POS Invoice Item`:
  - `item_code`, `qty`, `rate`, `amount`, `warehouse`, `serial_no`
- `CM Proforma Item`:
  - `item_code`, `qty`, `rate`, `amount`

### V1 target vs reality (gap)
Target working surface (when fields exist):
- Code
- Description
- RRP
- Disc %
- Offer (inc VAT)
- Qty
- Total
- (Delete action remains in row actions)

Observed gaps:
- `description` was not shown as a grid column by default.
- QT/SO already had CM pricing display fields (`cm_rrp_ex_vat`, `cm_final_offer_inc_vat`) but they were hidden.
- Standard ERPNext clutter columns were visible in multiple doctypes (examples: `warehouse`, `uom`, `serial_no`, row `delivery_date`, `rate` duplicates).
- DN/SI/POS and CM Proforma item doctypes do not contain CM pricing display fields; therefore full V1 pricing-column parity is not possible without a data-model change (forbidden/undesired in this slice). This slice documents that as an explicit exception and applies a minimal V1-like surface instead.

## FILES / RECORDS CHANGED
### Code
Audit helper (read-only):
- `apps/casamoderna_dms/casamoderna_dms/sales_docs_slice017_items_grid_audit.py`

Idempotent patch (meta-only):
- `apps/casamoderna_dms/casamoderna_dms/patches/slice017_sales_docs_items_grid_v1_parity.py`

Patch registration:
- `apps/casamoderna_dms/casamoderna_dms/patches.txt`
  - Added: `casamoderna_dms.patches.slice017_sales_docs_items_grid_v1_parity`

Stabilisation gate:
- `apps/casamoderna_dms/casamoderna_dms/stabilisation_gate.py`
  - Added `_slice017_sales_docs_items_grid_v1_parity_problems()`
  - Wired new recorded check:
    - `B7.5A5 Slice 017 UI meta: Sales Docs items grid V1-parity columns`

### Records (DB)
Property Setters (DocField + DocType) for the child table doctypes:
- `Quotation Item`
- `Sales Order Item`
- `Delivery Note Item`
- `Sales Invoice Item`
- `POS Invoice Item`
- `CM Proforma Item`

Types of Property Setters used:
- DocField:
  - `in_list_view` (show/hide grid column)
  - `hidden=0` for QT/SO CM pricing display columns
- DocType:
  - `field_order` to enforce column ordering

No DocPerm/Custom DocPerm changes (gate continues to report `custom_docperms: 0`).

## COMMANDS
All commands executed from `/home/frappe/frappe/casamoderna-bench`.

### Phase A — Audit (before)
- `bench --site casamoderna-staging.local execute "frappe.get_attr('casamoderna_dms.sales_docs_slice017_items_grid_audit.audit_slice017_items_grid')" > /tmp/slice017_items_grid_before_casamoderna-staging.local_2026-03-05_audit.json`
- `bench --site two.casamodernadms.eu execute "frappe.get_attr('casamoderna_dms.sales_docs_slice017_items_grid_audit.audit_slice017_items_grid')" > /tmp/slice017_items_grid_before_two.casamodernadms.eu_2026-03-05_audit.json`

### Phase C — Verify (both sites)
- `/tmp/slice017_verify_<site>_2026-03-05_migrate.log`
- `/tmp/slice017_verify_<site>_2026-03-05_clear_cache.log`
- `/tmp/slice017_verify_<site>_2026-03-05_stabilisation_gate.log`

### After-state audit evidence
- `/tmp/slice017_items_grid_after_casamoderna-staging.local_2026-03-05_audit.json`
- `/tmp/slice017_items_grid_after_two.casamodernadms.eu_2026-03-05_audit.json`

## RESULT
### Target visible grid columns (AFTER)
Commercial entry surfaces (QT/SO) — V1-like pricing working columns:
- `Quotation Item`:
  - `item_code`, `description`, `cm_rrp_ex_vat`, `discount_percentage`, `cm_final_offer_inc_vat`, `qty`, `amount`
- `Sales Order Item`:
  - `item_code`, `description`, `cm_rrp_ex_vat`, `discount_percentage`, `cm_final_offer_inc_vat`, `qty`, `amount`

Downstream docs (DN/SI/POS) and PF — minimal V1-like working columns (documented exception):
- `Delivery Note Item`:
  - `item_code`, `description`, `qty`, `amount`
- `Sales Invoice Item`:
  - `item_code`, `description`, `qty`, `amount`
- `POS Invoice Item`:
  - `item_code`, `description`, `qty`, `amount`
- `CM Proforma Item`:
  - `item_code`, `description`, `qty`, `amount`

### What got removed from the default grid surface
Examples (where previously visible):
- `warehouse`, `uom`, `serial_no`
- row-level `delivery_date`
- `rate` duplicates (kept as hidden/off-grid operational field)
- other ERPNext row metadata not part of the V1 commercial entry pattern

### Constraints honored
- No pricing math/tax math/VAT/rounding/tiles/placeholder/numbering/workflow changes.
- No permission changes; `tabCustom DocPerm` remains 0 (enforced by gate).

## SUCCESS CHECKS
### Stabilisation gate
GREEN on BOTH sites:
- casamoderna-staging.local: `/tmp/slice017_verify_casamoderna-staging.local_2026-03-05_stabilisation_gate.log`
- two.casamodernadms.eu: `/tmp/slice017_verify_two.casamodernadms.eu_2026-03-05_stabilisation_gate.log`

Gate confirms:
- `custom_docperms: 0`
- `matrix_tests: 136` (includes `B7.5A5`)

### Deterministic meta assertions
- `B7.5A5` asserts visible grid columns match the expected lists per child doctype and that critical operational fields still exist.

### Pricing/totals/tiles/placeholders
All existing smoke tests remained unchanged and passed as part of the stabilisation gate.

## ROLLBACK
UI-only rollback (meta only; no data loss):

1) Prevent re-application:
- Remove `casamoderna_dms.patches.slice017_sales_docs_items_grid_v1_parity` from `apps/casamoderna_dms/casamoderna_dms/patches.txt`

2) Revert meta changes (Property Setters):
- For each child doctype:
  - Remove/adjust DocField Property Setters of the form:
    - `<Child Doctype>-<fieldname>-in_list_view`
    - `<Child Doctype>-<fieldname>-hidden` (notably for QT/SO: `cm_rrp_ex_vat`, `cm_final_offer_inc_vat`)
  - Remove the DocType field order Property Setter:
    - `<Child Doctype>-field_order`

3) Run on each site:
- `bench --site <site> clear-cache`

Notes:
- Rollback is UI-only. It restores the default column visibility/order by removing the applied Property Setters.
