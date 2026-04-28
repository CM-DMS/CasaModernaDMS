# Contract Reset Slice Report — Item > Suppliers & Pricing Tab Rebuild

Date: 2026-03-03

Scope: Corrective reset of the **Item → Suppliers & Pricing** tab to a V1-like commercial ladder flow (Suppliers → Pipeline → Inputs → Landed → Calculated Steps → Selling → Additional Purchase Controls). Add missing ladder fields and **server-side** deterministic calculations. Ensure internal/dev tokens are not exposed to business users.

Sites validated:
- `casamoderna-staging.local`
- `two.casamodernadms.eu`

App: `casamoderna_dms`

---

## PLAN (Mandated Phases A–G)

A) Hard audit: list effective purchasing_tab fields in order (including Property Setter effects), find missing ladder concepts, and identify leftovers.

B) Define a complete ladder data model (inputs + calculated outputs) that matches the commercial flow.

C) Implement missing Custom Fields + deterministic server-side calculations (Item validate hook) without breaking existing selling logic.

D) Rebuild the tab layout in the required section order.

E) Isolate ERPNext leftovers under “Additional Purchase Controls”.

F) Validate usability: the screen supports the real workflow.

G) Update smoke to enforce structure, math, and “no internal wording/tokens”.

---

## CURRENT STATE FOUND (Phase A)

Evidence source:
- `casamoderna_dms/contract_reset_suppliers_pricing_audit.py` → `inspect_item_suppliers_pricing_tab()`

Findings (both sites were identical before changes):
- Suppliers existed but ladder inputs were missing (supplier list price, discount ladder, landed inputs).
- Landed Additions and Calculated Steps were placeholders (HTML-only), not real ladder fields.
- Selling outputs existed (RRP → discount → rounding), but upstream ladder was absent.
- Internal rounding mode tokens were visible in UI (not business-friendly).

---

## DATA MODEL (Phase B)

Added ladder inputs (Item Custom Fields):
- Supplier identity extensions: `cm_supplier_item_code`, `cm_supplier_item_name`, `cm_supplier_currency`, `cm_supplier_pack`
- Ladder inputs: `cm_supplier_list_price_ex_vat`, `cm_increase_before_percent`, `cm_discount_1_percent`, `cm_discount_2_percent`, `cm_discount_3_percent`, `cm_increase_after_percent`
- Landed inputs: `cm_shipping_percent`, `cm_shipping_fee`, `cm_handling_fee`, `cm_other_landed`
- UI pricing mode: `cm_pricing_mode_ui` (business-facing select)

Added ladder calculated outputs (Item Custom Fields, read-only):
- Step outputs: `cm_after_increase_before_ex_vat`, `cm_after_discount_1_ex_vat`, `cm_after_discount_2_ex_vat`, `cm_after_discount_3_ex_vat`
- Purchase/cost outputs: `cm_purchase_price_ex_vat`, `cm_landed_additions_total_ex_vat`, `cm_cost_ex_vat_calculated`
- VAT context output: `cm_vat_rate_percent`

---

## IMPLEMENTATION (Phase C)

Server-side logic:
- `casamoderna_dms/cm_pricing.py`
  - Adds ladder calculation (`apply_supplier_ladder(doc)`) and integrates it into `apply_item_pricing(doc, method=None)`.
  - Ladder runs even if `cm_rrp_ex_vat` is blank, so the upstream supplier/cost ladder is usable independently.
  - Selling engine behavior is preserved (discount on VAT-inclusive, rounding rules; tile vs whole-euro mode).

Client-side UX safety:
- `casamoderna_dms/fixtures/client_script.json`
  - Keeps internal rounding mode in sync with `cm_pricing_mode_ui` (business-facing).

Internal token hiding:
- `casamoderna_dms/fixtures/property_setter.json`
  - Hides `cm_pricing_rounding_mode` so the internal option tokens are not shown.

---

## LAYOUT (Phases D–E)

Deterministic field ordering is enforced via DocType `field_order` Property Setter patch.

Patches:
- `casamoderna_dms/patches/contract_reset_ensure_item_suppliers_pricing_field_order.py`
  - First attempt (created an unused property setter name on this bench).
- `casamoderna_dms/patches/contract_reset_apply_item_field_order_property_setter.py`
  - Fixes the root cause by updating the active DocType-level `Item.field_order` Property Setter (commonly `Item-main-field_order`).
  - Ensures ladder fields are placed under the correct sections in the required order.

“Additional Purchase Controls” section:
- Renamed and used as the container for standard ERPNext purchase controls and other leftovers.

---

## SMOKE (Phase G)

Updated:
- `casamoderna_dms/smoke_checks_products_console.py`
  - Replaced the old “Contract 16 Suppliers & Pricing flow” block with a “Contract Reset” ladder flow check.
  - Enforces:
    - Sections appear in the correct order.
    - Representative ladder fields exist and are ordered sensibly.
    - Internal rounding mode is hidden; business UI uses `cm_pricing_mode_ui`.
    - No placeholder/dev wording remains in helper HTML.

---

## COMMANDS RUN (Evidence)

Migrations:
- `bench --site casamoderna-staging.local migrate`
  - Confirmed execution of `casamoderna_dms.patches.contract_reset_apply_item_field_order_property_setter`.
- `bench --site two.casamodernadms.eu migrate`
  - Patch log confirmed applied on that site.

Smoke:
- `bench --site casamoderna-staging.local execute casamoderna_dms.smoke_checks_products_console.run`
- `bench --site two.casamodernadms.eu execute casamoderna_dms.smoke_checks_products_console.run`

Server-side pricing sanity (no DB writes):
- `bench --site casamoderna-staging.local execute casamoderna_dms.contract_reset_pricing_sanity.run`
- `bench --site two.casamodernadms.eu execute casamoderna_dms.contract_reset_pricing_sanity.run`

Expected/observed highlights:
- Whole-euro mode rounds up final offer inc VAT (example produced `discounted_inc_vat=206.5` → `final_offer_inc_vat=207.0`, `rounding_delta=0.5`).
- Tiles mode keeps 2 decimals (`final_offer_inc_vat=206.5`).

---

## RESULT

- Suppliers & Pricing tab now matches the required commercial ladder flow.
- Ladder inputs + intermediate calculated steps + landed additions + computed cost are present.
- Selling outputs remain consistent with the existing pricing engine behavior.
- Selling layout improved: Selling outputs/profitability are presented in a compact 6-column grid (HTML) while the underlying fields remain present (hidden) for compatibility.
- Internal/dev tokens are hidden from business UI; business-facing mode field is used.
- Deterministic ordering is enforced across both sites.

---

## SUCCESS CHECKS

1) Live layout audit output shows ladder fields under their intended sections.
2) Smoke checks pass on both sites.
3) Pricing sanity module passes assertions and prints consistent JSON on both sites.

---

## ROLLBACK (If Needed)

- Revert fixtures (Custom Fields / Property Setters / Client Script) by reverting the JSON fixture edits and migrating.
- Revert ordering by removing/updating the DocType `Item.field_order` Property Setter.
- The server-side ladder calc is additive; remove by reverting `casamoderna_dms/cm_pricing.py` changes.

---

## Files Touched (High Level)

- `casamoderna_dms/cm_pricing.py`
- `casamoderna_dms/fixtures/custom_field.json`
- `casamoderna_dms/fixtures/property_setter.json`
- `casamoderna_dms/fixtures/client_script.json`
- `casamoderna_dms/patches/contract_reset_add_selling_grid_to_item_field_order.py`
- `casamoderna_dms/patches/contract_reset_ensure_item_suppliers_pricing_field_order.py`
- `casamoderna_dms/patches/contract_reset_apply_item_field_order_property_setter.py`
- `casamoderna_dms/patches.txt`
- `casamoderna_dms/smoke_checks_products_console.py`
- `casamoderna_dms/contract_reset_suppliers_pricing_audit.py`
- `casamoderna_dms/contract_reset_pricing_sanity.py`

---

## Post-Reset Layout Improvement: 6-Column Selling Grid

User request: “divide our pricing rows into six columns”.

Implementation:
- Added Item HTML field `cm_selling_summary_grid` to the Selling section.
- Hid the old per-row selling outputs and profitability fields (`cm_rrp_inc_vat`, `cm_discounted_inc_vat`, `cm_final_offer_*`, `cm_rounding_delta`, `cm_discount_percent`, `cm_profit_ex_vat`, `cm_margin_percent`, `cm_markup_percent`).
- Rendered two rows of 6 columns via client script (Row 1: selling outputs; Row 2: purchase/landed/cost/profitability).
- Enforced deterministic placement in `field_order` via `contract_reset_add_selling_grid_to_item_field_order`.

Evidence commands:
- `bench --site casamoderna-staging.local migrate`
- `bench --site two.casamodernadms.eu migrate`
- `bench --site <site> execute casamoderna_dms.smoke_checks_products_console.run`
