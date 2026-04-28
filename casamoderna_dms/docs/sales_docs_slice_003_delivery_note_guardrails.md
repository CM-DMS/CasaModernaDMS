# Slice 003 — Delivery Note guardrails (SO-only source + stock-items-only + placeholder bans)

## Objective
Enforce Delivery Note (DN) creation/content guardrails:
- DN must be created from a Sales Order (SO) only (no direct DN creation)
- DN rows must be linked to SO on every row (`Delivery Note Item.against_sales_order`)
- DN may include stock items only (`Item.is_stock_item = 1`)
- DN must not include placeholder item codes:
  - `CM-FREETEXT`, `CM-DELIVERY`, `CM-DELIVERY_GOZO`, `CM-LIFTER`, `CM-INSTALLATION`

Constraints:
- No Custom DocPerm usage; `tabCustom DocPerm` must remain `0`.
- Stabilisation gate must remain GREEN on BOTH sites.

## Implementation
Code:
- Guardrails: [apps/casamoderna_dms/casamoderna_dms/sales_console.py](../sales_console.py)
  - `validate_derived_only_delivery_note` tightened to SO-only derived detection
  - `validate_delivery_note_sales_order_stock_only` added (SO-per-row + stock-only + placeholder bans)
- Hook wiring: [apps/casamoderna_dms/casamoderna_dms/hooks.py](../hooks.py)
  - `Delivery Note` `validate` runs:
    - `casamoderna_dms.sales_console.validate_derived_only_delivery_note`
    - `casamoderna_dms.sales_console.validate_delivery_note_sales_order_stock_only`
- Gate coverage: [apps/casamoderna_dms/casamoderna_dms/stabilisation_gate.py](../stabilisation_gate.py)
  - Added tests `B5.10`–`B5.14` (hook wiring + DN positive/negative smokes)

## Evidence (live DB)
The following evidence was collected via read-only SQL on BOTH sites.

### Delivery Note ↔ Sales Order linkage fields
`Delivery Note Item` has:
- `against_sales_order` (Link → Sales Order)
- `so_detail` (Data)

SQL output:

casamoderna-staging.local
```text
+---------------------+-----------+-------------+
| fieldname           | fieldtype | options     |
+---------------------+-----------+-------------+
| against_sales_order | Link      | Sales Order |
| so_detail           | Data      | NULL        |
+---------------------+-----------+-------------+
```

two.casamodernadms.eu
```text
+---------------------+-----------+-------------+
| fieldname           | fieldtype | options     |
+---------------------+-----------+-------------+
| against_sales_order | Link      | Sales Order |
| so_detail           | Data      | NULL        |
+---------------------+-----------+-------------+
```

### Stock item indicator
`Item` has:
- `is_stock_item` (Check)

SQL output:

casamoderna-staging.local
```text
+---------------+-----------+---------+
| fieldname     | fieldtype | options |
+---------------+-----------+---------+
| is_stock_item | Check     | NULL    |
+---------------+-----------+---------+
```

two.casamodernadms.eu
```text
+---------------+-----------+---------+
| fieldname     | fieldtype | options |
+---------------+-----------+---------+
| is_stock_item | Check     | NULL    |
+---------------+-----------+---------+
```

### Placeholder items exist and are non-stock
On BOTH sites, these item codes exist and have `is_stock_item = 0`, `disabled = 0`:
- `CM-DELIVERY`
- `CM-DELIVERY_GOZO`
- `CM-FREETEXT`
- `CM-INSTALLATION`
- `CM-LIFTER`

SQL output:

casamoderna-staging.local
```text
+------------------+---------------+----------+
| item_code        | is_stock_item | disabled |
+------------------+---------------+----------+
| CM-DELIVERY      |             0 |        0 |
| CM-DELIVERY_GOZO |             0 |        0 |
| CM-FREETEXT      |             0 |        0 |
| CM-INSTALLATION  |             0 |        0 |
| CM-LIFTER        |             0 |        0 |
+------------------+---------------+----------+
```

two.casamodernadms.eu
```text
+------------------+---------------+----------+
| item_code        | is_stock_item | disabled |
+------------------+---------------+----------+
| CM-DELIVERY      |             0 |        0 |
| CM-DELIVERY_GOZO |             0 |        0 |
| CM-FREETEXT      |             0 |        0 |
| CM-INSTALLATION  |             0 |        0 |
| CM-LIFTER        |             0 |        0 |
+------------------+---------------+----------+
```

## Verify sequence (BOTH sites)
Ran: migrate → clear-cache → stabilisation gate with doc creation.

### casamoderna-staging.local
- `tabCustom DocPerm` count: `0`
- Stabilisation gate output paths:
  - `sites/casamoderna-staging.local/private/files/cm_stabilisation/inventory_2026-03-05.json`
  - `sites/casamoderna-staging.local/private/files/cm_stabilisation/matrix_2026-03-05.json`
  - `sites/casamoderna-staging.local/private/files/cm_stabilisation/permissions_2026-03-05.json`

Gate evidence (from matrix `B5.10`–`B5.14`):
- `B5.10 Delivery Note guardrail hooks wired` → `ok=true`
  - validate hooks:
    - `casamoderna_dms.sales_console.validate_derived_only_delivery_note`
    - `casamoderna_dms.sales_console.validate_delivery_note_sales_order_stock_only`
- `B5.11 DN from Sales Order (stock item) passes` → `ok=true`
- `B5.12 DN direct without SO linkage blocked` → `ok=true`
  - error: `Delivery Note must be created from a Sales Order. Direct creation is not allowed.`
- `B5.13 DN rejects non-stock items` → `ok=true`
  - error shape: `Delivery Note can include stock items only (Item.is_stock_item=1). Non-stock: ...`
- `B5.14 DN rejects placeholder items` → `ok=true`
  - error: `Delivery Note cannot include placeholder items: CM-FREETEXT.`

Extract (matrix rows):
```text
- B5.10 Delivery Note guardrail hooks wired ok=true
  validate_hooks: [
    casamoderna_dms.sales_console.validate_derived_only_delivery_note,
    casamoderna_dms.sales_console.validate_delivery_note_sales_order_stock_only
  ]
- B5.11 DN from Sales Order (stock item) passes ok=true
- B5.12 DN direct without SO linkage blocked ok=true
  error: Delivery Note must be created from a Sales Order. Direct creation is not allowed.
- B5.13 DN rejects non-stock items ok=true
  error: Delivery Note can include stock items only (Item.is_stock_item=1). Non-stock: <generated test item>.
- B5.14 DN rejects placeholder items ok=true
  error: Delivery Note cannot include placeholder items: CM-FREETEXT.
```

### two.casamodernadms.eu
- `tabCustom DocPerm` count: `0`
- Stabilisation gate output paths:
  - `sites/two.casamodernadms.eu/private/files/cm_stabilisation/inventory_2026-03-05.json`
  - `sites/two.casamodernadms.eu/private/files/cm_stabilisation/matrix_2026-03-05.json`
  - `sites/two.casamodernadms.eu/private/files/cm_stabilisation/permissions_2026-03-05.json`

Gate evidence (from matrix `B5.10`–`B5.14`):
- `B5.10 Delivery Note guardrail hooks wired` → `ok=true`
- `B5.11 DN from Sales Order (stock item) passes` → `ok=true`
- `B5.12 DN direct without SO linkage blocked` → `ok=true`
- `B5.13 DN rejects non-stock items` → `ok=true`
- `B5.14 DN rejects placeholder items` → `ok=true`

Extract (matrix rows):
```text
- B5.10 Delivery Note guardrail hooks wired ok=true
- B5.11 DN from Sales Order (stock item) passes ok=true
- B5.12 DN direct without SO linkage blocked ok=true
- B5.13 DN rejects non-stock items ok=true
- B5.14 DN rejects placeholder items ok=true
```

## Result
- Delivery Notes are now enforced as Sales-Order-derived only.
- Delivery Note items must be SO-linked per-row and stock-only.
- Placeholder item codes are explicitly disallowed on Delivery Notes.
- Stabilisation gate remains GREEN on BOTH sites.
- `tabCustom DocPerm` remains `0` on BOTH sites.

## Rollback
To rollback Slice 003 guardrails:
- Remove `validate_delivery_note_sales_order_stock_only` from the `Delivery Note` validate hooks in [apps/casamoderna_dms/casamoderna_dms/hooks.py](../hooks.py).
- Revert SO-only behavior in `validate_derived_only_delivery_note` (if required).
- Remove gate tests `B5.10`–`B5.14` from [apps/casamoderna_dms/casamoderna_dms/stabilisation_gate.py](../stabilisation_gate.py).
