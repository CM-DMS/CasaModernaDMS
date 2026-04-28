# CASAMODERNA ERPNext SALES DOCUMENTS — SLICE 002
Sales Order Workflow: Draft → Pending → Confirmed (Admin-only Confirm)

### PLAN
- Phase A (Audit): On BOTH sites, collect live evidence for:
  - Existing Sales Order workflows
  - Live DocPerm roles for Sales Order and derive role sets:
    - `SUBMIT_ROLES=[...]` (roles with Sales Order `submit=1` in tabDocPerm)
    - `CONFIRM_ROLES=[...]` (admin-only role set, chosen from live Role table)
  - Confirm `tabCustom DocPerm` remains 0.
- Phase B (Implement): Ensure workflow prerequisites + workflow record exist and match spec:
  - Workflow name `CM Sales Order Flow`
  - States: Draft(0), Pending(1), Confirmed(1)
  - Transitions:
    - Draft → Pending (`Submit to Pending`) allowed for `SUBMIT_ROLES`
    - Pending → Confirmed (`Admin Confirm`) allowed for `CONFIRM_ROLES` only
  - Ensure Sales Order has `workflow_state` field (hidden, read-only Link to Workflow State)
- Phase C (Smoke/Gate): Extend stabilisation gate to assert spec and prove behavior:
  - Sales User can `Submit to Pending`
  - Sales User cannot `Admin Confirm`
  - CM Super Admin can `Admin Confirm` to `Confirmed`
- Verify sequence on BOTH sites: migrate → clear-cache → stabilisation_gate.run(create_docs=1)

### CURRENT STATE FOUND

## casamoderna-staging.local

#### Phase A — Live audit snapshot
Output: `bench execute casamoderna_dms.sales_order_workflow.audit_sales_order_workflow_baseline`
```text
{"site": "casamoderna-staging.local", "workflow_counts": {"workflow_for_sales_or
der": 1, "cm_sales_order_flow_exists": 1}, "workflow_state_field": {"fieldname": "workflow_state", "exists_in_meta": true, "exists_custom_field": true}, "docperm_roles": [{"role": "Accounts User", "create": 0, "write": 0, "submit": 0, "cancel": 0, "amend": 0}, {"role": "CasaModerna Sales Console", "create": 1, "write": 1, "submit": 0, "cancel": 0, "amend": 0}, {"role": "CM Super Admin", "create": 1, "write": 1, "submit": 1, "cancel": 1, "amend": 1}, {"role": "Maintenance User", "create": 1, "write": 1, "submit": 1, "cancel": 1, "amend": 1}, {"role": "Sales Manager", "create": 1, "write": 1, "submit": 1, "cancel": 1, "amend": 1}, {"role": "Sales User", "create": 1, "write": 1, "submit": 1, "cancel": 1, "amend": 1}, {"role": "Stock User", "create": 0, "write": 0, "submit": 0, "cancel": 0, "amend": 0}], "role_sets": {"SUBMIT_ROLES": ["CM Super Admin", "Maintenance User", "Sales Manager", "Sales User"], "CONFIRM_ROLES": ["CM Super Admin"]}, "custom_docperm_count": 0}
```

Chosen role sets (from live data above):
- `SUBMIT_ROLES=["CM Super Admin","Maintenance User","Sales Manager","Sales User"]`
- `CONFIRM_ROLES=["CM Super Admin"]`

#### Phase B — Workflow record evidence (DB)
Workflow header:
```text
+---------------------+-----------+---------------+----------------------+
| name                | is_active | document_type | workflow_state_field |
+---------------------+-----------+---------------+----------------------+
| CM Sales Order Flow |         1 | Sales Order   | workflow_state       |
+---------------------+-----------+---------------+----------------------+
```

Workflow states:
```text
+-----------+------------+------------+
| state     | doc_status | allow_edit |
+-----------+------------+------------+
| Draft     | 0          | All        |
| Pending   | 1          | All        |
| Confirmed | 1          | All        |
+-----------+------------+------------+
```

Workflow transitions (allowed roles):
```text
+---------+-------------------+------------+------------------+------+
| state   | action            | next_state | allowed          | cond |
+---------+-------------------+------------+------------------+------+
| Draft   | Submit to Pending | Pending    | CM Super Admin   |      |
| Draft   | Submit to Pending | Pending    | Maintenance User |      |
| Draft   | Submit to Pending | Pending    | Sales Manager    |      |
| Draft   | Submit to Pending | Pending    | Sales User       |      |
| Pending | Admin Confirm     | Confirmed  | CM Super Admin   |      |
+---------+-------------------+------------+------------------+------+
```

Idempotent upsert output (reproducibility evidence): `bench execute casamoderna_dms.sales_order_workflow.ensure_cm_sales_order_flow`
```text
{"site": "casamoderna-staging.local", "role_sets": {"SUBMIT_ROLES": ["CM Super A
dmin", "Maintenance User", "Sales Manager", "Sales User"], "CONFIRM_ROLES": ["CM Super Admin"]}, "workflow_states": {"required": ["Draft", "Pending", "Confirmed"], "created": []}, "workflow_actions": {"required": ["Submit to Pending", "Admin Confirm"], "created": []}, "custom_field": {"created": false, "name": "Sales Order-workflow_state"}, "workflow": {"created": false, "name": "CM Sales Order Flow", "document_type": "Sales Order", "is_active": 1, "workflow_state_field": "workflow_state", "submit_roles": ["CM Super Admin", "Maintenance User", "Sales Manager", "Sales User"], "confirm_roles": ["CM Super Admin"], "states": [{"state": "Draft", "doc_status": 0}, {"state": "Pending", "doc_status": "1"}, {"state": "Confirmed", "doc_status": "1"}], "transitions": [{"state": "Draft", "action": "Submit to Pending", "next_state": "Pending", "allowed": "CM Super Admin"}, {"state": "Draft", "action": "Submit to Pending", "next_state": "Pending", "allowed": "Maintenance User"}, {"state": "Draft", "action": "Submit to Pending", "next_state": "Pending", "allowed": "Sales Manager"}, {"state": "Draft", "action": "Submit to Pending", "next_state": "Pending", "allowed": "Sales User"}, {"state": "Pending", "action": "Admin Confirm", "next_state": "Confirmed", "allowed": "CM Super Admin"}]}, "custom_docperm_count": 0}
```

#### Custom DocPerm (must remain 0)
Output:
```text
+----------------------+
| custom_docperm_count |
+----------------------+
|                    0 |
+----------------------+
```

#### Phase C — Stabilisation gate evidence (B5.8/B5.9)
Source: `sites/casamoderna-staging.local/private/files/cm_stabilisation/matrix_2026-03-04.json`
```json
{
  "confirm_allowed": [
    "CM Super Admin"
  ],
  "is_active": 1,
  "ok": true,
  "states": {
    "Confirmed": 1,
    "Draft": 0,
    "Pending": 1
  },
  "submit_allowed": [
    "CM Super Admin",
    "Maintenance User",
    "Sales Manager",
    "Sales User"
  ],
  "test": "B5.8 Sales Order workflow CM Sales Order Flow exists + matches spec"
}
```
```json
{
  "docstatus": 1,
  "ok": true,
  "test": "B5.9 Sales User can Submit to Pending",
  "workflow_state": "Pending"
}
```
```json
{
  "blocked": true,
  "ok": true,
  "test": "B5.9 Sales User cannot Admin Confirm",
  "workflow_state": "Pending"
}
```
```json
{
  "ok": true,
  "test": "B5.9 CM Super Admin can Admin Confirm to Confirmed",
  "workflow_state": "Confirmed"
}
```


## two.casamodernadms.eu

#### Phase A — Live audit snapshot
Output: `bench execute casamoderna_dms.sales_order_workflow.audit_sales_order_workflow_baseline`
```text
{"site": "two.casamodernadms.eu", "workflow_counts": {"workflow_for_sales_order"
: 1, "cm_sales_order_flow_exists": 1}, "workflow_state_field": {"fieldname": "workflow_state", "exists_in_meta": true, "exists_custom_field": true}, "docperm_roles": [{"role": "Accounts User", "create": 0, "write": 0, "submit": 0, "cancel": 0, "amend": 0}, {"role": "CasaModerna Sales Console", "create": 1, "write": 1, "submit": 0, "cancel": 0, "amend": 0}, {"role": "CM Super Admin", "create": 1, "write": 1, "submit": 1, "cancel": 1, "amend": 1}, {"role": "Maintenance User", "create": 1, "write": 1, "submit": 1, "cancel": 1, "amend": 1}, {"role": "Sales Manager", "create": 1, "write": 1, "submit": 1, "cancel": 1, "amend": 1}, {"role": "Sales User", "create": 1, "write": 1, "submit": 1, "cancel": 1, "amend": 1}, {"role": "Stock User", "create": 0, "write": 0, "submit": 0, "cancel": 0, "amend": 0}], "role_sets": {"SUBMIT_ROLES": ["CM Super Admin", "Maintenance User", "Sales Manager", "Sales User"], "CONFIRM_ROLES": ["CM Super Admin"]}, "custom_docperm_count": 0}
```

Chosen role sets (from live data above):
- `SUBMIT_ROLES=["CM Super Admin","Maintenance User","Sales Manager","Sales User"]`
- `CONFIRM_ROLES=["CM Super Admin"]`

#### Phase B — Workflow record evidence (DB)
Workflow header:
```text
+---------------------+-----------+---------------+----------------------+
| name                | is_active | document_type | workflow_state_field |
+---------------------+-----------+---------------+----------------------+
| CM Sales Order Flow |         1 | Sales Order   | workflow_state       |
+---------------------+-----------+---------------+----------------------+
```

Workflow states:
```text
+-----------+------------+------------+
| state     | doc_status | allow_edit |
+-----------+------------+------------+
| Draft     | 0          | All        |
| Pending   | 1          | All        |
| Confirmed | 1          | All        |
+-----------+------------+------------+
```

Workflow transitions (allowed roles):
```text
+---------+-------------------+------------+------------------+------+
| state   | action            | next_state | allowed          | cond |
+---------+-------------------+------------+------------------+------+
| Draft   | Submit to Pending | Pending    | CM Super Admin   |      |
| Draft   | Submit to Pending | Pending    | Maintenance User |      |
| Draft   | Submit to Pending | Pending    | Sales Manager    |      |
| Draft   | Submit to Pending | Pending    | Sales User       |      |
| Pending | Admin Confirm     | Confirmed  | CM Super Admin   |      |
+---------+-------------------+------------+------------------+------+
```

Idempotent upsert output (reproducibility evidence): `bench execute casamoderna_dms.sales_order_workflow.ensure_cm_sales_order_flow`
```text
{"site": "two.casamodernadms.eu", "role_sets": {"SUBMIT_ROLES": ["CM Super Admin
", "Maintenance User", "Sales Manager", "Sales User"], "CONFIRM_ROLES": ["CM Super Admin"]}, "workflow_states": {"required": ["Draft", "Pending", "Confirmed"], "created": []}, "workflow_actions": {"required": ["Submit to Pending", "Admin Confirm"], "created": []}, "custom_field": {"created": false, "name": "Sales Order-workflow_state"}, "workflow": {"created": false, "name": "CM Sales Order Flow", "document_type": "Sales Order", "is_active": 1, "workflow_state_field": "workflow_state", "submit_roles": ["CM Super Admin", "Maintenance User", "Sales Manager", "Sales User"], "confirm_roles": ["CM Super Admin"], "states": [{"state": "Draft", "doc_status": 0}, {"state": "Pending", "doc_status": "1"}, {"state": "Confirmed", "doc_status": "1"}], "transitions": [{"state": "Draft", "action": "Submit to Pending", "next_state": "Pending", "allowed": "CM Super Admin"}, {"state": "Draft", "action": "Submit to Pending", "next_state": "Pending", "allowed": "Maintenance User"}, {"state": "Draft", "action": "Submit to Pending", "next_state": "Pending", "allowed": "Sales Manager"}, {"state": "Draft", "action": "Submit to Pending", "next_state": "Pending", "allowed": "Sales User"}, {"state": "Pending", "action": "Admin Confirm", "next_state": "Confirmed", "allowed": "CM Super Admin"}]}, "custom_docperm_count": 0}
```

#### Custom DocPerm (must remain 0)
Output:
```text
+----------------------+
| custom_docperm_count |
+----------------------+
|                    0 |
+----------------------+
```

#### Phase C — Stabilisation gate evidence (B5.8/B5.9)
Source: `sites/two.casamodernadms.eu/private/files/cm_stabilisation/matrix_2026-03-04.json`
```json
{
  "confirm_allowed": [
    "CM Super Admin"
  ],
  "is_active": 1,
  "ok": true,
  "states": {
    "Confirmed": 1,
    "Draft": 0,
    "Pending": 1
  },
  "submit_allowed": [
    "CM Super Admin",
    "Maintenance User",
    "Sales Manager",
    "Sales User"
  ],
  "test": "B5.8 Sales Order workflow CM Sales Order Flow exists + matches spec"
}
```
```json
{
  "docstatus": 1,
  "ok": true,
  "test": "B5.9 Sales User can Submit to Pending",
  "workflow_state": "Pending"
}
```
```json
{
  "blocked": true,
  "ok": true,
  "test": "B5.9 Sales User cannot Admin Confirm",
  "workflow_state": "Pending"
}
```
```json
{
  "ok": true,
  "test": "B5.9 CM Super Admin can Admin Confirm to Confirmed",
  "workflow_state": "Confirmed"
}
```


### FILES / RECORDS CHANGED
ERPNext records (both sites; ensured present and active):
- Workflow: `CM Sales Order Flow` (Sales Order)
- Workflow State: `Draft`, `Pending`, `Confirmed` (master records)
- Workflow Action Master: `Submit to Pending`, `Admin Confirm`
- Custom Field: `Sales Order-workflow_state` (hidden Link to Workflow State)

Code (stabilisation coverage + reproducible upsert):
- `apps/casamoderna_dms/casamoderna_dms/sales_order_workflow.py`
- `apps/casamoderna_dms/casamoderna_dms/stabilisation_gate.py`

Report:
- This file.

### COMMANDS
(Commands listed as precise actions; no bash pasted.)

For casamoderna-staging.local:
- Executed live audit: ran `audit_sales_order_workflow_baseline` via bench execute.
- Executed DB evidence queries via bench mariadb for:
  - Workflow header, states, transitions
  - `tabCustom DocPerm` count
- Executed idempotent implementation: ran `ensure_cm_sales_order_flow` via bench execute.
- Ran verify sequence: bench migrate, bench clear-cache, stabilisation_gate.run(create_docs=1).

For two.casamodernadms.eu:
- Executed live audit: ran `audit_sales_order_workflow_baseline` via bench execute.
- Executed DB evidence queries via bench mariadb for:
  - Workflow header, states, transitions
  - `tabCustom DocPerm` count
- Executed idempotent implementation: ran `ensure_cm_sales_order_flow` via bench execute.
- Ran verify sequence: bench migrate, bench clear-cache, stabilisation_gate.run(create_docs=1).

### RESULT
- Both sites have an active Sales Order workflow `CM Sales Order Flow` with states Draft(0) → Pending(1) → Confirmed(1).
- Transition Draft → Pending (`Submit to Pending`) is available to live DocPerm submit roles: `SUBMIT_ROLES`.
- Transition Pending → Confirmed (`Admin Confirm`) is restricted to admin-only `CONFIRM_ROLES=["CM Super Admin"]`.
- `tabCustom DocPerm` remains 0 on both sites.

### SUCCESS CHECKS
- Stabilisation gate remains GREEN on BOTH sites; matrix evidence shows:
  - B5.8 workflow spec assertion `ok=true`
  - B5.9 behavior:
    - Sales User submit to Pending `ok=true`
    - Sales User admin confirm blocked `ok=true`
    - CM Super Admin confirm to Confirmed `ok=true`

### ROLLBACK
- To rollback the workflow behavior:
  - Deactivate or delete Workflow `CM Sales Order Flow` in ERPNext, and (if desired) delete the `Sales Order-workflow_state` Custom Field.
  - Remove the Slice-002 workflow enforcement checks from the stabilisation gate and delete `sales_order_workflow.py`.
- No DocPerm changes are required for rollback; this slice does not use Custom DocPerm.
