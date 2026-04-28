# CasaModerna ERPNext Forensic Audit Report

**Date:** 2026-03-05
**Auditor:** Automated forensic agent (read-only)
**Mode:** Read-only inspection — no changes made

---

## 1. Executive Summary

The CasaModerna ERPNext deployment is a **moderately over-customised** system that has accumulated significant modifications through multiple AI-driven "slice" and "contract" iterations. The customisations largely follow ERPNext-safe patterns (custom app, Property Setters, Custom Fields, doc_events hooks) rather than core hacking, which is positive. However, the **volume and aggressiveness** of the modifications has created several material risks.

### Main Risk Themes

1. **Two "sites" share the same database** — `casamoderna-staging.local` and `two.casamodernadms.eu` both connect to `_f34a597d4aee1881`. They are aliases, not separate environments. There is no staging/production isolation.

2. **No version control** on the custom app — the entire `casamoderna_dms` app has no `.git` repository. There is zero change history, no ability to diff, rollback, or audit who changed what.

3. **542 Property Setters** in the database dominate the customisation surface. 384 of these set `hidden=1`, aggressively hiding standard ERPNext fields including critical financial fields like `taxes`, `outstanding_amount`, `status`, and `total` across all sales documents.

4. **Parallel business systems** replace native ERPNext mechanisms for pricing, numbering, customer address capture, and credit management — creating dual-path complexity and upgrade fragility.

5. **Whitelisted API endpoints lack permission checks** — 16+ conversion endpoints and 3 proforma endpoints are callable by any authenticated user with no explicit permission verification.

6. **Client-side DOM surgery** in the sales doc shell JS detaches and repositions Frappe toolbar buttons — the single most fragile pattern in the codebase.

### Overall Judgement

The system is **functional but fragile**. The customisations mostly avoid core hacking (frappe/erpnext source is clean), which is a significant positive. However, the aggressive field hiding, parallel business logic systems, missing permission checks on APIs, absence of version control, and mono-database "multi-site" setup collectively create a system that is risky to maintain, upgrade, and trust operationally.

### ERPNext-First Design Compliance

**Partially respects** — Custom Fields and Property Setters are ERPNext-standard mechanisms. However, the extent of their use (542 Property Setters, 384 hidden fields) goes well beyond typical customisation and into territory that distorts the standard ERPNext experience. The parallel pricing engine, parallel numbering system, and parallel credit system deviate from ERPNext-first design.

---

## 2. Audit Scope

### Environments Inspected

| Site | Database | Role |
|------|----------|------|
| `casamoderna-staging.local` | `_f34a597d4aee1881` | Default site |
| `two.casamodernadms.eu` | `_f34a597d4aee1881` | DNS alias to same DB |

**Critical finding:** Both sites share the same MariaDB database. They are not separate environments.

### Repositories / Apps Inspected

| App | Version | Branch | Core Modified? | VCS? |
|-----|---------|--------|----------------|------|
| frappe | 15.101.2 | version-15 | **No** (clean) | Git (shallow) |
| erpnext | 15.99.1 | version-15 | **No** (clean) | Git (shallow) |
| casamoderna_dms | 0.0.1 | N/A | N/A | **No git repo** |

### Configs / Fixtures / Metadata Inspected

- `common_site_config.json`, both `site_config.json` files
- `hooks.py` (490 lines)
- `patches.txt` (37 registered patches)
- 9 fixture JSON files (Custom Field, Property Setter, Client Script, Workspace, Role, Print Format, List Filter, List View Settings, DocType)
- 542 Property Setter records in DB
- 21 Client Script records in DB
- 1 Server Script record (disabled)
- 1 Workflow (CM Sales Order Flow)
- 80 DocPerm rows for key doctypes
- 0 Custom DocPerm records
- CM Proforma + CM Proforma Item doctype definitions
- All 28+ Python business logic modules
- All patch files (40 files, 3,750 lines)
- JS/CSS public assets
- Log files (frappe.log, worker.error.log, bench.log, scheduler.log)

### Limitations

- No git history for `casamoderna_dms` — unable to trace change chronology
- Shallow clones for frappe/erpnext — only current commit visible
- Cannot inspect runtime JS console errors without browser access
- Cannot verify actual user experience without login credentials
- Both sites share the same DB so site-comparison is meaningless for data-level checks

---

## 3. Customisation Inventory

| Area | Artifact | Path / Record | Type | Safety | Notes |
|------|----------|---------------|------|--------|-------|
| Custom App | casamoderna_dms | `apps/casamoderna_dms/` | App | Standard-safe | Proper bench app structure |
| Custom DocType | CM Proforma | `casamoderna_dms/doctype/cm_proforma/` | Code-based DocType | Standard-safe | Non-submittable proforma document |
| Custom DocType | CM Proforma Item | `casamoderna_dms/doctype/cm_proforma_item/` | Code-based DocType | Standard-safe | Child table for CM Proforma |
| Custom DocType | CM Locality | DB (custom=1) | Custom DocType | Standard-safe | Selling module locality master |
| Custom Fields | 80+ cm_* fields | `fixtures/custom_field.json` | Fixture-managed | Standard-safe | Item, Customer, QT/SO items, Company |
| Custom Fields | 24 non-fixture fields | DB only | V1 numbering fields + misc | Risky | Not in fixtures — created by patches at runtime |
| Property Setters | 542 total (100 in fixture) | DB + `fixtures/property_setter.json` | Mixed | **Risky** | 442 not in fixture file — drift risk |
| Property Setters (hidden) | 384 fields hidden | DB | Aggressive hiding | **Risky** | Hides taxes, totals, status, outstanding |
| Client Scripts | 21 (18 enabled, 3 disabled) | DB + `fixtures/client_script.json` | Mixed | Risky | 13 not in fixture file |
| Server Scripts | 1 (disabled) | DB | Inactive | Informational | Auto Username script |
| Workflow | CM Sales Order Flow | DB | Active | Standard-safe | Draft→Pending→Confirmed |
| Roles | 6 custom roles | `fixtures/role.json` + DB | Fixture-managed | Standard-safe | CM Super Admin, Sales/Products/Suppliers consoles |
| DocPerms | Standard-only (0 custom) | DB `tabDocPerm` | Standard | Standard-safe | Policy enforced by stabilisation gate |
| Print Formats | 2 custom | `fixtures/print_format.json` | Fixture-managed | Standard-safe | CasaModerna SO + QT |
| Workspaces | 3 custom | `fixtures/workspace.json` | Fixture-managed | Standard-safe | Sales/Products/Suppliers consoles |
| List Filters | 17 custom | `fixtures/list_filter.json` | Fixture-managed | Standard-safe | Pre-defined filter views |
| Reports | 2 custom | `report/customer_family_*` | Code-based | Standard-safe | Customer hierarchy reports |
| Patches | 37 registered | `patches.txt` + `patches/` | Migration patches | Standard-safe | Idempotent property setter patches |
| JS (global) | cm_sales_doc_shell.js | `public/js/` (362 lines) | `app_include_js` | **Risky** | DOM surgery, toolbar manipulation |
| CSS (global) | cm_sales_doc_shell.css | `public/css/` (152 lines) | `app_include_css` | Standard-safe | Clean BEM styling |
| Doc Events | 10 doctypes hooked | `hooks.py` | Hook-based | Standard-safe | Customer, Item, 7 sales docs, Address |
| After Migrate | CM Locality seed | `hooks.py` | Hook-based | Standard-safe | Idempotent locality data seeding |
| Whitelisted APIs | ~22 endpoints | Various .py modules | API | **Risky** | Several lack permission checks |

---

## 4. Major Findings

### Finding 01 — Both Sites Share Same Database (No Staging Isolation)

- **Severity:** Critical
- **Confidence:** Confirmed
- **Area:** Infrastructure / Environment
- **Summary:** `casamoderna-staging.local` and `two.casamodernadms.eu` both use `db_name: _f34a597d4aee1881` with identical `db_password`. They are not separate environments — they are the same database accessed via two DNS names.
- **Evidence:**
  - `sites/casamoderna-staging.local/site_config.json` → `db_name: _f34a597d4aee1881`
  - `sites/two.casamodernadms.eu/site_config.json` → `db_name: _f34a597d4aee1881`
  - `SELECT DATABASE()` returns `_f34a597d4aee1881` for both sites
  - `staging` site has `encryption_key` that `two` doesn't — suggesting config was copied and partially edited
- **Why this is a problem:** There is no staging/production separation. Every change, migration, and patch affects the "production" data immediately. Any test document creation (including stabilisation gate `create_docs=1`) creates real records in production.
- **Expected factory ERPNext behaviour:** Separate databases per site for staging vs production.
- **Likely impact:** No safe testing environment. Data corruption in testing directly affects production.
- **Environment(s) affected:** Both (they are the same)
- **Appears:** Likely accidental — the site was probably cloned/configured incorrectly

### Finding 02 — Custom App Has No Git Repository

- **Severity:** Critical
- **Confidence:** Confirmed
- **Area:** Source Control / Operations
- **Summary:** `/home/frappe/frappe/casamoderna-bench/apps/casamoderna_dms/` has no `.git` directory. There is zero version history for any custom code.
- **Evidence:** `git status` in the directory returns "fatal: not a git repository"
- **Why this is a problem:** No ability to roll back changes, diff between versions, identify who changed what, or audit the chronology of modifications. If files are accidentally deleted or corrupted, they are unrecoverable.
- **Expected factory ERPNext behaviour:** Custom apps should be maintained in version control.
- **Likely impact:** Complete loss of change history. Unable to reconstruct state before any given modification.
- **Environment(s) affected:** Both

### Finding 03 — 384 Standard Fields Hidden via Property Setters

- **Severity:** High
- **Confidence:** Confirmed
- **Area:** UI / Data Visibility / Operational Risk
- **Summary:** 384 Property Setter records set `hidden=1` on standard ERPNext fields across 27+ doctypes. This includes critical financial and operational fields.
- **Evidence:** `SELECT COUNT(*) FROM tabProperty Setter WHERE property="hidden"` → 384
- **Critical fields hidden (value=1) across ALL sales docs (QT/SO/DN/SI/POS):**

  | Field | Impact |
  |-------|--------|
  | `taxes` | Users cannot see or manually adjust tax table |
  | `taxes_and_charges` | Tax template selector hidden |
  | `total` | Net total hidden |
  | `rounded_total` | Rounded total hidden |
  | `additional_discount_percentage` | Cannot apply additional discounts |
  | `discount_amount` | Discount amount hidden |
  | `payment_terms_template` | Payment terms selector hidden |
  | `status` (SI, POS) | Document status field hidden |
  | `outstanding_amount` (SI, POS) | Outstanding payment amount hidden |
  | `posting_time` (DN, SI, POS) | Posting time hidden |

- **Why this is a problem:** Users cannot see taxes applied to documents, cannot verify outstanding amounts on invoices, cannot see document status, and cannot manage payment terms — all via the standard form. The custom "shell" UI may provide alternatives for some of these, but this creates a fragile dependency where the shell JS must work perfectly or users lose visibility into critical financial data.
- **Expected factory ERPNext behaviour:** These fields are visible by default because they are operationally important.
- **Likely impact:** If the custom shell JS breaks or doesn't load, users see forms with no tax information, no totals breakdown, no status, and no outstanding amounts. Tax configuration errors may go unnoticed.
- **Environment(s) affected:** Both
- **Appears:** Intentional (documented in slice 016/016b/017/018/021/023) but aggressively over-scoped

### Finding 04 — Whitelisted API Endpoints Without Permission Checks

- **Severity:** High
- **Confidence:** Confirmed
- **Area:** Security / Permissions
- **Summary:** `sales_doc_conversions.py` exposes 16 `@frappe.whitelist()` endpoints and `proforma_pf.py` exposes 3 endpoints, none of which perform explicit permission checks before creating documents.
- **Evidence:**
  - `sales_doc_conversions.py`: `create_so_from_qt`, `create_dn_from_so`, `create_in_from_so`, `create_in_from_dn`, `create_pf_from_qt`, `create_pf_from_so`, `create_cs_from_qt`, `create_cs_from_so`, + 8 thin wrappers
  - `proforma_pf.py`: `create_proforma_from_quotation`, `create_proforma_from_sales_order`, `issue_proforma`
  - None call `frappe.has_permission()` or check `frappe.get_roles()`
- **Why this is a problem:** Any authenticated desk user can call these endpoints directly (e.g., via browser console or API client) to create Sales Orders, Delivery Notes, Sales Invoices, POS Invoices, and Proformas. The `insert()` call provides some DocPerm gating, but creating a Sales Invoice from a Sales Order doesn't check whether the user has read access to the source Sales Order.
- **Expected factory ERPNext behaviour:** ERPNext's standard conversion buttons respect the user's permissions. Custom equivalents should do the same.
- **Likely impact:** Users with minimal permissions (e.g., Products Console only) could potentially create sales documents by directly calling the API.
- **Environment(s) affected:** Both

### Finding 05 — Fragile DOM Surgery in Sales Doc Shell JS

- **Severity:** High
- **Confidence:** Confirmed
- **Area:** UI / Upgradeability
- **Summary:** `cm_sales_doc_shell.js` (loaded globally via `app_include_js`) detaches Frappe toolbar buttons from the page header and repositions them into a custom HTML shell inserted before `.form-layout`.
- **Evidence:**
  - `public/js/cm_sales_doc_shell.js` line ~120+: `_moveConvertGroupIntoBar` — finds toolbar buttons by text content matching, detaches from DOM, re-appends into custom shell
  - `_findToolbarButtonByText` — iterates all `button, a` elements to match by text
  - Uses `setTimeout(300ms)` retry to catch late-rendering buttons
  - `_openPaymentTerms` — finds tabs by text content matching against `'terms'`
  - Inserts custom HTML container before `.form-layout`
- **Why this is a problem:** This pattern will break when:
  - Frappe re-renders the toolbar (happens during `refresh` cycles)
  - Button labels change (translation or ERPNext update)
  - Frappe restructures `.form-layout`, toolbar markup, or tab rendering
  - Users switch to a non-English language
- **Expected factory ERPNext behaviour:** Custom UI should use `frm.add_custom_button()`, `frm.page.add_inner_button()`, or Frappe's documented extensibility hooks rather than DOM surgery.
- **Likely impact:** Broken Convert/PDF buttons after Frappe/ERPNext upgrades. Silent failure — buttons simply disappear.
- **Environment(s) affected:** Both

### Finding 06 — Parallel Pricing Engine Replaces Native ERPNext Pricing

- **Severity:** High
- **Confidence:** Confirmed
- **Area:** Business Logic / Data Model Duplication
- **Summary:** `cm_pricing.py` + `cm_sales_pricing.py` implement a complete parallel pricing system that replaces ERPNext's Item Price, Pricing Rule, and margin calculation mechanisms.
- **Evidence:**
  - `cm_pricing.py` (240 lines): Computes supplier cost ladder and selling prices directly on Item custom fields
  - `cm_sales_pricing.py` (155 lines): Maps Item pricing into QT/SO rows at validate time, directly setting `row.rate`
  - ~30 custom `cm_*` fields on Item for pricing pipeline
  - `cm_rrp_ex_vat`, `cm_final_offer_ex_vat`, `cm_cost_ex_vat`, etc.
  - `hooks.py` registers pricing hooks on Item, Quotation, and Sales Order `validate`
- **Why this is a problem:**
  - ERPNext's native Item Price, Pricing Rule, and margin calculations are bypassed
  - If standard pricing is accidentally re-enabled (e.g., by adding a Pricing Rule), it will conflict
  - VAT computation depends on a custom field `cm_vat_rate_percent` on Company rather than ERPNext's Tax Templates
  - `row.rate` is directly mutated, which can conflict with ERPNext's own rate calculations during `calculate_taxes_and_totals()`
- **Expected factory ERPNext behaviour:** Use Item Price + Pricing Rule + Tax Templates
- **Likely impact:** Dual pricing paths. Confusion when trying to use ERPNext pricing features. Potential rate conflicts. Upgrade risk if ERPNext changes pricing flow internals.

### Finding 07 — Parallel V1 Numbering System

- **Severity:** Medium
- **Confidence:** Confirmed
- **Area:** Business Logic / Data Model Duplication
- **Summary:** `v1_numbering.py` (480 lines) implements a three-tier parallel numbering system (draft → operational → fiscal) that overlays ERPNext's native naming series.
- **Evidence:**
  - Custom fields: `cm_v1_draft_no`, `cm_v1_operational_no`, `cm_v1_fiscal_record_no` on 7 doctypes
  - Uses `frappe.model.naming.getseries()` — internal undocumented API
  - Calls `frappe.set_user("Administrator")` for setup
  - Sets `DocType.default_print_format` programmatically
  - 24 custom fields exist in DB but NOT in the Custom Field fixture file
- **Why this is a problem:**
  - Creates a parallel identity layer — ERPNext internal names vs V1 display names
  - `getseries()` is an undocumented internal API that could change between versions
  - `db_set(update_modified=False)` bypasses audit tracking
  - Non-fixture custom fields can drift between environments
- **Expected factory ERPNext behaviour:** ERPNext naming series can be customised via Property Setters on `naming_series` options/default. Custom number formats should use `autoname` in DocType JSON.

### Finding 08 — Customer Sync Creates Records with `ignore_permissions=True`

- **Severity:** Medium
- **Confidence:** Confirmed
- **Area:** Security / Permissions
- **Summary:** `customer_sync.py` creates Address and Contact records using `insert(ignore_permissions=True)` and `save(ignore_permissions=True)`, meaning any user who can save a Customer can create arbitrary Address and Contact records.
- **Evidence:**
  - `customer_sync.py` lines ~200+: Address creation with `addr.insert(ignore_permissions=True)`
  - Contact creation with `contact.insert(ignore_permissions=True)`
  - `address_tools.py`: `copy_customer_billing_to_delivery` also uses `ignore_permissions=True`
- **Why this is a problem:** A user with only Customer write permission can create Address/Contact records they should not be able to create. This bypasses the standard ERPNext permission model for Address/Contact.
- **Expected factory ERPNext behaviour:** ERPNext links Customer→Address/Contact through Dashboard Links. The user needs Address/Contact create permission.

### Finding 09 — `frappe.set_user("Administrator")` Privilege Escalation Pattern

- **Severity:** Medium
- **Confidence:** Confirmed
- **Area:** Security
- **Summary:** Multiple modules call `frappe.set_user("Administrator")` to bypass permission checks. While most are bench-execute-only, one is in a whitelisted endpoint.
- **Evidence:**
  - `v1_numbering.py` — `_ensure_print_format()` calls `frappe.set_user("Administrator")`
  - `sales_order_confirm.py` — `audit_sales_order_pending_confirm_action()` is `@frappe.whitelist()` and calls `frappe.set_user("Administrator")`
  - `permissions_guardrails.py`, `sales_order_workflow.py`, `stabilisation_gate.py` — bench-execute patterns
- **Why this is a problem:** `audit_sales_order_pending_confirm_action` is callable by any authenticated user and escalates to Administrator context. Although it's read-only, it returns detailed workflow configuration data.
- **Expected factory ERPNext behaviour:** Never use `frappe.set_user("Administrator")` in whitelisted methods. Use `frappe.has_permission()` or role checks.

### Finding 10 — Property Setter Fixture Drift (542 in DB vs 100 in Fixture)

- **Severity:** Medium
- **Confidence:** Confirmed
- **Area:** Configuration Management / Upgradeability
- **Summary:** The fixture file contains 100 Property Setter records, but the database contains 542. The remaining 442 are created by patches at runtime and are not captured in the fixture file.
- **Evidence:**
  - `fixtures/property_setter.json`: 100 records
  - DB count: 542 records
  - Missing records were created by: `slice016`, `slice016b`, `slice017`, `slice018`, `slice021`, `slice023`, and other patches
- **Why this is a problem:**
  - Fixtures are the canonical source of truth for ERPNext customisations. If fixtures are re-imported (e.g., `bench --site X install-app`), only 100 records will exist — the other 442 require patches to run.
  - Makes it impossible to reason about the true state of the system from source code alone.
  - Fixture import + patch execution ordering must be perfect or the system enters an inconsistent state.
- **Expected factory ERPNext behaviour:** All Property Setters should be captured in fixtures OR created by patches — but the approach should be consistent.

### Finding 11 — Client Script Fixture Drift (21 in DB vs 8 in Fixture)

- **Severity:** Medium
- **Confidence:** Confirmed
- **Area:** Configuration Management
- **Summary:** The fixture file contains 8 Client Scripts, but the database has 21 (18 enabled, 3 disabled). 13 Client Scripts exist only in the database and are not tracked in the fixture.
- **Evidence:**
  - `fixtures/client_script.json`: 8 records
  - DB records include 13 additional scripts: Sales Doc Shell scripts (5 for QT/SO/DN/SI/POS + CM Proforma), Conversion scripts (3 for QT/SO/DN), Customer V1 Panels, and 3 disabled legacy scripts
- **Why this is a problem:** Non-fixture Client Scripts are created by patches. They are not reproducible from source alone. If the database is rebuilt, these scripts are lost unless all patches re-run successfully.

### Finding 12 — Taxes Table Hidden Across All Sales Documents

- **Severity:** High
- **Confidence:** Confirmed
- **Area:** Financial Operations / Compliance
- **Summary:** The `taxes` child table and `taxes_and_charges` template selector are hidden on Quotation, Sales Order, Delivery Note, Sales Invoice, and POS Invoice.
- **Evidence:** Property Setters `<DocType>-taxes-hidden = 1` and `<DocType>-taxes_and_charges-hidden = 1` for all 5 sales doctypes
- **Why this is a problem:**
  - Users cannot see which tax template is applied to a document
  - Users cannot verify tax amounts on individual line items
  - If the wrong tax template is auto-applied (or none is), the error is invisible to the user
  - In a VAT-regulated jurisdiction (Malta), inability to see/verify tax details on sales documents is a compliance risk
  - The custom shell's "Totals" panel may show `grand_total` but not the tax breakdown
- **Expected factory ERPNext behaviour:** Tax table is visible and editable on sales documents by default
- **Likely impact:** Tax errors go unnoticed. Compliance risk.

### Finding 13 — Outstanding Amount Hidden on Sales Invoice

- **Severity:** Medium
- **Confidence:** Confirmed
- **Area:** Financial Operations
- **Summary:** `outstanding_amount` is hidden on Sales Invoice and POS Invoice via Property Setters.
- **Evidence:** `Sales Invoice-outstanding_amount-hidden = 1`, `POS Invoice-outstanding_amount-hidden = 1`
- **Why this is a problem:** Users cannot see how much is still owed on an invoice from the invoice form itself. This is a core accounts receivable visibility field.
- **Expected factory ERPNext behaviour:** `outstanding_amount` is visible on submitted Sales Invoices by default.

### Finding 14 — Parallel Credit System Duplicates Native ERPNext

- **Severity:** Medium
- **Confidence:** Confirmed
- **Area:** Data Model Duplication
- **Summary:** `customer_credit.py` implements a parallel credit limit and credit terms system using `cm_credit_limit` and `cm_credit_terms_days` custom fields, alongside balance computation from Sales Invoice outstanding amounts.
- **Evidence:**
  - `customer_credit.py` (156 lines)
  - Custom fields: `cm_credit_limit`, `cm_credit_terms_days`, `cm_balance`, `cm_family_balance`
  - Role-based access control using substring matching: `_roles_containing("director")`
  - Direct SQL to compute balances from `tabSales Invoice`
- **Why this is a problem:** ERPNext has built-in `credit_limit` on Customer, a `Credit Limit` child table for per-company limits, and Credit Controller role gating. This parallel system creates dual credit paths and the substring-based role detection (`_roles_containing("director")`) could match unintended roles.

### Finding 15 — Sales Console Guardrails Block Standard ERPNext Flows

- **Severity:** Medium
- **Confidence:** Confirmed
- **Area:** Workflow / Standard Flow Deviation
- **Summary:** `sales_console.py` prevents direct creation of Delivery Notes and Sales Invoices. All must be derived from Sales Orders.
- **Evidence:**
  - `validate_derived_only_delivery_note()`: Throws if DN not created from SO
  - `validate_derived_only_sales_invoice()`: Throws if SI not created from SO/DN
  - `validate_delivery_note_sales_order_stock_only()`: Blocks placeholder items in DN
- **Why this is a problem:** While these may be valid business rules for CasaModerna, they block standard ERPNext flows that are expected to work (e.g., creating a standalone Sales Invoice for services, creating a Delivery Note directly). If a user needs to create a standalone invoice for exceptional circumstances, they cannot.
- **Expected factory ERPNext behaviour:** Direct DN/SI creation is allowed and controlled by permissions.

### Finding 16 — `update_modified=False` Used Extensively

- **Severity:** Low
- **Confidence:** Confirmed
- **Area:** Data Integrity / Audit Trail
- **Summary:** Multiple modules use `db_set(update_modified=False)` or `set_value(..., update_modified=False)` to bypass the `modified` timestamp update.
- **Evidence:** Found in `v1_numbering.py`, `customer_sync.py`, `customer_hierarchy.py`, `customer_credit.py`
- **Why this is a problem:** The `modified` timestamp is used by Frappe for optimistic locking and change detection. Bypassing it can cause:
  - Stale document conflicts in concurrent editing
  - `frappe.TimestampMismatchError` or, worse, silent data overwrites
  - Incorrect "last modified" display in UI

### Finding 17 — Bench Log Shows Previous Custom DocPerm Mass-Creation

- **Severity:** Medium
- **Confidence:** Confirmed
- **Area:** Permissions / Incident History
- **Summary:** The bench log contains evidence of a previous AI-driven action that created Custom DocPerm records for ALL non-child doctypes for "CM Super Admin" role, plus deleted all User Permissions for a specific user.
- **Evidence:** `logs/bench.log` dated 2026-03-01 18:51:34 and 18:53:16 — contains inline Python code that was executed via `bench execute`, creating Custom DocPerm rows for every DocType and deleting User Permissions
- **Why this is a problem:** This was a nuclear-level permission change that was later reversed (current Custom DocPerm count is 0, enforced by stabilisation gate). The fact that it happened indicates the system was in an inconsistent state, and AI modifications were making aggressive permission changes without proper scoping.
- **Expected factory ERPNext behaviour:** Custom DocPerm should be used sparingly and deliberately.

### Finding 18 — `frappe.log.1` Contains `ModuleNotFoundError: No module named 'casamoderna_dms'`

- **Severity:** Medium
- **Confidence:** Confirmed
- **Area:** System Stability
- **Summary:** Application logs show repeated `ModuleNotFoundError` for `casamoderna_dms` module on 2026-03-02, indicating the system was unable to load the custom app's Python module during that period.
- **Evidence:** `logs/frappe.log.1` — multiple `ModuleNotFoundError: No module named 'casamoderna_dms'` tracebacks with timestamps around 09:06-09:22 on 2026-03-02
- **Why this is a problem:** This means the web application was completely broken for some period — no request could be served because the custom app couldn't be imported. This could indicate a bad deployment, missing `__init__.py`, or a bench restart issue.
- **Likely impact:** Period of complete application downtime.

### Finding 19 — Stabilisation Gate Creates Test Users and Documents

- **Severity:** Low
- **Confidence:** Confirmed
- **Area:** Testing in Production
- **Summary:** `stabilisation_gate.py` (3,095 lines) creates test User accounts (`cm_stab_*@casamoderna.local`) and optionally creates test documents when `create_docs=1`.
- **Evidence:**
  - DB users: `cm_stab_super_admin@casamoderna.local`, `cm_stab_sales@casamoderna.local`, `cm_stab_maintainer@casamoderna.local`, `cm_stab_products@casamoderna.local` (all disabled)
  - Function `_ensure_test_user()` creates real User records with assigned roles
  - `run(create_docs=1)` creates real Quotations, Sales Orders, etc.
- **Why this is a problem:** Test data is being created in the production database (since both sites share the same DB). Test users exist in the system even though disabled.

### Finding 20 — Broad Exception Swallowing in selling_row_description.py

- **Severity:** Low
- **Confidence:** Confirmed
- **Area:** Code Quality / Debugging
- **Summary:** `selling_row_description.py` uses bare `except Exception: return` to silently swallow all errors during description filling.
- **Evidence:** `selling_row_description.py` — `except Exception: return` pattern
- **Why this is a problem:** If the description filling fails for any reason (missing field, changed API, data error), the error is silently hidden. This makes debugging extremely difficult.

---

## 5. Requested-vs-Implemented Drift

### Pattern 1: Excessive Field Hiding Beyond "Declutter"
The slice 016/016b documentation states the goal is to "reduce form clutter." However, hiding `taxes`, `outstanding_amount`, `status`, `total`, and `payment_terms_template` goes far beyond decluttering and removes critical operational visibility. This appears to be an AI over-interpretation of "hide unused fields" — these fields are operationally essential even if not used daily.

### Pattern 2: Parallel Pricing Engine Instead of Extending Item Price
The business need appears to be custom pricing calculations (supplier discounts → cost → markup → RRP). This could have been implemented using ERPNext's Item Price + custom calculation scripts that write to Item Price, preserving the native pricing workflow. Instead, a fully parallel system was built that bypasses Item Price and Pricing Rule entirely.

### Pattern 3: Parallel Numbering Instead of Custom Naming Series
The V1 numbering requirement (draft/operational/fiscal numbers) could have been partially achieved with ERPNext's naming series (custom `autoname` patterns) and format strings. Instead, a 480-line parallel system was built using internal APIs.

### Pattern 4: Sales Doc Shell as Parallel Form UI
Rather than using ERPNext's standard form layout with strategic field hiding/grouping, a complete parallel "shell" UI was overlaid on top of the form. This creates a dependency where the form is unusable without the shell (since most fields are hidden), and the shell is fragile (DOM surgery).

### Pattern 5: Customer Address Sync Instead of Using Dashboard Links
ERPNext's native Customer→Address/Contact linking via Dashboard Links was replaced with custom capture fields and sync logic. This adds ~480 lines of code for functionality that ERPNext provides natively.

### Pattern 6: Emergency Tools Indicating Previous Incidents
The existence of `emergency_docperm_recovery.py` (558 lines) and `permissions_guardrails.py` (252 lines) indicates previous permission model incidents where the system was in a broken state. These are reactive tools built after AI modifications caused problems — suggesting a pattern where AI changes broke things and more AI code was written to fix them.

---

## 6. Upgrade-Safety Risks

| Risk | Evidence | Impact on Upgrade |
|------|----------|-------------------|
| 542 Property Setters may collide with upstream field changes | DB records referencing standard field names | If ERPNext renames/removes fields, Property Setters become orphaned or conflict |
| `cm_sales_doc_shell.js` depends on DOM structure | `.form-layout`, toolbar selectors, tab text matching | Almost certain to break on major Frappe UI updates |
| `v1_numbering.py` uses `frappe.model.naming.getseries()` | Internal API call | Could change/disappear between versions |
| `sales_doc_conversions.py` uses standard mapper functions | `make_sales_order`, `make_delivery_note`, etc. | Safe but should be validated after updates |
| Custom fields `insert_after` references | 20+ Property Setters specifying `insert_after` | If upstream reorders fields, positions break |
| Pricing hooks directly set `row.rate` | `cm_sales_pricing.py` | If ERPNext changes rate calculation flow, conflicts possible |
| `set_pos_fields()` internal API | `sales_doc_conversions.py` | Could change/disappear |
| 384 hidden fields may include new upstream fields | Mass hiding patterns | New essential fields added by ERPNext would be hidden without review |

---

## 7. Permission / Security Risks

| Risk | Evidence | Severity |
|------|----------|----------|
| 16 conversion API endpoints with no permission checks | `sales_doc_conversions.py` `@frappe.whitelist()` | High |
| 3 proforma API endpoints with no permission checks | `proforma_pf.py` `@frappe.whitelist()` | High |
| `audit_sales_order_pending_confirm_action` escalates to Administrator | `sales_order_confirm.py` calls `frappe.set_user("Administrator")` in whitelist | Medium |
| `ignore_permissions=True` on Address/Contact creation | `customer_sync.py`, `address_tools.py` | Medium |
| Client-side-only field hiding (no server enforcement) | Customer Minimal View hides fields, no server read_only | Low |
| Substring-based role detection | `customer_credit.py` `_roles_containing("director")` | Low |
| `Desk User` on Item has all permissions set to 0 | Effectively blocks default desk access to Items | Informational |

---

## 8. Functional Regression Risks

| Risk | Evidence | Severity |
|------|----------|----------|
| Tax table hidden — errors undetectable | Property Setters hiding `taxes` on all sales docs | High |
| Outstanding amount hidden — AR visibility lost | `Sales Invoice-outstanding_amount-hidden=1` | Medium |
| Direct DN/SI creation blocked | `sales_console.py` guardrails | Medium |
| Payment terms hidden — cannot manage terms on documents | `payment_terms_template` hidden on all sales docs | Medium |
| Status field hidden on SI/POS | Cannot see document status from form | Medium |
| V1 numbering uses `db_set(update_modified=False)` | Potential concurrent editing conflicts | Low |
| Broad exception swallowing | `selling_row_description.py` | Low |
| Pricing race conditions | `cm_sales_pricing.py` sets `row.rate` then calls `calculate_taxes_and_totals()` | Low |
| 3 disabled Client Scripts remain in system | `Quotation - CasaModerna Proforma (PF)`, `Sales Order - CasaModerna Proforma (PF)`, `Sales Order - CasaModerna Pending Confirm Action` | Informational |

---

## 9. UI/UX Operational Damage

| Issue | Evidence | Severity |
|-------|----------|----------|
| Standard form unusable without shell JS | Fields hidden + shell overlay dependency | High |
| Tax information invisible on all sales docs | `taxes` and `taxes_and_charges` hidden | High |
| Customer form hides territory, lead, opportunity, default currency, price list for ALL users (no exemption) | Client Script "Customer - CasaModerna Minimal View", `EXEMPT_ROLES=[]` | Medium |
| Address form hides county, state for all sales users | Client Script "Address - CasaModerna Sales UX" | Low |
| Dashboard headlines overwritten by custom scripts | Item Pricing Ops, Supplier Profile | Low |
| Image field CSS hack on Item form | `.css()` directly modifies img element | Low |
| Global JS/CSS loaded on ALL desk pages | `app_include_js/css` for shell assets | Low (performance) |
| 17 list filters create significant filter dropdown clutter | `fixtures/list_filter.json` | Informational |

---

## 10. Suspected Root Causes

1. **AI over-implementation** — Multiple slices (016-023) each added more Property Setters, more Client Scripts, and more field hiding, with each iteration building on the previous one's approach rather than questioning whether the approach was correct.

2. **Parallel systems instead of extending ERPNext** — Rather than configuring/extending ERPNext's native pricing, naming, and credit systems, parallel mechanisms were built from scratch. This appears to be because the AI agent found it easier to build new systems than to understand and extend existing ERPNext ones.

3. **Fixture neglect** — As iterations progressed, new Client Scripts and Property Setters were created by patches rather than being added to fixtures. This created a growing gap between "what's in source" and "what's in the database."

4. **Reactive complexity** — Emergency recovery scripts (558 lines), permissions guardrails (252 lines), and a 3,095-line stabilisation gate indicate a pattern where previous AI work broke things and more code was written to detect/fix the breakage rather than preventing it.

5. **DOM-level UI work instead of Frappe API use** — The sales doc shell represents a decision to overlay a custom UI rather than customise the form through supported mechanisms. This was likely driven by wanting a specific visual result that Frappe's form API couldn't easily produce.

6. **Missing version control feedback loop** — Without git, there's no way to review what changed between iterations, leading to unchecked accumulation.

---

## 11. Safe vs Unsafe Customisation Split

### Likely Acceptable / Maintainable

- CM Locality custom DocType and seeding
- CM Proforma custom DocType
- Customer hierarchy (`cm_parent_customer`) — clean additive feature
- A/B customer split — simple and clean
- Credit note guardrails (invoice + cash sale) — additive validation
- Tile box-to-sqm conversion — clean domain logic
- Freetext placeholder validation — clean guardrail
- Custom roles (6 roles) — standard-safe
- Custom workspaces (3) — standard-safe
- List filters (17) — standard-safe
- Print formats (2) — standard-safe
- Custom reports (2) — standard-safe
- CSS file (`cm_sales_doc_shell.css`) — well-written, theme-aware
- `after_migrate` locality seed — idempotent, clean
- `doc_events` hook pattern — correct Frappe approach
- Sales Order workflow (CM Sales Order Flow) — uses standard Frappe Workflow
- Sales Order confirm action — proper role-check on confirm

### Likely Harmful / Brittle / Off-Brief

- 384 hidden fields via Property Setters (especially taxes, status, outstanding)
- Sales doc shell JS (DOM surgery, toolbar manipulation)
- Parallel pricing engine (cm_pricing + cm_sales_pricing)
- Parallel V1 numbering system
- Parallel customer credit system
- Customer sync with `ignore_permissions=True`
- 19 whitelisted endpoints without permission checks
- Stabilisation gate creating test users/docs in production DB
- `frappe.set_user("Administrator")` in whitelisted endpoint
- Property Setter / Client Script fixture drift (442 + 13 untracked records)

---

## 12. Priority Review List

Top 20 items humans should inspect first, ordered by risk:

| # | Item | Severity | Action |
|---|------|----------|--------|
| 1 | Both sites share same database — no staging isolation | Critical | Verify intent; if accidental, create separate DB for staging |
| 2 | Custom app has no git repository | Critical | Initialise git repo immediately |
| 3 | Taxes table hidden on all sales documents | High | Review whether this is intentional for Malta compliance |
| 4 | 16 conversion API endpoints without permission checks | High | Add `frappe.has_permission()` to each endpoint |
| 5 | 3 proforma API endpoints without permission checks | High | Add permission checks |
| 6 | Sales doc shell JS DOM surgery | High | Assess whether this UI approach is sustainable |
| 7 | Outstanding amount hidden on Sales Invoice | Medium | Verify users can access this via shell or default view |
| 8 | Status field hidden on Sales Invoice / POS Invoice | Medium | Verify users can see document status |
| 9 | Payment terms hidden on all sales docs | Medium | Verify business doesn't need payment term management |
| 10 | Parallel pricing engine bypassing Item Price | High | Assess whether native pricing could have been used |
| 11 | `frappe.set_user("Administrator")` in `audit_sales_order_pending_confirm_action` | Medium | Remove privilege escalation from whitelisted endpoint |
| 12 | `ignore_permissions=True` on Address/Contact creation | Medium | Add explicit permission checks |
| 13 | 442 Property Setters not in fixtures | Medium | Decide on canonical source (fixtures vs patches) |
| 14 | 13 Client Scripts not in fixtures | Medium | Add to fixtures or document as patch-managed |
| 15 | V1 numbering using internal `getseries()` API | Medium | Assess upgrade risk |
| 16 | `update_modified=False` in 4 modules | Low | Review for concurrency issues |
| 17 | Test users in production database | Low | Clean up or document |
| 18 | Bench log shows previous nuclear permission change | Medium | Verify fully reversed |
| 19 | `ModuleNotFoundError` in frappe.log — past outage | Medium | Investigate root cause |
| 20 | Broad exception swallowing in `selling_row_description.py` | Low | Add proper error handling |

---

## 13. Appendix — Evidence Index

### Files Referenced

| Path | Type | Role |
|------|------|------|
| `apps/casamoderna_dms/casamoderna_dms/hooks.py` | Python | Central hook registration |
| `apps/casamoderna_dms/casamoderna_dms/patches.txt` | Text | Patch registry |
| `apps/casamoderna_dms/casamoderna_dms/patches/` | Directory | 40 patch files (3,750 lines) |
| `apps/casamoderna_dms/casamoderna_dms/fixtures/custom_field.json` | JSON | 80+ custom field definitions |
| `apps/casamoderna_dms/casamoderna_dms/fixtures/property_setter.json` | JSON | 100 property setters (of 542 in DB) |
| `apps/casamoderna_dms/casamoderna_dms/fixtures/client_script.json` | JSON | 8 client scripts (of 21 in DB) |
| `apps/casamoderna_dms/casamoderna_dms/fixtures/workspace.json` | JSON | 3 workspaces |
| `apps/casamoderna_dms/casamoderna_dms/fixtures/role.json` | JSON | 5 roles |
| `apps/casamoderna_dms/casamoderna_dms/fixtures/print_format.json` | JSON | 2 print formats |
| `apps/casamoderna_dms/casamoderna_dms/fixtures/list_filter.json` | JSON | 17 list filters |
| `apps/casamoderna_dms/casamoderna_dms/public/js/cm_sales_doc_shell.js` | JavaScript | 362 lines — sales shell UI |
| `apps/casamoderna_dms/casamoderna_dms/public/css/cm_sales_doc_shell.css` | CSS | 152 lines — shell styling |
| `apps/casamoderna_dms/casamoderna_dms/v1_numbering.py` | Python | 480 lines — parallel naming |
| `apps/casamoderna_dms/casamoderna_dms/cm_pricing.py` | Python | 240 lines — pricing engine |
| `apps/casamoderna_dms/casamoderna_dms/cm_sales_pricing.py` | Python | 155 lines — sales pricing |
| `apps/casamoderna_dms/casamoderna_dms/customer_sync.py` | Python | 481 lines — address sync |
| `apps/casamoderna_dms/casamoderna_dms/customer_hierarchy.py` | Python | 230 lines — parent/child |
| `apps/casamoderna_dms/casamoderna_dms/customer_credit.py` | Python | 156 lines — credit system |
| `apps/casamoderna_dms/casamoderna_dms/sales_console.py` | Python | 161 lines — flow guardrails |
| `apps/casamoderna_dms/casamoderna_dms/sales_doc_conversions.py` | Python | 546 lines — 16 API endpoints |
| `apps/casamoderna_dms/casamoderna_dms/proforma_pf.py` | Python | 147 lines — proforma endpoints |
| `apps/casamoderna_dms/casamoderna_dms/sales_order_workflow.py` | Python | 275 lines — workflow setup |
| `apps/casamoderna_dms/casamoderna_dms/sales_order_confirm.py` | Python | 153 lines — confirm action |
| `apps/casamoderna_dms/casamoderna_dms/permissions_guardrails.py` | Python | 252 lines — emergency tools |
| `apps/casamoderna_dms/casamoderna_dms/emergency_docperm_recovery.py` | Python | 558 lines — recovery tools |
| `apps/casamoderna_dms/casamoderna_dms/stabilisation_gate.py` | Python | 3,095 lines — testing framework |
| `apps/casamoderna_dms/casamoderna_dms/address_tools.py` | Python | 113 lines — address copy API |
| `apps/casamoderna_dms/casamoderna_dms/selling_row_description.py` | Python | 110 lines — row descriptions |
| `apps/casamoderna_dms/casamoderna_dms/casamoderna_dms/doctype/cm_proforma/cm_proforma.json` | JSON | Proforma DocType |
| `sites/common_site_config.json` | JSON | Common bench config |
| `sites/casamoderna-staging.local/site_config.json` | JSON | Site config |
| `sites/two.casamodernadms.eu/site_config.json` | JSON | Site config (same DB) |
| `config/nginx.conf` | Nginx | Standard bench-generated |
| `logs/frappe.log`, `logs/frappe.log.1` | Log | Application errors |
| `logs/bench.log` | Log | Bench command history |
| `logs/worker.error.log` | Log | Worker deprecation warnings |
| `logs/scheduler.log` | Log | Scheduler activity |

### Database Records Referenced

| Record Type | Count | Key Records |
|-------------|-------|-------------|
| Property Setter | 542 | 384 with `hidden=1` |
| Custom Field | 80+ (fixture) + 24 (non-fixture) | `cm_*` on Item, Customer, QT/SO items |
| Client Script | 21 (18 enabled, 3 disabled) | Per-doctype form scripts |
| Server Script | 1 (disabled) | Auto Username |
| Workflow | 1 | CM Sales Order Flow |
| DocPerm | 80 rows for key doctypes | 6 custom roles assigned |
| Custom DocPerm | 0 | Policy enforced |
| Custom DocType | 3 | CM Locality, CM Proforma, CM Proforma Item |
| User | 8 system users | 3 real + 4 test + Administrator |
| Role | 6 custom | CM Super Admin + 5 console/maintainer roles |

### DocTypes With Custom Modifications

| DocType | Property Setters | Custom Fields | Client Scripts | Doc Events |
|---------|-----------------|---------------|----------------|------------|
| Sales Invoice | 91 | 3 (V1 numbers) | 1 | validate, before_validate, before_submit, on_submit |
| Item | 83 | 50+ | 2 | validate |
| Sales Order | 73 | 1 (workflow_state) | 4 | validate, on_submit |
| Delivery Note | 68 | 2 (V1 numbers) | 2 | validate, on_submit |
| POS Invoice | 68 | 5 | 1 | validate, on_submit |
| Quotation | 51 | 0 | 4 | validate, on_submit |
| Customer | 12 | 1 | 3 | validate, on_update |
| Address | 1 | 0 | 1 | on_update |
| Supplier | 6 | 0 | 1 | — |
| Payment Entry | 0 | 2 (V1 numbers) | 0 | validate, on_submit |
| CM Proforma | 1 | 2 (V1 numbers) | 1 | validate |

---

## 14. Commands / Inspection Trail

### App / Version Inventory
- `bench version`
- `ls apps/`
- `cat sites/apps.txt`

### Configuration Reads
- `cat sites/common_site_config.json`
- `cat sites/casamoderna-staging.local/site_config.json`
- `cat sites/two.casamodernadms.eu/site_config.json`
- `diff sites/casamoderna-staging.local/site_config.json sites/two.casamodernadms.eu/site_config.json`
- `head -30 config/nginx.conf`

### Source Code Reads
- `cat casamoderna_dms/hooks.py`
- `cat casamoderna_dms/modules.txt`
- `cat casamoderna_dms/patches.txt`
- `ls casamoderna_dms/patches/`
- `ls casamoderna_dms/fixtures/`
- Parsed all 9 fixture JSON files
- Read all 28+ Python business logic modules
- Read `cm_proforma.json` doctype definition
- `wc -l *.py` — total 15,646 lines in root modules
- `wc -l patches/*.py` — total 3,750 lines in patches
- Inspected `cm_sales_doc_shell.js` (362 lines) and `.css` (152 lines)
- Inspected all 8 fixture client scripts

### Git Status
- `cd apps/frappe && git status --porcelain` → clean
- `cd apps/erpnext && git status --porcelain` → clean
- `cd apps/casamoderna_dms && git status` → not a git repo
- `cd apps/frappe && git log --oneline -20` → shallow clone, v15.101.2
- `cd apps/erpnext && git log --oneline -20` → shallow clone, v15.99.1

### Database Metadata Queries (via bench execute)
- Custom DocType list
- Property Setter count (542) and grouped counts
- Property Setter full data for Sales Invoice (91 rows)
- Property Setter hidden=1 across all doctypes (384 rows)
- Critical hidden fields (taxes, outstanding_amount, status, etc.)
- Client Script list (21 rows)
- Server Script list (1 row)
- Custom DocPerm count (0)
- DocPerm for key doctypes (80 rows)
- Workflow list and CM Sales Order Flow details
- Custom Fields not in fixture (24 rows)
- CM DocTypes (3 rows)
- Naming series customisations (0 rows)
- Non-fixture Client Scripts (13 rows)
- `SELECT DATABASE()` for both sites → same DB
- Non-sales doctype hidden Property Setters (21 rows)
- User list and roles for real users
- `frappe.get_roles` for 3 real users

### Log Inspection
- `ls -la logs/`
- `tail logs/frappe.log.1`
- `grep -i "error|traceback" logs/frappe.log`
- `grep -c "ModuleNotFoundError" logs/frappe.log`
- `tail logs/worker.error.log`
- `grep -i "error|failed" logs/bench.log`

---

## 15. What Should Be Reviewed First Before Any Further AI Work

1. **Confirm or fix the shared database situation** — Are `casamoderna-staging.local` and `two.casamodernadms.eu` intentionally the same site? If not, create a separate database for staging immediately.

2. **Initialise git for the custom app** — Before any further work, `cd apps/casamoderna_dms && git init && git add . && git commit -m "Initial commit — current state"`. This is the single most impactful operational improvement.

3. **Review taxes visibility decision** — The decision to hide the `taxes` table on all sales documents needs explicit human sign-off from someone who understands Malta VAT compliance. This should not have been an AI decision.

4. **Add permission checks to all `@frappe.whitelist()` endpoints** — Every whitelisted function should verify the caller has appropriate permissions before creating documents.

5. **Assess whether the parallel pricing engine is acceptable** — The business owners should decide whether they want to continue with the custom pricing pipeline or whether Item Price + Pricing Rule could serve the same purpose with less custom code.

6. **Decide on fixture vs patch as canonical source** — Either move all Property Setters and Client Scripts into fixtures, or document clearly that patches are the canonical source. The current mixed approach is fragile.

7. **Evaluate the sales doc shell UI approach** — The DOM surgery pattern in `cm_sales_doc_shell.js` will break on Frappe upgrades. Decide whether to invest in maintaining it or replace it with a Frappe API-based approach.

8. **Prevent `frappe.set_user("Administrator")` in whitelisted methods** — Remove the privilege escalation from `audit_sales_order_pending_confirm_action` immediately.

9. **Review `ignore_permissions=True` usage** — Each usage should be justified and documented, or replaced with proper permission checks.

10. **Clean up test users from production** — Remove or clearly mark `cm_stab_*` users and ensure `create_docs=1` is never run on a database that serves real users.
