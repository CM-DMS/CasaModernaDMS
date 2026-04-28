````markdown
# Slice 005 — Revert Sales Docs abbreviations + visible numbering to V1 (non-destructive)

## Objective
Revert *visible* Sales Documents numbering back to the V1 evidence **without renaming existing ERPNext document `name` values**.

Contracted formats (V1 evidence):
- Draft: `ABBR-DRAFT-YYYYMMDDHHMMSS`
- Posted operational: `ABBR 000001`
- Fiscal record: `YYYY-000001` **ONLY** for `IN` / `CS` / `CN`

Scope doctypes:
- Quotation → `QT`
- Sales Order → `SO`
- Delivery Note → `DN`
- Sales Invoice → `IN` / `CN` (and `CS` only if `is_pos=1`)
- POS Invoice → `CS` / `CN`
- Payment Entry (receipt path) → `RC`

Constraints:
- Preserve existing documents: **no renames** of existing `name` values.
- Stabilisation gate must remain **GREEN** on BOTH sites.

Sites:
- `casamoderna-staging.local`
- `two.casamodernadms.eu`

---

## Damaged state found (start of Slice 005)
The Slice 005 module wiring existed (patch entrypoint + hooks), but the implementation module was not safely runnable:
- `apps/casamoderna_dms/casamoderna_dms/v1_numbering.py` contained syntax corruption (diff artifacts, invalid f-string regex, and truncated/missing functions), and initially failed runtime imports.

This was a live risk because the module is invoked via `doc_events`.

---

## Implementation
### Approach (non-destructive)
- Keep ERPNext `name` and `naming_series` unchanged.
- Store V1-visible numbers in dedicated, read-only custom fields (`cm_v1_*`).
- Render the V1-visible number on CasaModerna print formats (heading uses `cm_v1_operational_no` / `cm_v1_draft_no` fallback).
- Allocate sequences via isolated `tabSeries` namespaces (so ERPNext naming series are unaffected).

### Code + wiring
- Core numbering logic + setup:
  - [apps/casamoderna_dms/casamoderna_dms/v1_numbering.py](../v1_numbering.py)
    - `apply_v1_draft_number`
    - `apply_v1_operational_number_on_submit`
    - `apply_v1_fiscal_record_number_on_submit`
    - `ensure_v1_numbering_setup(commit=True)`
- Patch entrypoint (idempotent setup):
  - [apps/casamoderna_dms/casamoderna_dms/patches/slice005_v1_numbering_revert.py](../patches/slice005_v1_numbering_revert.py)
  - Registered in [apps/casamoderna_dms/casamoderna_dms/patches.txt](../patches.txt)
- Hook wiring (doc lifecycle application):
  - [apps/casamoderna_dms/casamoderna_dms/hooks.py](../hooks.py)
    - `validate` → draft assignment
    - `on_submit` → operational assignment
    - `on_submit` (Sales Invoice + POS Invoice) → fiscal record assignment

### Stabilisation gate coverage (deterministic)
Added deterministic Slice 005 checks to the matrix:
- [apps/casamoderna_dms/casamoderna_dms/stabilisation_gate.py](../stabilisation_gate.py)
  - `B7.1`–`B7.11` assert:
    - Draft formats for QT/SO/IN/CN
    - Operational formats on submit for QT/SO/IN/CN
    - Fiscal record formats on submit for IN/CN

Notes:
- POS Invoice is intentionally **not created/submitted** by the gate because ERPNext POS flows can require an open POS Opening Entry; the gate instead validates the fiscal/operational logic on Sales Invoice (IN + CN), which is derived-only safe and deterministic.

---

## Evidence (live DB)
Evidence was collected via read-only SQL on BOTH sites.

### Custom fields present (V1 display numbers)
Query:
```sql
select dt, fieldname, fieldtype
from `tabCustom Field`
where fieldname in ('cm_v1_draft_no','cm_v1_operational_no','cm_v1_fiscal_record_no')
order by dt, fieldname;
```

Output (BOTH sites):
```text
+---------------+------------------------+-----------+
| dt            | fieldname              | fieldtype |
+---------------+------------------------+-----------+
| Delivery Note | cm_v1_draft_no         | Data      |
| Delivery Note | cm_v1_operational_no   | Data      |
| Payment Entry | cm_v1_draft_no         | Data      |
| Payment Entry | cm_v1_operational_no   | Data      |
| POS Invoice   | cm_v1_draft_no         | Data      |
| POS Invoice   | cm_v1_fiscal_record_no | Data      |
| POS Invoice   | cm_v1_operational_no   | Data      |
| Quotation     | cm_v1_draft_no         | Data      |
| Quotation     | cm_v1_operational_no   | Data      |
| Sales Invoice | cm_v1_draft_no         | Data      |
| Sales Invoice | cm_v1_fiscal_record_no | Data      |
| Sales Invoice | cm_v1_operational_no   | Data      |
| Sales Order   | cm_v1_draft_no         | Data      |
| Sales Order   | cm_v1_operational_no   | Data      |
+---------------+------------------------+-----------+
```

### CasaModerna print formats exist and are enabled
Query:
```sql
select name, doc_type, disabled
from `tabPrint Format`
where name like 'CasaModerna %'
order by doc_type, name;
```

Output (BOTH sites):
```text
+---------------------------+---------------+----------+
| name                      | doc_type      | disabled |
+---------------------------+---------------+----------+
| CasaModerna Delivery Note | Delivery Note |        0 |
| CasaModerna Receipt       | Payment Entry |        0 |
| CasaModerna POS Invoice   | POS Invoice   |        0 |
| CasaModerna Quotation     | Quotation     |        0 |
| CasaModerna Sales Invoice | Sales Invoice |        0 |
| CasaModerna Sales Order   | Sales Order   |        0 |
+---------------------------+---------------+----------+
```

### Default print formats assigned (non-destructive)
Defaults were only set where DocType defaults were previously empty.

Query:
```sql
select name, default_print_format
from tabDocType
where name in ('Delivery Note','Sales Invoice','POS Invoice','Payment Entry')
order by name;
```

Output (BOTH sites):
```text
+---------------+---------------------------+
| name          | default_print_format      |
+---------------+---------------------------+
| Delivery Note | CasaModerna Delivery Note |
| Payment Entry | CasaModerna Receipt       |
| POS Invoice   | CasaModerna POS Invoice   |
| Sales Invoice | CasaModerna Sales Invoice |
+---------------+---------------------------+
```

---

## Verify sequence (BOTH sites)
Ran: `migrate` → `clear-cache` → stabilisation gate `run(create_docs=1)`.

### Commands
```bash
# casamoderna-staging.local
bench --site casamoderna-staging.local migrate
bench --site casamoderna-staging.local clear-cache
bench --site casamoderna-staging.local execute casamoderna_dms.stabilisation_gate.run --kwargs "{'create_docs': 1}"

# two.casamodernadms.eu
bench --site two.casamodernadms.eu migrate
bench --site two.casamodernadms.eu clear-cache
bench --site two.casamodernadms.eu execute casamoderna_dms.stabilisation_gate.run --kwargs "{'create_docs': 1}"
```

### Outputs
#### casamoderna-staging.local
- `sites/casamoderna-staging.local/private/files/cm_stabilisation/inventory_2026-03-05.json`
- `sites/casamoderna-staging.local/private/files/cm_stabilisation/matrix_2026-03-05.json`
- `sites/casamoderna-staging.local/private/files/cm_stabilisation/permissions_2026-03-05.json`

Slice 005 matrix extract (B7):
```text
B7.1 QT draft format:            QT-DRAFT-20260305094643
B7.2 QT operational on submit:   QT 000001
B7.3 SO draft format:            SO-DRAFT-20260305094641
B7.4 SO operational on submit:   SO 000001
B7.6 IN draft format:            IN-DRAFT-20260305094644
B7.7 IN operational on submit:   IN 000001
B7.8 IN fiscal on submit:        2026-000001
B7.9 CN draft format:            CN-DRAFT-20260305094644
B7.10 CN operational on submit:  CN 000001
B7.11 CN fiscal on submit:       2026-000002
```

Preservation proof (internal `name` unchanged):
- Quotation `name` remained ERPNext series: `SAL-QTN-2026-00185`
- Sales Invoice `name` remained ERPNext series: `ACC-SINV-2026-00001`

#### two.casamodernadms.eu
- `sites/two.casamodernadms.eu/private/files/cm_stabilisation/inventory_2026-03-05.json`
- `sites/two.casamodernadms.eu/private/files/cm_stabilisation/matrix_2026-03-05.json`
- `sites/two.casamodernadms.eu/private/files/cm_stabilisation/permissions_2026-03-05.json`

Slice 005 matrix extract (B7):
```text
B7.1 QT draft format:            QT-DRAFT-20260305094815
B7.2 QT operational on submit:   QT 000002
B7.6 IN draft format:            IN-DRAFT-20260305094816
B7.7 IN operational on submit:   IN 000002
B7.8 IN fiscal on submit:        2026-000003
B7.9 CN draft format:            CN-DRAFT-20260305094816
B7.10 CN operational on submit:  CN 000002
B7.11 CN fiscal on submit:       2026-000004
```

---

## Result
- V1-visible draft/operational/fiscal numbering is enforced for new sales documents.
- Existing document `name` values remain unchanged (non-destructive).
- CasaModerna print formats are present and set as defaults where previously unset.
- Stabilisation gate is GREEN on BOTH sites with deterministic Slice 005 numbering proofs.

---

## Rollback
To rollback Slice 005 visible numbering:
- Remove v1 numbering hooks from [apps/casamoderna_dms/casamoderna_dms/hooks.py](../hooks.py) for the affected doctypes.
- Optionally remove CasaModerna print formats or unset DocType `default_print_format` (only where set by this slice).
- Optionally delete the `cm_v1_*` Custom Field rows if you want to remove the visible numbering fields entirely.

Note: Rollback does **not** require renaming any existing documents.

````
