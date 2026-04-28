# CASAMODERNA ERPNext SALES DOCUMENTS — SLICE 014
Sales Order UI v1-lite Header + Section Cleanup (Pending/Confirmed identity first)

Date: 2026-03-05

## PLAN
1) Audit live Sales Order meta on both sites (field order, hidden/collapsible state, enabled Client Scripts).
2) Implement minimal UI-only metadata changes via Property Setters / Custom Field property updates.
3) Extend stabilisation gate with deterministic UI/meta assertions for Sales Order.
4) Verify on BOTH sites: `bench migrate`, `bench clear-cache`, stabilisation gate `run(create_docs=1)`.

## CURRENT STATE FOUND
### Sites audited
- `casamoderna-staging.local`
- `two.casamodernadms.eu`

### Before-state meta snapshots (evidence)
- `/tmp/slice014_before_casamoderna-staging.local_2026-03-05_so_meta.json`
- `/tmp/slice014_before_two.casamodernadms.eu_2026-03-05_so_meta.json`

### Key findings (before)
- Both sites were aligned (same Sales Order field ordering + section layout).
- V1-visible number fields were already surfaced near the top:
  - `cm_v1_draft_no` and `cm_v1_operational_no` were visible early in `customer_section`.
- The two identity gaps vs Slice 014 target:
  - `workflow_state` existed but was `hidden=1`.
  - `status` and `workflow_state` lived under the `More Info` tab, visually burying Pending/Confirmed identity.
- Most clutter sections were already `collapsible=1` (Accounting Dimensions, Currency and Price List, Additional Discount, Tax Breakup, Packing List, Print Settings, Additional Info).

## FILES / RECORDS CHANGED
### Code (repo)
- apps/casamoderna_dms/casamoderna_dms/sales_order_ui_v1lite.py
  - Added read-only audit helper `audit_slice014_sales_order_ui_meta()`.
- apps/casamoderna_dms/casamoderna_dms/patches/slice014_sales_order_ui_v1lite.py
  - Patch that applies Sales Order UI meta changes (field_order + property setters + custom field bold).
- apps/casamoderna_dms/casamoderna_dms/patches.txt
  - Registered `casamoderna_dms.patches.slice014_sales_order_ui_v1lite`.
- apps/casamoderna_dms/casamoderna_dms/stabilisation_gate.py
  - Added Slice 014 UI/meta assertions (`_slice014_sales_order_ui_v1lite_problems`).

### Records (DB / metadata)
Sales Order (DocType meta only):
- Property Setter: `Sales Order-field_order` (DocType) — moved `workflow_state` and `status` into the top identity area.
- Property Setter: `Sales Order-workflow_state-hidden` — set to `0`.
- Property Setter: `Sales Order-workflow_state-bold` — set to `1`.
- Property Setter: `Sales Order-status-bold` — set to `1`.
- Property Setter: `Sales Order-pricing_rule_details-collapsible` — set to `1` (declutter).

Sales Order (Custom Field properties):
- `Sales Order-cm_v1_draft_no` — set `bold=1` (still read-only, still conditional via existing depends_on).
- `Sales Order-cm_v1_operational_no` — set `bold=1` (still read-only, still conditional via existing depends_on).

No DocPerm/Custom DocPerm changes (stabilisation gate confirms `custom_docperms: 0`).

## COMMANDS
All commands run from `/home/frappe/frappe/casamoderna-bench`.

### casamoderna-staging.local
- `bench --site casamoderna-staging.local migrate`
- `bench --site casamoderna-staging.local clear-cache`
- `bench --site casamoderna-staging.local execute "frappe.get_attr('casamoderna_dms.stabilisation_gate.run')" --kwargs "{'create_docs': 1}"`

Logs (evidence):
- `/tmp/slice014_verify_casamoderna-staging.local_2026-03-05_migrate.log`
- `/tmp/slice014_verify_casamoderna-staging.local_2026-03-05_clear_cache.log`
- `/tmp/slice014_verify_casamoderna-staging.local_2026-03-05_stabilisation_gate.log`

Meta audit after:
- `/tmp/slice014_after_casamoderna-staging.local_2026-03-05_so_meta.json`

### two.casamodernadms.eu
- `bench --site two.casamodernadms.eu migrate`
- `bench --site two.casamodernadms.eu clear-cache`
- `bench --site two.casamodernadms.eu execute "frappe.get_attr('casamoderna_dms.stabilisation_gate.run')" --kwargs "{'create_docs': 1}"`

Logs (evidence):
- `/tmp/slice014_verify_two.casamodernadms.eu_2026-03-05_migrate.log`
- `/tmp/slice014_verify_two.casamodernadms.eu_2026-03-05_clear_cache.log`
- `/tmp/slice014_verify_two.casamodernadms.eu_2026-03-05_stabilisation_gate.log`

Meta audit after:
- `/tmp/slice014_after_two.casamodernadms.eu_2026-03-05_so_meta.json`

## RESULT
### Top identity strip (Sales Order)
The following fields are now visible in the top Sales Order working surface (same initial section as customer/date), making Pending/Confirmed identity obvious:
- `cm_v1_draft_no` (bold)
- `cm_v1_operational_no` (bold)
- `workflow_state` (unhidden + bold)
- `status` (bold)
- `customer`
- `transaction_date`

### Clutter reduction
- Kept the main commercial surface unchanged (customer + items + totals + terms).
- Advanced blocks remain available but are collapsible; additionally “Pricing Rules” is now collapsible.

### Convert/workflow visibility
- Slice 013 Convert group client script remains enabled.
- No workflow rule or conversion behavior changed in this slice.

## SUCCESS CHECKS
### Before/After field visibility matrix (identity strip)
(Positions are indexes in the meta field order list; lower = earlier.)

**Before (both sites identical)**
- `cm_v1_draft_no`: tab=None, section=customer_section, hidden=0, index=4
- `cm_v1_operational_no`: tab=None, section=customer_section, hidden=0, index=5
- `customer`: tab=None, section=customer_section, hidden=0, index=6
- `transaction_date`: tab=None, section=customer_section, hidden=0, index=11
- `status`: tab=More Info, section=Status, hidden=0, index=126
- `workflow_state`: tab=More Info, section=Status, hidden=1, index=127

**After (both sites identical)**
- `cm_v1_draft_no`: tab=None, section=customer_section, hidden=0, index=4
- `cm_v1_operational_no`: tab=None, section=customer_section, hidden=0, index=5
- `customer`: tab=None, section=customer_section, hidden=0, index=6
- `transaction_date`: tab=None, section=customer_section, hidden=0, index=11
- `workflow_state`: tab=None, section=customer_section, hidden=0, index=12
- `status`: tab=None, section=customer_section, hidden=0, index=13

Evidence sources: `/tmp/slice014_before_*_so_meta.json`, `/tmp/slice014_after_*_so_meta.json`.

### Before/After section visibility matrix (clutter targets)
(Checked in after-meta snapshots; both sites aligned.)

- `accounting_dimensions_section` (Accounting Dimensions): collapsible=1
- `currency_and_price_list` (Currency and Price List): collapsible=1
- `section_break_48` (Additional Discount): collapsible=1
- `sec_tax_breakup` (Tax Breakup): collapsible=1
- `packing_list` (Packing List): collapsible=1
- `printing_details` (Print Settings): collapsible=1
- `additional_info_section` (Additional Info): collapsible=1
- `pricing_rule_details` (Pricing Rules): collapsible=1 (changed in Slice 014)

### Stabilisation gate
- GREEN on BOTH sites (`EXIT=0` in both gate logs).
- `custom_docperms: 0` (no permission table changes).
- Slice 014 meta assertions included and passing (matrix tests incremented to 133).

## ROLLBACK
UI-only rollback (reversible; does not touch numbering/workflow/permissions):
1) Delete the Property Setter records:
   - `Sales Order-field_order`
   - `Sales Order-workflow_state-hidden`
   - `Sales Order-workflow_state-bold`
   - `Sales Order-status-bold`
   - `Sales Order-pricing_rule_details-collapsible`
2) Revert Custom Field bold flags:
   - `Sales Order-cm_v1_draft_no` -> `bold=0`
   - `Sales Order-cm_v1_operational_no` -> `bold=0`
3) Run on each site:
   - `bench --site <site> clear-cache`

Optional: remove the patch line `casamoderna_dms.patches.slice014_sales_order_ui_v1lite` from patches.txt only if you are intentionally preventing re-application in future migrations.
