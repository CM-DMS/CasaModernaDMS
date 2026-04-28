# Item — Hide lifecycle fields (shelf life, end of life)

Casa Moderna sells furniture and tiles; Item lifecycle/expiry fields are not used.

## What changed

A metadata-only patch applies Property Setters on DocType **Item**:

- `shelf_life_in_days`: `hidden=1`, `in_list_view=0`
- `end_of_life`: `hidden=1`, `in_list_view=0`

Patch: `casamoderna_dms.patches.hide_item_shelf_life_and_end_of_life_fields`

## Safety / scope

- No business logic changes
- No DocPerm/permission changes
- Idempotent: skips missing fields; only sets the above properties

## Verification (dual-site)

- `bench --site <site> migrate`
- `bench --site <site> clear-cache`
- `bench --site <site> execute casamoderna_dms.stabilisation_gate.run --kwargs "{'create_docs': 1}"`

Expected:
- gate `EXIT=0`
- Property Setters exist:
  - `Item-shelf_life_in_days-hidden=1`, `Item-shelf_life_in_days-in_list_view=0`
  - `Item-end_of_life-hidden=1`, `Item-end_of_life-in_list_view=0`
