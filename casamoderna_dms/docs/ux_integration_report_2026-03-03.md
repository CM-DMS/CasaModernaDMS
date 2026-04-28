# CasaModerna ERPNext — CONTRACT
## Integrate CasaModerna Customisation into Native ERPNext UX (No Disconnection)

Date: 2026-03-03
Bench: `/home/frappe/frappe/casamoderna-bench`
Sites: `casamoderna-staging.local`, `two.casamodernadms.eu`

---

## PLAN

1. Audit “disconnected” points in native ERPNext UX (Item list/search/link dialogs, selling doc item selection, navigation).
2. Implement the lightest safe, ERPNext-native integrations (no core overrides):
   - Item display/title/link search behavior includes CM naming.
   - Supplier code is searchable where users select Items.
   - Quotation/SO row descriptions reflect CM description lines without breaking pricing.
   - Minimal pricing summary in a native UI touchpoint.
3. Extend stabilisation smoke/matrix to lock the integrations in and prevent regressions.
4. Migrate + clear cache + run stabilisation gate on BOTH sites.

---

## CURRENT STATE FOUND

### Phase A — Disconnection Audit (Both Sites)

A1) Item list + search
- Effective Item title/search configuration did not include CM fields:
  - `cm_given_name` was not searchable in link dialogs.
  - `cm_supplier_code` was not searchable in link dialogs.
  - Neither field was indexed / global-searchable.
- Link dialog results used standard ERPNext description formatting and did not surface a meaningful “commercial” CM name.

A2) Item form behaviour
- Item form already had V1-like ladder layouts for Suppliers & Pricing; however, the product “identity” displayed in standard UI (link dialog, list title) remained ERPNext-default.
- Some CM fields existed but were not integrated with native selection/search flows.

A3) Selling docs UX
- On selecting an Item in Quotation/Sales Order, ERPNext pre-fills row.description using standard Item fields (item_name/description).
- CM description lines were not automatically reflected, and “fill only if blank” logic is insufficient because rows are not blank in standard ERPNext flows.

A4) Navigation + shortcuts
- Products Console entry points already existed and were validated by existing smoke checks.

---

## FILES

### Python modules / hooks
- `casamoderna_dms/hooks.py`
  - Added Item validate hook to keep `cm_display_name` synced.
  - Added parent validate hook for Quotation/Sales Order to auto-fill row descriptions safely.
- `casamoderna_dms/item_display.py` (new)
  - Computes `cm_display_name` and keeps it in sync.
  - Backfill helper for existing Items.
- `casamoderna_dms/selling_row_description.py` (new)
  - Parent-level selling-doc row description integration (batched Item lookup).
- `casamoderna_dms/ux_integration_audit.py` (new)
  - Audit helper returning *effective* meta (Property Setter applied) + field metadata.

### Patches
- `casamoderna_dms/patches/ux_integration_item_link_search_and_title.py` (new)
  - Reversible Property Setter integration:
    - Item `title_field` → `cm_display_name`
    - Item `search_fields` includes `cm_given_name`, `cm_supplier_code`, `cm_display_name`
    - Item `show_title_field_in_link` → 1
- `casamoderna_dms/patches/ux_integration_backfill_item_display_name.py` (new)
  - Backfills `Item.cm_display_name` for existing items.
- `casamoderna_dms/patches.txt`
  - Registered the UX integration patches.

### Fixtures
- `casamoderna_dms/fixtures/custom_field.json`
  - Updated:
    - `Item-cm_given_name`: label now “CM Name”; enabled `in_global_search=1`, `search_index=1`
    - `Item-cm_supplier_code`: enabled `in_global_search=1`, `search_index=1`
  - Added:
    - `Item-cm_display_name`: hidden + read-only + indexed/global-searchable (used as native title/search target)
- `casamoderna_dms/fixtures/client_script.json`
  - Updated `Item - CasaModerna Pricing Ops`:
    - Adds a minimal native “headline” using `frm.dashboard.set_headline()`:
      - RRP (Ex VAT)
      - Final Offer (Inc VAT)
      - Effective Discount
    - No extra server calls added.

### Smoke / stabilisation
- `casamoderna_dms/stabilisation_gate.py`
  - Added deterministic checks:
    - Link dialog search finds Items by CM name and Supplier Code.
    - Quotation row.description auto-fills from CM description lines and does not override manual edits.
    - Minimal “no internal cm_ label leaks” check for key fields.

---

## COMMANDS

### Inspection
- Effective Item meta + field metadata:
  - `bench --site casamoderna-staging.local execute casamoderna_dms.ux_integration_audit.audit_item_search_integration --kwargs "{'sample_txt':'CM Name'}"`
  - `bench --site two.casamodernadms.eu execute casamoderna_dms.ux_integration_audit.audit_item_search_integration --kwargs "{'sample_txt':'CM Name'}"`

### Apply changes
- Migrate (runs patches + applies fixtures):
  - `bench --site casamoderna-staging.local migrate`
  - `bench --site two.casamodernadms.eu migrate`
- Clear cache:
  - `bench --site casamoderna-staging.local clear-cache`
  - `bench --site two.casamodernadms.eu clear-cache`

### Stabilisation gate (must be green on both)
- Full gate smoke (inventory + existing smokes + matrix):
  - `bench --site casamoderna-staging.local execute casamoderna_dms.stabilisation_gate.smoke --kwargs "{'create_docs': 1}"`
  - `bench --site two.casamodernadms.eu execute casamoderna_dms.stabilisation_gate.smoke --kwargs "{'create_docs': 1}"`

---

## RESULT

### Phase B — Native ERPNext UX Integrations

B1) `cm_given_name` behaves like the commercial display name
- Added computed `cm_display_name` and set Item `title_field` (effective meta) to `cm_display_name`.
- `cm_display_name` is computed as:
  - `item_name` if no CM name
  - `cm_given_name` if no item_name
  - otherwise `"{item_name} — {cm_given_name}"` (unless already contained)
- Lightweight + reversible (Property Setter only; no core overrides).

B2) `cm_supplier_code` searchable in link dialogs and list search
- Included `cm_supplier_code` in Item `search_fields` (effective meta) and enabled indexing/global-search flags.

B3) Quotation/SO row description auto-fill from CM description lines
- Implemented parent-level validate hook:
  - Only replaces when the existing description is blank OR equals ERPNext-default (Item.description or Item.item_name).
  - Never overwrites truly manual edits.
  - Does not touch pricing logic.

B4) Minimal native “Pricing summary” on Item header/dashboard
- Added a small Item dashboard headline (no extra DB calls):
  - RRP Ex VAT, Final Offer Inc VAT, Effective Discount

B5) No internal technical artifacts in UI
- Updated user-facing label for `cm_given_name` to “CM Name”.
- Added stabilisation check preventing `cm_` label leaks for key integrated fields.

### Phase C — Minimise custom UI friction
- Integrations favor native ERPNext mechanisms:
  - Property Setter for DocType meta (`title_field`, `search_fields`, `show_title_field_in_link`)
  - Doc events for deterministic, low-overhead behavior
  - One batched Item lookup per selling doc validate (no per-row queries)

---

## SUCCESS CHECKS

### Stabilisation Gate
- Gate is green on both sites after integration.
- Evidence JSON written on each site:
  - Staging:
    - `sites/casamoderna-staging.local/private/files/cm_stabilisation/inventory_2026-03-03.json`
    - `sites/casamoderna-staging.local/private/files/cm_stabilisation/matrix_2026-03-03.json`
  - two:
    - `sites/two.casamodernadms.eu/private/files/cm_stabilisation/inventory_2026-03-03.json`
    - `sites/two.casamodernadms.eu/private/files/cm_stabilisation/matrix_2026-03-03.json`

### Contract Success Criteria Mapping
- Search/select products using CM names + supplier codes naturally:
  - Link dialog search_fields include `cm_given_name`, `cm_supplier_code`, `cm_display_name`.
- Sales rows show CM description automatically:
  - Parent validate hook fills descriptions when the existing text is ERPNext-default.
- Pricing summary feels native:
  - Headline on Item dashboard/header uses existing derived fields.
- No internal/dev artifacts:
  - Key label leak test added; `cm_given_name` label no longer exposes internal naming.

---

## ROLLBACK

All rollback options are non-destructive.

1) Undo Item title/search integration
- Remove these Property Setters:
  - `Item-title_field`
  - `Item-search_fields`
  - `Item-show_title_field_in_link`
- Then:
  - `bench --site <site> clear-cache`

2) Disable row description auto-fill
- Remove `casamoderna_dms.selling_row_description.fill_sales_doc_row_descriptions` from Quotation/Sales Order `validate` hooks in `casamoderna_dms/hooks.py`.
- Then:
  - `bench --site <site> clear-cache`

3) Disable Item display name sync
- Remove `casamoderna_dms.item_display.sync_item_display_name` from Item validate hooks.
- `cm_display_name` field can remain (harmless), or it can simply be unused.
