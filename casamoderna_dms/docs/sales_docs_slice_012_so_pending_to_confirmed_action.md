# Slice 012 — SO Pending → SO Confirmed “Create SO Confirmed” Action (Admin-only)

Date: 2026-03-05

Scope: Implement the V1-required explicit Sales Order action **Create SO Confirmed** that transitions an existing SO from `Pending` → `Confirmed` via the existing workflow, on BOTH sites:
- `casamoderna-staging.local`
- `two.casamodernadms.eu`

Hard constraints (Slice 012):
- FORBIDDEN: changing the existing Sales Order workflow rules or role sets from Slice 002.
- FORBIDDEN: any changes to numbering / naming series / fiscal logic / print formats.
- Do NOT touch `tabCustom DocPerm` (must remain 0 globally).
- Do NOT modify DocPerm/Role permissions tables.
- Do NOT weaken existing sales/stock/guardrail validations.

---

## PLAN
- Audit the live Sales Order workflow on both sites:
  - Confirm workflow exists/active: `CM Sales Order Flow`
  - Confirm workflow state field: `workflow_state`
  - Confirm the exact action string for `Pending → Confirmed` (expected `Admin Confirm`; verified live)
  - List enabled Sales Order Client Scripts to avoid collisions
- Implement a whitelisted server method that:
  - re-validates source SO is `docstatus=1` and `workflow_state == Pending`
  - enforces caller role is `CM Super Admin`
  - applies the existing workflow transition (no duplicate SO)
  - is idempotent: if already Confirmed, returns unchanged
  - writes an audit log entry
- Add a Sales Order form button labeled exactly `Create SO Confirmed` visible only when:
  - `docstatus==1` and `workflow_state == Pending`
  - user has role `CM Super Admin` (Administrator also allowed)
- Extend stabilisation gate proofs to assert:
  - Sales User cannot execute the server confirm method
  - CM Super Admin can execute the server confirm method
  - repeat execution is idempotent
- Run verify sequence on BOTH sites.

---

## CURRENT STATE FOUND

### Workflow (live audit, authoritative)
Audit helper used (per-site):
- `bench --site <site> execute casamoderna_dms.sales_order_confirm.audit_sales_order_pending_confirm_action`

Evidence artifacts (per-site JSON):
- `/tmp/slice012_audit_so_confirm_casamoderna-staging.local_2026-03-05.json`
- `/tmp/slice012_audit_so_confirm_two.casamodernadms.eu_2026-03-05.json`

Verified live on BOTH sites:
- Active workflow for Sales Order: `CM Sales Order Flow`
- Workflow state field: `workflow_state` (exists in Sales Order meta)
- Pending → Confirmed transition:
  - action: `Admin Confirm`
  - allowed role: `CM Super Admin`

### Existing Sales Order Client Scripts (enabled)
Verified live on BOTH sites:
- `Sales Order - CasaModerna AB Split Helpers`
- `Sales Order - CasaModerna Conversions`

No existing script provided the explicit Pending→Confirmed entry point required by V1.

---

## FILES / RECORDS CHANGED

### Code
- New server module (whitelisted confirm endpoint + audit helper):
  - `apps/casamoderna_dms/casamoderna_dms/sales_order_confirm.py`
- Stabilisation gate updated to exercise the new server method deterministically:
  - `apps/casamoderna_dms/casamoderna_dms/stabilisation_gate.py`

### DB records (via idempotent patch)
- New Client Script record:
  - `Sales Order - CasaModerna Pending Confirm Action`
    - Adds button `Create SO Confirmed` only on submitted SOs with `workflow_state == Pending` and only for `CM Super Admin`.

### Patch registration
- New patch:
  - `apps/casamoderna_dms/casamoderna_dms/patches/slice012_so_pending_confirm_action_ui.py`
- Registered in:
  - `apps/casamoderna_dms/casamoderna_dms/patches.txt`

Explicit non-changes (guardrails):
- No workflow record modifications (workflow is only read + executed via API).
- No permissions / DocPerm / Custom DocPerm changes.
- No numbering / fiscal / print format changes.

---

## COMMANDS

Audit (both sites):
- `bench --site <site> execute casamoderna_dms.sales_order_confirm.audit_sales_order_pending_confirm_action`

Verify sequence (run per-site):
- `bench --site <site> migrate`
- `bench --site <site> clear-cache`
- `bench --site <site> execute casamoderna_dms.stabilisation_gate.run --kwargs "{'create_docs': 1}"`

Evidence logs:
- Staging:
  - `/tmp/slice012_verify_casamoderna-staging.local_2026-03-05_migrate.log`
  - `/tmp/slice012_verify_casamoderna-staging.local_2026-03-05_clear_cache_2.log`
  - `/tmp/slice012_verify_casamoderna-staging.local_2026-03-05_stabilisation_gate_2.log`
- Site two:
  - `/tmp/slice012_verify_two.casamodernadms.eu_2026-03-05_migrate.log`
  - `/tmp/slice012_verify_two.casamodernadms.eu_2026-03-05_clear_cache.log`
  - `/tmp/slice012_verify_two.casamodernadms.eu_2026-03-05_stabilisation_gate.log`

---

## RESULT
- Sales Order now has an explicit V1-like action button labeled **Create SO Confirmed** when the SO is `Pending`.
- Execution is authoritative and safe:
  - Server re-validates state and executes the existing workflow action `Admin Confirm`.
  - Only `CM Super Admin` (and Administrator) can execute.
  - Idempotent behavior: calling again on a Confirmed SO returns the same SO with no error.
- Stabilisation gate remains GREEN on BOTH sites.

---

## SUCCESS CHECKS

UI checks:
- As Sales User:
  - Open a submitted Sales Order with `workflow_state == Pending` → button is not shown.
- As CM Super Admin:
  - Open the same SO → button **Create SO Confirmed** is shown.
  - Click → SO remains the same document and transitions to `workflow_state == Confirmed`.
  - Refresh and click again → no error, state remains Confirmed.

Server checks:
- `casamoderna_dms.sales_order_confirm.confirm_pending_so(<SO>)`:
  - fails for non-admin
  - succeeds for CM Super Admin when Pending
  - idempotent when Confirmed

---

## ROLLBACK
1. Remove (or comment out) the patch entry in `apps/casamoderna_dms/casamoderna_dms/patches.txt`:
   - `casamoderna_dms.patches.slice012_so_pending_confirm_action_ui`
2. Disable/remove the Client Script record (if already created):
   - `Sales Order - CasaModerna Pending Confirm Action`
3. Optionally remove the server module if fully rolling back Slice 012:
   - `apps/casamoderna_dms/casamoderna_dms/sales_order_confirm.py`
4. Re-run verify sequence on both sites.
