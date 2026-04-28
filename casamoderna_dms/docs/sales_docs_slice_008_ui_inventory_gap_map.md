# Slice 008 — Sales Docs UI Inventory (ERPNext) + V1-Parity Gap Map (Audit-Only)

Date: 2026-03-05

Scope: **UI inventory + gap map only** for Sales Documents on BOTH sites:
- `casamoderna-staging.local`
- `two.casamodernadms.eu`

Hard constraints (Slice 008):
- **NO functional changes**.
- **NO UI/config changes** (no DocType edits, no customizations, no workflows, no client scripts, no print formats, no permissions).
- Only deliverable change in git: this report file.

---

## PLAN
- Produce an authoritative inventory of the current ERPNext UI “surface area” for: Quotation; “Proforma path used”; Sales Order; Delivery Note; Sales Invoice; Cash Sale path (POS Invoice); Credit Note / Return path (Sales Invoice Return + POS Invoice Return).
- Use **live system metadata** as source-of-truth (DB tables), not screenshots and not guessing.
- Prove both sites are aligned (diff evidence exports).
- Run the required verify sequence on BOTH sites: `migrate` → `clear-cache` → stabilisation gate `run(create_docs=1)`.

---

## CURRENT STATE FOUND

### Evidence capture method (authoritative)
Inventory was derived from live DB metadata:
- `tabDocType` (module, naming, title field, default print format)
- `tabWorkflow` (active workflows)
- `tabDocField` (layout skeleton via Tab/Section/Table breaks; list view columns; header-ish fields)
- `tabCustom Field` (V1-visible numbering fields live here, not in `tabDocField`)
- `tabPrint Format` (print formats per DocType; return formats)
- `tabPOS Profile` (cash sale path surface)
- `tabWorkspace` (availability of Selling/POS workspaces)
- `tabList View Settings` (explicit list-view overrides)

Evidence artifacts (generated per-site; identical query set):
- `/tmp/slice008_ui_audit_casamoderna-staging.local_2026-03-05_v6.sql`
- `/tmp/slice008_ui_audit_casamoderna-staging.local_2026-03-05_v6.tsv`
- `/tmp/slice008_ui_audit_two.casamodernadms.eu_2026-03-05_v6.sql`
- `/tmp/slice008_ui_audit_two.casamodernadms.eu_2026-03-05_v6.tsv`

Site alignment proof:
- `/tmp/slice008_ui_audit_sites_diff_2026-03-05_v6.diff` (12 lines; only non-material ordering difference in the tail “UI mutators counts” output)

Client scripts evidence (enabled scripts affecting sales doctypes):
- `/tmp/slice008_client_scripts_2026-03-05_v2.txt`
- `/tmp/slice008_client_scripts_b64_staging_2026-03-05.txt` (base64 dump used to decode the scripts)

Verify logs (required sequence, both sites):
- Staging migrate log: `/tmp/slice008_verify_casamoderna-staging.local_2026-03-05_migrate.log`
- Staging clear-cache log: `/tmp/slice008_verify_casamoderna-staging.local_2026-03-05_clear_cache.log`
- Staging stabilisation gate log: `/tmp/slice008_verify_casamoderna-staging.local_2026-03-05_stabilisation_gate.log`
- Site two migrate log: `/tmp/slice008_verify_two.casamodernadms.eu_2026-03-05_migrate.log`
- Site two clear-cache log: `/tmp/slice008_verify_two.casamodernadms.eu_2026-03-05_clear_cache.log`
- Site two stabilisation gate log: `/tmp/slice008_verify_two.casamodernadms.eu_2026-03-05_stabilisation_gate.log`

### Guardrail compliance evidence
- `tabCustom DocPerm` count is **0** on BOTH sites (queried via `bench mariadb` during this slice).
- `tabList View Settings` records for the target doctypes: **none** (v6 evidence block is empty).

---

## UI INVENTORY + V1-PARITY GAP MAP (BY SURFACE)

Note: “Current UI” items below are grounded in the v6 evidence TSV (layout breaks, list columns, print formats, and custom field flags). Items like toolbar buttons / Create-menu entries are *not* reliably enumerable via DB metadata alone and are therefore not asserted here.

### 1) Quotation

**Current UI surface (from v6 evidence)**
- Default print format: `CasaModerna Quotation` (Jinja)
- Layout skeleton main flow: Customer/Party area → Items (table) → Taxes (table) → Totals.
- Layout skeleton tabs: `Address & Contact`, `Terms`, `More Info`, `Connections`.
- Layout skeleton advanced sections: present but hidden by default (examples: Currency & Price List, Additional Discount, Tax Breakup, Bundle Items, Print Settings, Lost Reasons, Additional Info).
- Header-ish fields (signals: reqd/in_preview): `naming_series` (reqd), `transaction_date` (reqd), `party_name` (in_preview=1), `rounded_total` (in_preview=1).
- List view columns (in_list_view=1): `transaction_date`, `grand_total`, `status`.
- Items grid columns (child table `Quotation Item`, in_list_view=1): `item_code`, `qty`, `rate`, `amount`.

**UI mutators present**
- Enabled Client Script exists on BOTH sites: `Quotation - CasaModerna AB Split Helpers`.
- Decoded behavior (staging): adds an `Actions` button **“Clear Customer B”** which clears `cm_customer_b` and `cm_customer_b_amount` and refreshes related fields.

**V1-number fields (custom fields; both sites)**
- `cm_v1_draft_no` (hidden=0, read_only=1, in_list_view=0, in_preview=0)
- `cm_v1_operational_no` (hidden=0, read_only=1, in_list_view=0, in_preview=0)

**Gaps to V1-like UX (evidence-based)**
- V1-visible numbers are **not configured for list view or preview** (`in_list_view=0`, `in_preview=0`), so list UI cannot show V1 numbers without further UI work.
- Items grid shows only the ERPNext-default commercial columns; any V1-required derived quantities (e.g. box/sqm fields) are not part of the default visible grid columns.

**Next UI-only slice candidates (no implementation in Slice 008)**
- Add V1-visible numbers to list + preview surfaces (list columns + in-preview header), in a minimal “V1 header strip”.
- Decide minimal tab set for Quotation (likely reduce to: Items + Totals + Terms; collapse the rest).

---

### 2) “Proforma path used”

**Current UI surface (from v6 evidence)**
- There are **no** Print Formats whose name contains “Proforma” (Proforma print formats block is empty).
- Available print formats relevant to invoicing include: `Sales Invoice Print` (Jinja, standard) and `CasaModerna Sales Invoice` (Jinja).

**What this means (strictly from evidence)**
- The system does not have a dedicated “Proforma” print format record.
- Any “Proforma” behavior in practice must therefore be achieved via a non-Proforma-named print format and/or a draft Sales Invoice print and/or external/manual process.

**Gaps to V1-like UX**
- If V1 expects an explicit “Proforma Invoice” artifact, it is not represented as a first-class Print Format.

**Next UI-only slice candidates**
- Define and wire an explicit Proforma print format + an unambiguous print action entry point (audit-only note; do not implement in Slice 008).

---

### 3) Sales Order

**Current UI surface (from v6 evidence)**
- Workflow: Active workflow exists: `CM Sales Order Flow` (uses field `workflow_state`).
- Default print format: `CasaModerna Sales Order` (Jinja)
- Layout skeleton main flow: Customer area → Items (table) → Taxes (table) → Totals.
- Layout skeleton tabs: `Terms`, `Connections` (Address & Contact is present but hidden=1; More Info present but hidden=1).
- Layout skeleton advanced sections: commonly hidden (Accounting Dimensions, Currency & Price List, Additional Discount, Tax Breakup, Packing List, Print Settings, Additional Info).
- Header-ish fields: `customer` (reqd=1, in_preview=1), `transaction_date` (reqd), `customer_name` (in_preview=1), `rounded_total` (in_preview=1), `status` (reqd=1).
- List view columns: `delivery_date`, `grand_total`, `status`, `% Delivered`, `% Amount Billed`.
- Items grid columns (child table `Sales Order Item`, in_list_view=1): `item_code`, `delivery_date`, `qty`, `rate`, `amount`, `warehouse` (Source Warehouse).

**UI mutators present**
- Enabled Client Script exists on BOTH sites: `Sales Order - CasaModerna AB Split Helpers`.
- Decoded behavior (staging): adds an `Actions` button **“Clear Customer B”** which clears `cm_customer_b` and `cm_customer_b_amount`.

**V1-number fields (custom fields; both sites)**
- `cm_v1_draft_no` (hidden=0, read_only=1, in_list_view=0, in_preview=0)
- `cm_v1_operational_no` (hidden=0, read_only=1, in_list_view=0, in_preview=0)

**Gaps to V1-like UX (evidence-based)**
- V1-visible numbers are not configured for list/preview.
- Workflow presence implies additional status/state surface in UI (V1 parity may require a simplified state ladder).

**Next UI-only slice candidates**
- Add V1-number visibility to list + preview surfaces.
- Decide how to expose workflow_state/status in a V1-like compact header.

---

### 4) Delivery Note

**Current UI surface (from v6 evidence)**
- Default print format: `CasaModerna Delivery Note` (Jinja)
- Layout skeleton main flow: Items (table) → Taxes (table) → Totals.
- Layout skeleton tabs: `Address & Contact`, `Terms`, `More Info`, `Connections`.
- Layout skeleton advanced sections: present but hidden by default (Accounting Dimensions, Currency & Price List, Additional Discount, Tax Breakup, Packing List, Transporter Info, Customer PO Details, Sales Team, Print Settings, Additional Info).
- Header-ish fields: `customer` (reqd=1), `posting_date` (reqd=1), `posting_time` (reqd=1), `customer_name` (in_preview=1), `rounded_total` (in_preview=1), `status` (reqd=1).
- List view columns: `grand_total`, `% Installed`.
- Items grid columns (child table `Delivery Note Item`, in_list_view=1): `item_code`, `qty`, `uom`, `rate`, `amount`, `warehouse`.

**V1-number fields (custom fields; both sites)**
- `cm_v1_draft_no` (hidden=0, read_only=1, in_list_view=0, in_preview=0)
- `cm_v1_operational_no` (hidden=0, read_only=1, in_list_view=0, in_preview=0)
- No `cm_v1_fiscal_record_no` custom field present on Delivery Note (per `cm_v1_%` custom field audit).

**Gaps to V1-like UX (evidence-based)**
- V1-visible numbers not configured for list/preview.
- If V1 requires fiscal record numbering on Delivery Note, it is not represented as a configured V1 custom field on this DocType.

**Next UI-only slice candidates**
- Add V1-number visibility to list + preview surfaces.
- Decide whether Delivery Note needs a V1 fiscal number surface (business decision; not implemented here).

---

### 5) Sales Invoice (IN)

**Current UI surface (from v6 evidence)**
- Default print format: `CasaModerna Sales Invoice` (Jinja)
- Additional Sales Invoice print formats present include: `Sales Invoice Return` (Jinja, standard=Yes), `Sales Invoice Print` (Jinja, standard=Yes), `Point of Sale` (JS, standard=Yes). Tax invoice formats exist but are disabled (`Tax Invoice`, `Simplified Tax Invoice`, `Detailed Tax Invoice` are disabled=1).
- Layout skeleton main flow: Customer area → Items (table) → Taxes (table) → Totals.
- Layout skeleton tabs: `Payments`, `Address & Contact`, `Terms`, `More Info`, `Connections`.
- Payments tab contains `payments` table; also has `advances` table.
- Layout skeleton advanced sections: present but hidden by default (Accounting Dimensions, Currency & Price List, Additional Discount, Tax Breakup, Time Sheets, Changes, Advance Payments, Write Off, Loyalty Points, Customer PO Details, Accounting Details, Print Settings, Subscription, Additional Info).
- Header-ish fields: `posting_date` (reqd=1, in_preview=1), `customer` (in_preview=1), `grand_total` (reqd=1, in_preview=1), `rounded_total` (in_preview=1), `debit_to` (reqd=1).
- List view columns: `grand_total`.
- Items grid columns (child table `Sales Invoice Item`, in_list_view=1): `item_code`, `qty`, `rate`, `amount`, `warehouse`.

**Return/Credit Note fields (Sales Invoice return path)**
From `tabDocField` for `Sales Invoice`:
- `is_return` (Check) — label: “Is Return (Credit Note)”
- `return_against` (Link → `Sales Invoice`) — label: “Return Against”
- `is_pos` (Check) — label: “Include Payment (POS)”

**V1-number fields (custom fields; both sites)**
- `cm_v1_draft_no` (hidden=0, read_only=1, in_list_view=0, in_preview=0)
- `cm_v1_operational_no` (hidden=0, read_only=1, in_list_view=0, in_preview=0)
- `cm_v1_fiscal_record_no` (hidden=0, read_only=1, in_list_view=0, in_preview=0)

**Gaps to V1-like UX (evidence-based)**
- V1-visible numbers are not configured for list/preview.
- “Return” surface exists as core fields + dedicated return print format, but the UI discoverability/entry-point is not provable from DB metadata (must be confirmed in interactive UI if required).

**Next UI-only slice candidates**
- Add V1-number visibility to list + preview surfaces (IN + CN).
- Decide whether to remove/relocate the `Payments` tab (V1-like: keep payments visible but reduce navigation).

---

### 6) Cash Sale path (POS Invoice)

**Current UI surface (from v6 evidence)**
- POS Profile: one active POS Profile exists: `CasaModerna POS` (disabled=0).
- Print formats (POS Invoice): `POS Invoice` (Jinja, standard=Yes), `Return POS Invoice` (Jinja, standard=Yes), `CasaModerna POS Invoice` (Jinja).
- Layout skeleton note: no Tab Breaks observed in the POS Invoice layout skeleton section (single-page style).
- Layout skeleton main flow: Warehouse → Items (table) → Taxes (table) → Totals → Payments (table).
- Layout skeleton advanced sections: present but hidden by default (Accounting Dimensions, Customer PO Details, Address and Contact, Currency and Price List, Time Sheets, Tax Breakup, Loyalty Points, Additional Discount, Advance Payments, Payment Terms, Write Off, Terms and Conditions, Printing Settings, More Information, Accounting Details, Commission, Sales Team).
- Header-ish fields: `is_pos` (reqd=1), `posting_date` (reqd=1, in_preview=1), `customer` (in_preview=1), `grand_total` / `rounded_total` (in_preview=1), `debit_to` (reqd=1).
- List view columns: `grand_total`.
- Items grid columns (child table `POS Invoice Item`, in_list_view=1): `item_code`, `qty`, `rate`, `amount`, `warehouse`, `serial_no`.

**Return/Credit Note fields (POS Invoice return path)**
From `tabDocField` for `POS Invoice`:
- `is_return` (Check) — label: “Is Return (Credit Note)”
- `return_against` (Link → `POS Invoice`) — label: “Return Against”
- `is_pos` (Check)
Note: `return_against` is configured as a list-view column for POS Invoice (`in_list_view=1` in v6 evidence).

**V1-number fields (custom fields; both sites)**
- `cm_v1_draft_no` (hidden=0, read_only=1, in_list_view=0, in_preview=0)
- `cm_v1_operational_no` (hidden=0, read_only=1, in_list_view=0, in_preview=0)
- `cm_v1_fiscal_record_no` (hidden=0, read_only=1, in_list_view=0, in_preview=0)

**Workspace surface evidence**
- `Selling` workspace exists and is public.
- No explicit `Retail` or `Point of Sale` workspace records were found by the targeted workspace audit query.

**Gaps to V1-like UX (evidence-based)**
- V1-visible numbers not configured for list/preview.
- If V1 expects a prominent POS workspace entry point, it is not evidenced by the targeted workspace audit.

**Next UI-only slice candidates**
- Add V1-number visibility to list + preview surfaces.
- Confirm and document the intended POS entry point (workspace shortcut vs. direct list/form routes).

---

### 7) Credit Note / Return path summary (IN + CS)

**Current return primitives (evidence-based)**
- Sales Invoice return (CN-invoice): `Sales Invoice.is_return=1` with `return_against → Sales Invoice`
- POS Invoice return (CN-cash-sale): `POS Invoice.is_return=1` with `return_against → POS Invoice`

**Return print formats present**
- Sales Invoice: `Sales Invoice Return`
- POS Invoice: `Return POS Invoice`

**Gaps to V1-like UX (evidence-based)**
- V1-visible numbers are not configured for list/preview for either return surface.

---

## FILES / RECORDS CHANGED

### Files changed
- Added (this report only): `apps/casamoderna_dms/casamoderna_dms/docs/sales_docs_slice_008_ui_inventory_gap_map.md`.

### ERPNext records changed
- None.
- `tabCustom DocPerm` remains 0.

---

## COMMANDS

### Evidence generation (per-site)
The v6 evidence was generated by executing the saved SQL script and capturing TSV output:
```
bench --site casamoderna-staging.local mariadb -N -B < /tmp/slice008_ui_audit_casamoderna-staging.local_2026-03-05_v6.sql > /tmp/slice008_ui_audit_casamoderna-staging.local_2026-03-05_v6.tsv
bench --site two.casamodernadms.eu mariadb -N -B < /tmp/slice008_ui_audit_two.casamodernadms.eu_2026-03-05_v6.sql > /tmp/slice008_ui_audit_two.casamodernadms.eu_2026-03-05_v6.tsv
```

Site alignment diff:
```
diff -u /tmp/slice008_ui_audit_casamoderna-staging.local_2026-03-05_v6.tsv \
  /tmp/slice008_ui_audit_two.casamodernadms.eu_2026-03-05_v6.tsv \
  > /tmp/slice008_ui_audit_sites_diff_2026-03-05_v6.diff
```

### V1-number custom field audit (both sites)
```
bench --site <site> mariadb -N -B -e '
  select dt, fieldname, hidden, read_only, in_list_view, in_preview
  from `tabCustom Field`
  where fieldname like "cm_v1_%"
    and dt in ("Quotation","Sales Order","Delivery Note","Sales Invoice","POS Invoice")
  order by dt, fieldname;
'
```

### Verify sequence (required) — BOTH sites

#### casamoderna-staging.local
```
bench --site casamoderna-staging.local migrate
bench --site casamoderna-staging.local clear-cache
bench --site casamoderna-staging.local execute casamoderna_dms.stabilisation_gate.run --kwargs "{'create_docs': 1}"
```

#### two.casamodernadms.eu
```
bench --site two.casamodernadms.eu migrate
bench --site two.casamodernadms.eu clear-cache
bench --site two.casamodernadms.eu execute casamoderna_dms.stabilisation_gate.run --kwargs "{'create_docs': 1}"
```

---

## RESULT
- Authoritative UI inventory captured for both sites via DB metadata exports (v6 TSVs).
- Sites are materially aligned (diff only shows non-material ordering difference in a tail block).
- Verify sequence completed on BOTH sites; stabilisation gate produced the expected summary JSON paths and no errors/tracebacks.

---

## SUCCESS CHECKS
- Slice 008 constraint compliance: no DocType/DocField/Custom Field/Property Setter edits were performed.
- Slice 008 constraint compliance: no workflows/print formats/permissions were modified.
- Slice 008 constraint compliance: `tabCustom DocPerm` remains 0.
- Both sites verified: `bench migrate` OK.
- Both sites verified: `bench clear-cache` OK.
- Both sites verified: `casamoderna_dms.stabilisation_gate.run(create_docs=1)` OK (see verify logs under `/tmp/`).

---

## ROLLBACK
- This slice is audit-only.
- To rollback repo changes: revert/delete this report file.
- No ERPNext record rollback required.
