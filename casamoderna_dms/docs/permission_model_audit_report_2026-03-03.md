# CasaModerna ERPNext — CONTRACT
## Full Permission Model Audit + Dedup + Effective Enforcement (System-Wide)

Date: 2026-03-03
Bench: `/home/frappe/frappe/casamoderna-bench`
Sites: `casamoderna-staging.local`, `two.casamodernadms.eu`

---

## PLAN

1. Inventory *all permission sources* relevant to day-to-day operation (roles, role profiles, DocPerm, Custom DocPerm, User Permissions, workspace visibility), deterministically and site-specifically.
2. Compute *effective permissions* for test personas (Products Console, Product Maintainer, Sales Console) across a representative doctype set.
3. Detect duplicates/no-ops/conflicts and identify “ineffective permissions” patterns.
4. Apply only minimal, evidence-based enforcement that does **not** broaden effective permissions.
5. Extend the stabilisation gate to emit the permission audit artifact and fail only on true configuration conflicts.

---

## CURRENT STATE FOUND

### A) Permission sources present (both sites)

A1) Custom DocPerm rows exist for a broad set of doctypes, including Selling doctypes.
- `Custom DocPerm` entries exist for:
  - `Quotation`, `Sales Order`, `Sales Invoice`, `Delivery Note`
  - plus operational doctypes like `Company`, `Customer`, `Supplier`, `Workspace`, etc.

A2) Custom DocPerm “shadowing” makes standard DocPerm ineffective
- Observation from the permission audit snapshot:
  - Many doctypes have `Custom DocPerm` rows only for role `CM Super Admin`.
  - In Frappe, the presence of any `Custom DocPerm` for a doctype typically overrides (shadows) the standard `DocPerm` table for that doctype.
- Evidence:
  - The `Sales User` role has standard `DocPerm` rows granting full access to `Quotation`.
  - The Sales Console test persona (`Sales User` + `CasaModerna Sales Console`) still has **effective** permissions `read=false/create=false/write=false` on `Quotation`.
  - The audit flags this as a persona shadow mismatch.

A3) Duplicate Custom DocPerm rows
- A duplicate key exists for:
  - `(parent=File, role=CasaModerna Product Maintainer, permlevel=0)`
- The duplicates are identical rights (no conflict), so they are currently harmless but noisy.

---

## FILES

### Stabilisation / audit
- `casamoderna_dms/stabilisation_gate.py`
  - Adds a permission audit snapshot emitter:
    - `permission_audit_snapshot()` inventories permission sources + computes effective permission booleans.
    - Smoke runner now writes `permissions_YYYY-MM-DD.json` alongside inventory/matrix JSON.
  - Adds analysis for:
    - duplicates + conflicts in `Custom DocPerm`
    - doctype-level `Custom DocPerm` role coverage
    - persona “shadow mismatch” evidence where DocPerm grants exist but effective permissions are denied under Custom DocPerm.
  - Adds a stabilisation failure condition only for **conflicting** duplicate Custom DocPerm keys.

### Enforcement hardening (non-broadening)
- `casamoderna_dms/patches/stabilisation_ensure_file_create_for_product_maintainer.py`
  - Changes from name-based insert (`cm_pm_file_0`) to upsert by logical key `(parent, role, permlevel)` to avoid creating future duplicates.

### Effective enforcement (Sales Console persona)
- `casamoderna_dms/patches/contract_permissions_sales_console_access.py` (new)
  - Adds `Custom DocPerm` rows for `CasaModerna Sales Console` so effective permissions exist even when standard `DocPerm` is shadowed.
  - Grants (permlevel 0):
    - `Customer`: read/create/write
    - `Quotation`: read/create/write (drafts)
    - `Sales Order`: read/create/write (drafts)
    - `Item` + `Item Group`: read-only (item selection)
    - `Sales Invoice` + `Delivery Note`: read-only (visibility; derived-only create rules remain enforced)
    - `Company`: read-only

### Effective enforcement (CM Super Admin)
- `casamoderna_dms/patches/contract_permissions_cm_super_admin_full_access.py` (new)
  - Ensures `CM Super Admin` has full rights (read/write/create/delete/submit/cancel/amend) on every doctype+permlevel that already uses `Custom DocPerm`.
  - This prevents “admin lockout” when standard `DocPerm` is shadowed.

### Fixtures
- `casamoderna_dms/fixtures/custom_docperm.json`
  - Removes fixture row `cm_pm_file_0` (the patch now ensures the permission exists by key, without fixture-driven duplication).

---

## COMMANDS

### Stabilisation gate (permission artifacts)
- `bench --site casamoderna-staging.local execute casamoderna_dms.stabilisation_gate.run --kwargs "{'create_docs': 0}"`
- `bench --site two.casamodernadms.eu execute casamoderna_dms.stabilisation_gate.run --kwargs "{'create_docs': 0}"`

### Apply enforcement
- `bench --site casamoderna-staging.local migrate`
- `bench --site two.casamodernadms.eu execute casamoderna_dms.patches.contract_permissions_sales_console_access.execute`

### Artifacts produced (per site)
- `sites/<site>/private/files/cm_stabilisation/permissions_2026-03-03.json`
- `sites/<site>/private/files/cm_stabilisation/inventory_2026-03-03.json`
- `sites/<site>/private/files/cm_stabilisation/matrix_2026-03-03.json`

---

## RESULT

### What we can now see deterministically (both sites)
- Effective permissions for test personas are captured and comparable across both sites.
- Duplicate Custom DocPerm keys are detected; true conflicts are promoted to a stabilisation failure.
- “Ineffective permission” root cause is exposed:
  - `Custom DocPerm` coverage is currently narrow (often only `CM Super Admin`) and therefore shadows/blocks standard ERPNext roles from taking effect.

### Immediate, safe enforcement applied
- No destructive deletions.
- No broadening of effective permissions.
- Hardened the maintainer File-create upsert to avoid future duplicate creation.

### Enforcement applied (confirmed intent)
- Sales Console persona now has effective permissions under `Custom DocPerm` shadowing:
  - `Customer`: `read/write/create = true`
  - `Quotation` + `Sales Order`: `read/write/create = true`
  - `Sales Invoice` + `Delivery Note`: `read = true`, `create/write = false`
  - `Item` + `Item Group`: `read = true`

---

## SUCCESS CHECKS

- Stabilisation gate remains green on both sites (with the new permissions artifact).
- Permission audit artifact exists and includes:
  - `analysis.custom_docperm_conflicts` (must stay empty)
  - `analysis.custom_docperm_roles_by_doctype`
  - `analysis.persona_shadow_mismatches`
  - `effective` permission tables for `products`, `maintainer`, `sales` personas.

---

## ROLLBACK

- To revert this contract:
  - Revert the edits to `casamoderna_dms/stabilisation_gate.py` and the patch changes, then rerun `bench --site <site> migrate`.
  - Optionally restore the removed fixture row in `casamoderna_dms/fixtures/custom_docperm.json`.
- No schema changes were introduced; rollback is code/fixture-only.
