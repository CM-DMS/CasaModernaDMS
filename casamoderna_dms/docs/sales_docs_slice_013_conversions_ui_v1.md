# CASAMODERNA ERPNext SALES DOCUMENTS — SLICE 013
V1-like Conversion Buttons v1 (QT→SO/PF/CS, SO→DN/IN/PF/CS, DN→IN) WITH SO Pending/Confirmed Rules

Date: 2026-03-05

## PLAN
1. Phase A (Audit): On BOTH sites, inventory enabled Client Scripts on Quotation / Sales Order / Delivery Note and verify linkage fields used for deterministic idempotency.
2. Phase B (Implement):
   - Server-side: enforce SO Pending vs Confirmed conversion rules and add Slice 013 wrapper endpoints.
   - UI: update the existing “Convert” button groups on QT/SO/DN to match V1 rules and state gating.
   - Keep ERPNext-first mappings (no custom mapping logic), deterministic reuse, no DocPerm/Role table changes.
3. Phase C (Smoke/Gate): Extend stabilisation gate proofs for conversions + idempotency + SO Pending/Confirmed blocking/allowing; verify GREEN on BOTH sites.

## CURRENT STATE FOUND
### Phase A evidence (pre)
Audit helper output (linkage fields + enabled scripts) captured on BOTH sites:
- /tmp/slice013_audit_casamoderna-staging.local_2026-03-05_linkage_scripts.json
- /tmp/slice013_audit_two.casamodernadms.eu_2026-03-05_linkage_scripts.json

Key findings (both sites):
- Linkage fields required for deterministic reuse were present:
  - `Sales Order Item.prevdoc_docname` (QT→SO)
  - `Delivery Note Item.against_sales_order` (SO→DN)
  - `Sales Invoice Item.delivery_note` (DN→IN)
  - POS Invoice linkage fields from Slice 011: `POS Invoice.cm_source_doctype`, `POS Invoice.cm_source_name` (QT/SO→CS idempotency)
- Enabled Client Scripts included (pre-implementation):
  - `Quotation - CasaModerna Conversions`
  - `Sales Order - CasaModerna Conversions`
  - `Delivery Note - CasaModerna Conversions`
  - `Sales Order - CasaModerna Pending Confirm Action` (Slice 012 standalone confirm button)

## FILES / RECORDS CHANGED
### Code
- apps/casamoderna_dms/casamoderna_dms/sales_doc_conversions.py
  - Enforced Slice 013 SO state gating:
    - SO→DN only when `workflow_state == "Confirmed"`
    - SO→IN only when `workflow_state == "Confirmed"` AND a submitted DN exists
  - SO→IN now uses ERPNext DN→SI mapping (stock-safe path):
    - `erpnext.stock.doctype.delivery_note.delivery_note.make_sales_invoice`
  - Added deterministic idempotency strategy:
    - SO→DN: reuse latest draft DN if present, else most recent submitted DN
    - SO→IN & DN→IN: reuse latest draft SI referencing DN(s), else most recent submitted SI
  - Added Slice 013 whitelisted wrapper endpoints (V1-like names/args):
    - `qt_create_so`, `qt_create_pf`, `qt_create_cs`
    - `so_create_confirmed` (calls Slice 012 server confirm; no duplicate logic)
    - `so_create_dn`, `so_create_in`, `so_create_pf`, `so_create_cs`
    - `dn_create_in`
  - Added UI helper: `so_has_delivery_note`
  - Added audit helper: `audit_slice013_linkage_and_scripts`

- apps/casamoderna_dms/casamoderna_dms/patches/slice013_conversions_ui_v1.py
  - Updates the existing Client Script records for QT/SO/DN Convert groups.
  - Disables `Sales Order - CasaModerna Pending Confirm Action` to prevent duplicate confirm UI.

- apps/casamoderna_dms/casamoderna_dms/patches.txt
  - Registered Slice 013 patch: `casamoderna_dms.patches.slice013_conversions_ui_v1`

- apps/casamoderna_dms/casamoderna_dms/stabilisation_gate.py
  - Updated the conversions proof block to enforce the Slice 013 Pending/Confirmed rules:
    - Pending blocks SO→DN and SO→IN
    - Pending allows SO→PF and SO→CS
    - Admin confirm transitions SO Pending→Confirmed idempotently
    - Confirmed allows SO→DN idempotently
    - SO→IN requires a DN and is idempotent once DN is submitted
    - DN→IN idempotent

### Records
Client Script records created/updated (existing names preserved):
- `Quotation - CasaModerna Conversions`
- `Sales Order - CasaModerna Conversions`
- `Delivery Note - CasaModerna Conversions`

Client Script disabled:
- `Sales Order - CasaModerna Pending Confirm Action`

Custom Fields:
- No new Custom Fields added in this slice.

Permissions:
- No DocPerm / Role Permission / Custom DocPerm changes.

## COMMANDS
All commands run from `/home/frappe/frappe/casamoderna-bench`.

### Phase A — Audit (both sites)
- `bench --site "$SITE" execute "frappe.get_attr('casamoderna_dms.sales_doc_conversions.audit_slice013_linkage_and_scripts')" > /tmp/slice013_audit_${SITE}_2026-03-05_linkage_scripts.json 2>&1`

### Phase B/C — Verify (both sites)
- `bench --site "$SITE" migrate > /tmp/slice013_verify_${SITE}_2026-03-05_migrate_full.log 2>&1`
- `bench --site "$SITE" clear-cache > /tmp/slice013_verify_${SITE}_2026-03-05_clear_cache.log 2>&1`
- `bench --site "$SITE" execute "frappe.get_attr('casamoderna_dms.stabilisation_gate.run')" --kwargs "{'create_docs': 1}" > /tmp/slice013_verify_${SITE}_2026-03-05_stabilisation_gate.log 2>&1`

### Post-implementation audit (both sites)
- `bench --site "$SITE" execute "frappe.get_attr('casamoderna_dms.sales_doc_conversions.audit_slice013_linkage_and_scripts')" > /tmp/slice013_post_${SITE}_2026-03-05_linkage_scripts.json 2>&1`

Evidence files created:
- /tmp/slice013_verify_casamoderna-staging.local_2026-03-05_migrate_full.log
- /tmp/slice013_verify_casamoderna-staging.local_2026-03-05_clear_cache.log
- /tmp/slice013_verify_casamoderna-staging.local_2026-03-05_stabilisation_gate.log
- /tmp/slice013_verify_two.casamodernadms.eu_2026-03-05_migrate_full.log
- /tmp/slice013_verify_two.casamodernadms.eu_2026-03-05_clear_cache.log
- /tmp/slice013_verify_two.casamodernadms.eu_2026-03-05_stabilisation_gate.log

## RESULT
UI:
- Quotation: one `Convert` group with `Create Sales Order (SO)`, `Create Proforma (PF)`, `Create Cash Sale (CS)`.
- Sales Order: one `Convert` group with state gating:
  - Pending: `Create SO Confirmed` (CM Super Admin / Administrator only), plus `Create Proforma (PF)`, `Create Cash Sale (CS)`.
  - Confirmed: `Create Delivery Note (DN)`, `Create Invoice (IN)` (only executes when DN exists; otherwise deterministic message), plus PF/CS.
- Delivery Note: one `Convert` group with `Create Invoice (IN)`.

Server:
- All conversions are server-whitelisted, re-validate preconditions server-side, use ERPNext-native mapping methods, and are deterministic + idempotent.
- No auto-submit of targets was introduced in this slice (targets are inserted as drafts).

Gate:
- Stabilisation gate is GREEN on BOTH sites.
- Gate summary shows `custom_docperms: 0` (no forbidden permission customisations).

## SUCCESS CHECKS
- Convert button groups exist on QT/SO/DN with the specified options and state gating.
- SO Pending blocks SO→DN and SO→IN (server-side enforced) and SO Confirm can only be done by CM Super Admin / Administrator.
- SO Confirmed allows SO→DN; SO→IN requires an existing submitted DN and uses DN→SI mapping.
- Idempotency proven in stabilisation gate for QT→SO/PF/CS, SO→DN, SO→IN (after DN submit), DN→IN.
- Stabilisation gate GREEN on BOTH sites:
  - See the tail JSON in:
    - /tmp/slice013_verify_casamoderna-staging.local_2026-03-05_stabilisation_gate.log
    - /tmp/slice013_verify_two.casamodernadms.eu_2026-03-05_stabilisation_gate.log

## ROLLBACK
1. Disable Slice 013 patch entry:
   - Remove `casamoderna_dms.patches.slice013_conversions_ui_v1` from apps/casamoderna_dms/casamoderna_dms/patches.txt
2. Re-run on both sites:
   - `bench --site "$SITE" migrate`
   - `bench --site "$SITE" clear-cache`
3. If required, re-enable the older standalone SO confirm script:
   - Enable Client Script record `Sales Order - CasaModerna Pending Confirm Action`.

