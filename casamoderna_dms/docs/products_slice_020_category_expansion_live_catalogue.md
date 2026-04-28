# CasaModerna ERPNext PRODUCTS — SLICE 020
## Expand V1 Product Categories with CasaModerna Sold Products (evidence-led)

Date: 2026-03-05

### Goal
Create an expanded, CasaModerna-ready product taxonomy based only on:
1) Locked V1 category evidence already provided, and
2) The live ERPNext Item catalogue on both sites.

Then implement it in the chosen category mechanism (Item Group) without destroying existing Item Group structure, and keep stabilisation gate GREEN on BOTH sites.

### Non-negotiable constraints
- LIVE VPS: no guessing; evidence-led only.
- Do not delete/rename existing Item Groups.
- Do not wipe existing classification.
- No permission model changes; `custom_docperms` must remain `0`.

---

## Evidence gathered

### Evidence source A — Locked V1 evidence
- V1 Products routes/tabs evidence files confirm product workspace structure and explicitly state:
  - **Night Collection is RETIRED and must NOT be recreated.**

Files:
- `apps/casamoderna_dms/V1_PRODUCTS_NAV.txt`
- `apps/casamoderna_dms/V1_PRODUCTS_NOTES.txt`
- `apps/casamoderna_dms/V1_PRODUCTS_ROUTES.txt`
- `apps/casamoderna_dms/V1_PRODUCTS_TABS.txt`

### Evidence source B — Live ERPNext Item catalogue (both sites)
A read-only audit was executed on both sites, capturing:
- Item Group tree snapshot
- Items grouped by current `Item.item_group` with counts + samples
- Simple naming pattern stats

Audit implementation:
- `apps/casamoderna_dms/casamoderna_dms/products_slice020_live_catalogue_audit.py`

Audit results summary:
- Both sites currently have **84 Items total**.
- The catalogue is dominated by stabilisation/test items:
  - `All Item Groups`: 73 Items (mostly `CM-STAB-*`)
  - `Services`: 5 Items (delivery/installation/free-text/lifter)
  - `Consumable`: 5 Items (tile box / non-tile box + pricing helpers)
  - plus a single `CM-STAB-GROUP-*` sample item
- No evidence exists (yet) in the live catalogue to derive real sold-product subcategories under the V1 headings.

Captured JSON (local filesystem on the server during execution):
- `/tmp/slice020_catalogue_casamoderna-staging.local.json`
- `/tmp/slice020_catalogue_two.casamodernadms.eu.json`

---

## Conclusion from evidence
- The environment’s product category mechanism is **ERPNext Item Group** (also consistent with existing CasaModerna contracts/console shortcuts).
- The live catalogue does **not** currently contain a real CasaModerna sold-products dataset that could support evidence-led creation of subcategories and deterministic item mapping.

Therefore Slice 020 is implemented as **Phase 1 (taxonomy skeleton only)**:
- Create the **locked V1 top-level headings** as Item Groups under a dedicated parent, without touching existing Item Groups.
- Add a deterministic stabilisation gate check that asserts the taxonomy exists and that **Night Collection** is not present.
- Defer item remapping/subcategories until an actual sold-products catalogue exists in `Item`.

---

## What changed

### 1) Patch: create top-level Item Group taxonomy (idempotent)
- `apps/casamoderna_dms/casamoderna_dms/patches/slice020_products_taxonomy_top_level_item_groups.py`

Behavior:
- Creates/ensures:
  - Parent Item Group: `CM V1 Product Categories` (group)
  - Children (groups):
    - `0100 Living Area`
    - `0200 Bedroom`
    - `0300 Dining Room`
    - `0400 Kitchen & Utility`
    - `0500 Home Office`
    - `0600 Kids Bedrooms & Child Care`
    - `0700 Bathroom Furniture`
    - `0800 Outdoor Furniture`
    - `0900 Walkin Storage & Organisation`
    - `1000 Custom & Projects`
    - `1100 Accessories & Décor`
    - `1200 Tiles`
- Does **not** delete/rename existing Item Groups.
- Does **not** remap Items.

Registered in:
- `apps/casamoderna_dms/casamoderna_dms/patches.txt`

### 2) Stabilisation gate: deterministic Slice 020 check
- `apps/casamoderna_dms/casamoderna_dms/stabilisation_gate.py`

New check:
- `B2.9 Slice 020 Products taxonomy: CM V1 top-level Item Groups exist`

Asserts:
- `CM V1 Product Categories` exists and is a group.
- Each V1 top-level Item Group exists, is a group, and has the correct parent.
- `Night Collection` Item Group does **not** exist.

---

## Verification (both sites)

### casamoderna-staging.local
Commands:
- `bench --site casamoderna-staging.local migrate`
- `bench --site casamoderna-staging.local execute casamoderna_dms.stabilisation_gate.run --kwargs '{"create_docs": 1}'`

Result:
- Stabilisation gate **GREEN**
- `matrix_tests`: **138**
- `custom_docperms`: **0**

### two.casamodernadms.eu
Commands:
- `bench --site two.casamodernadms.eu migrate`
- `bench --site two.casamodernadms.eu execute casamoderna_dms.stabilisation_gate.run --kwargs '{"create_docs": 1}'`

Result:
- Stabilisation gate **GREEN**
- `matrix_tests`: **138**
- `custom_docperms`: **0**

---

## Exceptions / deferred work (explicit)
Item remapping + subcategory expansion is deferred because the live catalogue evidence currently contains only stabilisation/test items and a small set of operational charge/helper items.

When a real CasaModerna sold-products dataset is available in `Item`, the next Slice 020 step is:
1) Re-run the live catalogue audit on BOTH sites.
2) Derive subcategories evidence-led from the live `Item Group` usage and item naming patterns.
3) Implement deterministic item mapping rules + exceptions list.
4) Add a follow-on stabilisation gate check asserting the mapping coverage and explicit exceptions.
