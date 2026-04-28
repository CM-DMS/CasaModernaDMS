# CASAMODERNA ERPNext SALES DOCUMENTS — SLICE 001
Sales Docs Baseline Audit (Meta/Workflow/Custom Fields/Hooks) — NO CHANGES

### PLAN
- Collect baseline evidence on BOTH sites with zero functional changes.
- Evidence sources only: live DB (SQL via bench mariadb), live runtime callable (bench execute get_versions), and deployed app code (hooks.py).
- Produce a single markdown evidence report with exact outputs for both sites.
- Run verify sequence on BOTH sites: migrate, clear-cache, stabilisation_gate.run(create_docs=1).

### CURRENT STATE FOUND
(See per-site sections below; all key outputs are pasted verbatim.)

## casamoderna-staging.local

#### Versions (Frappe / ERPNext / installed apps)
Output:
```text
{"frappe": {"title": "Frappe Framework", "description": "Full stack web framewor
k with Python, Javascript, MariaDB, Redis, Node", "branch": "version-15", "version": "15.101.2"}, "erpnext": {"title": "ERPNext", "description": "ERP made simple", "branch": "version-15", "version": "15.99.1"}, "casamoderna_dms": {"title": "CasaModerna Custom", "description": "Customer single-screen capture + sync", "branch": "", "version": "0.0.1"}}                                             
```

#### Doctype presence (required list)
Output:
```text
+-------------------------+---------+
| doctype                 | present |
+-------------------------+---------+
| Delivery Note           |       1 |
| Pick List               |       1 |
| POS Invoice             |       1 |
| Sales Invoice           |       1 |
| Sales Order             |       1 |
| Stock Reservation Entry |       1 |
| Workflow                |       1 |
| Workflow State          |       1 |
+-------------------------+---------+
```

#### Sales Order workflows (count)
Output:
```text
+----------------+
| workflow_count |
+----------------+
|              0 |
+----------------+
```

#### Relevant Custom Fields (Quotation / Sales Order / Delivery Note / Sales Invoice / POS Invoice)
Source: tabCustom Field, filtered by `cm_*` OR fieldname/label containing flow/pricing/tile/placeholder/discount.

Output:
```text
+-------------+-----------------------+---------------+--------------------+----
---------+-------------------------------------------------------------------------------------------+-----------------------+-----+------+--------+-----------+------------+----------------------+------------+---------------+               | dt          | fieldname             | fieldtype     | label              | pla
ceholder | options                                                                                   | insert_after          | idx | reqd | hidden | read_only | depends_on | mandatory_depends_on | fetch_from | field_default |               +-------------+-----------------------+---------------+--------------------+----
---------+-------------------------------------------------------------------------------------------+-----------------------+-----+------+--------+-----------+------------+----------------------+------------+---------------+               | Quotation   | cm_customer_b_section | Section Break | Customer B / Split | NUL
L        | NULL                                                                                      | grand_total           |  56 |    0 |      0 |         0 | NULL       | NULL                 | NULL       | NULL          |               | Quotation   | cm_customer_b         | Link          | Customer B         | NUL
L        | Customer                                                                                  | cm_customer_b_section |  57 |    0 |      0 |         0 | NULL       | NULL                 | NULL       | NULL          |               | Quotation   | cm_customer_b_amount  | Currency      | Customer B Amount  | NUL
L        | currency                                                                                  | cm_customer_b         |  58 |    0 |      0 |         0 | NULL       | NULL                 | NULL       | 0             |               | Quotation   | cm_customer_b_column  | Column Break  | NULL               | NUL
L        | NULL                                                                                      | cm_customer_b_amount  |  59 |    0 |      0 |         0 | NULL       | NULL                 | NULL       | NULL          |               | Quotation   | cm_customer_a_amount  | Currency      | Customer A Amount  | NUL
L        | currency                                                                                  | cm_customer_b_column  |  60 |    0 |      0 |         1 | NULL       | NULL                 | NULL       | NULL          |               | Quotation   | cm_split_help         | HTML          |                    | NUL
L        | <div class="small text-muted">Customer A Amount = Grand Total − Customer B Amount</div>   | cm_customer_a_amount  |  61 |    0 |      0 |         0 | NULL       | NULL                 | NULL       | NULL          |               | Sales Order | cm_customer_b_section | Section Break | Customer B / Split | NUL
L        | NULL                                                                                      | grand_total           |  68 |    0 |      0 |         0 | NULL       | NULL                 | NULL       | NULL          |               | Sales Order | cm_customer_b         | Link          | Customer B         | NUL
L        | Customer                                                                                  | cm_customer_b_section |  69 |    0 |      0 |         0 | NULL       | NULL                 | NULL       | NULL          |               | Sales Order | cm_customer_b_amount  | Currency      | Customer B Amount  | NUL
L        | currency                                                                                  | cm_customer_b         |  70 |    0 |      0 |         0 | NULL       | NULL                 | NULL       | 0             |               | Sales Order | cm_customer_b_column  | Column Break  | NULL               | NUL
L        | NULL                                                                                      | cm_customer_b_amount  |  71 |    0 |      0 |         0 | NULL       | NULL                 | NULL       | NULL          |               | Sales Order | cm_customer_a_amount  | Currency      | Customer A Amount  | NUL
L        | currency                                                                                  | cm_customer_b_column  |  72 |    0 |      0 |         1 | NULL       | NULL                 | NULL       | NULL          |               | Sales Order | cm_split_help         | HTML          |                    | NUL
L        | <div class="small text-muted">Customer A Amount = Grand Total − Customer B Amount</div>   | cm_customer_a_amount  |  73 |    0 |      0 |         0 | NULL       | NULL                 | NULL       | NULL          |               +-------------+-----------------------+---------------+--------------------+----
---------+-------------------------------------------------------------------------------------------+-----------------------+-----+------+--------+-----------+------------+----------------------+------------+---------------+                
```

#### casamoderna_dms hooks affecting Sales Docs
Source: deployed app code in apps/casamoderna_dms/casamoderna_dms/hooks.py

doc_events excerpt:
```python
# CasaModerna: Customer single-screen capture + canonical sync
# ----------------------------------------------------------

doc_events = {
	"Customer": {
		"validate": [
			"casamoderna_dms.customer_sync.validate_customer_capture",
			"casamoderna_dms.customer_hierarchy.validate_customer_hierarchy",
			"casamoderna_dms.customer_credit.validate_customer_credit",
		],
		"on_update": [
			"casamoderna_dms.customer_hierarchy.on_customer_update_hierarchy",
			"casamoderna_dms.customer_credit.on_customer_update_credit",
			"casamoderna_dms.customer_sync.sync_customer_related_records",
		],
	}
	,
	"Address": {
		"on_update": "casamoderna_dms.customer_sync.sync_customers_locality_from_address",
	}
	,
	"Sales Order": {
		"validate": [
			"casamoderna_dms.cm_tile_box_to_sqm.apply_tile_box_to_sqm",
			"casamoderna_dms.cm_sales_pricing.apply_sales_doc_pricing",
			"casamoderna_dms.sales_doc_ab_split.validate_ab_split",
			"casamoderna_dms.selling_row_description.fill_sales_doc_row_descriptions",
			"casamoderna_dms.freetext_quote_placeholders.validate_sales_doc_free_text_lines",
		],
	},
	"Quotation": {
		"validate": [
			"casamoderna_dms.cm_tile_box_to_sqm.apply_tile_box_to_sqm",
			"casamoderna_dms.cm_sales_pricing.apply_sales_doc_pricing",
			"casamoderna_dms.sales_doc_ab_split.validate_ab_split",
			"casamoderna_dms.selling_row_description.fill_sales_doc_row_descriptions",
			"casamoderna_dms.freetext_quote_placeholders.validate_sales_doc_free_text_lines",
		],
	},
	"Delivery Note": {
		"validate": "casamoderna_dms.sales_console.validate_derived_only_delivery_note",
	},
	"Sales Invoice": {
		"validate": "casamoderna_dms.sales_console.validate_derived_only_sales_invoice",
	},
	"Item": {
		"validate": [
			"casamoderna_dms.cm_pricing.apply_item_pricing",
			"casamoderna_dms.cm_tile_master_validate.validate_tile_master_fields",
			"casamoderna_dms.item_display.sync_item_display_name",
		],
	},
}
```

override_doctype_class / scheduler_events evidence (not defined; template commented out in hooks.py):
```python
# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# scheduler_events = {
# 	"all": [
# 		"casamoderna_dms.tasks.all"
# 	],
# 	"daily": [
# 		"casamoderna_dms.tasks.daily"
# 	],
# 	"hourly": [
# 		"casamoderna_dms.tasks.hourly"
# 	],
# 	"weekly": [
# 		"casamoderna_dms.tasks.weekly"
# 	],
# 	"monthly": [
# 		"casamoderna_dms.tasks.monthly"
# 	],
# }
```


## two.casamodernadms.eu

#### Versions (Frappe / ERPNext / installed apps)
Output:
```text
{"frappe": {"title": "Frappe Framework", "description": "Full stack web framewor
k with Python, Javascript, MariaDB, Redis, Node", "branch": "version-15", "version": "15.101.2"}, "erpnext": {"title": "ERPNext", "description": "ERP made simple", "branch": "version-15", "version": "15.99.1"}, "casamoderna_dms": {"title": "CasaModerna Custom", "description": "Customer single-screen capture + sync", "branch": "", "version": "0.0.1"}}                                             
```

#### Doctype presence (required list)
Output:
```text
+-------------------------+---------+
| doctype                 | present |
+-------------------------+---------+
| Delivery Note           |       1 |
| Pick List               |       1 |
| POS Invoice             |       1 |
| Sales Invoice           |       1 |
| Sales Order             |       1 |
| Stock Reservation Entry |       1 |
| Workflow                |       1 |
| Workflow State          |       1 |
+-------------------------+---------+
```

#### Sales Order workflows (count)
Output:
```text
+----------------+
| workflow_count |
+----------------+
|              0 |
+----------------+
```

#### Relevant Custom Fields (Quotation / Sales Order / Delivery Note / Sales Invoice / POS Invoice)
Output:
```text
+-------------+-----------------------+---------------+--------------------+----
---------+-------------------------------------------------------------------------------------------+-----------------------+-----+------+--------+-----------+------------+----------------------+------------+---------------+               | dt          | fieldname             | fieldtype     | label              | pla
ceholder | options                                                                                   | insert_after          | idx | reqd | hidden | read_only | depends_on | mandatory_depends_on | fetch_from | field_default |               +-------------+-----------------------+---------------+--------------------+----
---------+-------------------------------------------------------------------------------------------+-----------------------+-----+------+--------+-----------+------------+----------------------+------------+---------------+               | Quotation   | cm_customer_b_section | Section Break | Customer B / Split | NUL
L        | NULL                                                                                      | grand_total           |  56 |    0 |      0 |         0 | NULL       | NULL                 | NULL       | NULL          |               | Quotation   | cm_customer_b         | Link          | Customer B         | NUL
L        | Customer                                                                                  | cm_customer_b_section |  57 |    0 |      0 |         0 | NULL       | NULL                 | NULL       | NULL          |               | Quotation   | cm_customer_b_amount  | Currency      | Customer B Amount  | NUL
L        | currency                                                                                  | cm_customer_b         |  58 |    0 |      0 |         0 | NULL       | NULL                 | NULL       | 0             |               | Quotation   | cm_customer_b_column  | Column Break  | NULL               | NUL
L        | NULL                                                                                      | cm_customer_b_amount  |  59 |    0 |      0 |         0 | NULL       | NULL                 | NULL       | NULL          |               | Quotation   | cm_customer_a_amount  | Currency      | Customer A Amount  | NUL
L        | currency                                                                                  | cm_customer_b_column  |  60 |    0 |      0 |         1 | NULL       | NULL                 | NULL       | NULL          |               | Quotation   | cm_split_help         | HTML          |                    | NUL
L        | <div class="small text-muted">Customer A Amount = Grand Total − Customer B Amount</div>   | cm_customer_a_amount  |  61 |    0 |      0 |         0 | NULL       | NULL                 | NULL       | NULL          |               | Sales Order | cm_customer_b_section | Section Break | Customer B / Split | NUL
L        | NULL                                                                                      | grand_total           |  68 |    0 |      0 |         0 | NULL       | NULL                 | NULL       | NULL          |               | Sales Order | cm_customer_b         | Link          | Customer B         | NUL
L        | Customer                                                                                  | cm_customer_b_section |  69 |    0 |      0 |         0 | NULL       | NULL                 | NULL       | NULL          |               | Sales Order | cm_customer_b_amount  | Currency      | Customer B Amount  | NUL
L        | currency                                                                                  | cm_customer_b         |  70 |    0 |      0 |         0 | NULL       | NULL                 | NULL       | 0             |               | Sales Order | cm_customer_b_column  | Column Break  | NULL               | NUL
L        | NULL                                                                                      | cm_customer_b_amount  |  71 |    0 |      0 |         0 | NULL       | NULL                 | NULL       | NULL          |               | Sales Order | cm_customer_a_amount  | Currency      | Customer A Amount  | NUL
L        | currency                                                                                  | cm_customer_b_column  |  72 |    0 |      0 |         1 | NULL       | NULL                 | NULL       | NULL          |               | Sales Order | cm_split_help         | HTML          |                    | NUL
L        | <div class="small text-muted">Customer A Amount = Grand Total − Customer B Amount</div>   | cm_customer_a_amount  |  73 |    0 |      0 |         0 | NULL       | NULL                 | NULL       | NULL          |               +-------------+-----------------------+---------------+--------------------+----
---------+-------------------------------------------------------------------------------------------+-----------------------+-----+------+--------+-----------+------------+----------------------+------------+---------------+                
```

#### casamoderna_dms hooks affecting Sales Docs
Source: deployed app code in apps/casamoderna_dms/casamoderna_dms/hooks.py

doc_events excerpt:
```python
# CasaModerna: Customer single-screen capture + canonical sync
# ----------------------------------------------------------

doc_events = {
	"Customer": {
		"validate": [
			"casamoderna_dms.customer_sync.validate_customer_capture",
			"casamoderna_dms.customer_hierarchy.validate_customer_hierarchy",
			"casamoderna_dms.customer_credit.validate_customer_credit",
		],
		"on_update": [
			"casamoderna_dms.customer_hierarchy.on_customer_update_hierarchy",
			"casamoderna_dms.customer_credit.on_customer_update_credit",
			"casamoderna_dms.customer_sync.sync_customer_related_records",
		],
	}
	,
	"Address": {
		"on_update": "casamoderna_dms.customer_sync.sync_customers_locality_from_address",
	}
	,
	"Sales Order": {
		"validate": [
			"casamoderna_dms.cm_tile_box_to_sqm.apply_tile_box_to_sqm",
			"casamoderna_dms.cm_sales_pricing.apply_sales_doc_pricing",
			"casamoderna_dms.sales_doc_ab_split.validate_ab_split",
			"casamoderna_dms.selling_row_description.fill_sales_doc_row_descriptions",
			"casamoderna_dms.freetext_quote_placeholders.validate_sales_doc_free_text_lines",
		],
	},
	"Quotation": {
		"validate": [
			"casamoderna_dms.cm_tile_box_to_sqm.apply_tile_box_to_sqm",
			"casamoderna_dms.cm_sales_pricing.apply_sales_doc_pricing",
			"casamoderna_dms.sales_doc_ab_split.validate_ab_split",
			"casamoderna_dms.selling_row_description.fill_sales_doc_row_descriptions",
			"casamoderna_dms.freetext_quote_placeholders.validate_sales_doc_free_text_lines",
		],
	},
	"Delivery Note": {
		"validate": "casamoderna_dms.sales_console.validate_derived_only_delivery_note",
	},
	"Sales Invoice": {
		"validate": "casamoderna_dms.sales_console.validate_derived_only_sales_invoice",
	},
	"Item": {
		"validate": [
			"casamoderna_dms.cm_pricing.apply_item_pricing",
			"casamoderna_dms.cm_tile_master_validate.validate_tile_master_fields",
			"casamoderna_dms.item_display.sync_item_display_name",
		],
	},
}
```

override_doctype_class / scheduler_events evidence (not defined; template commented out in hooks.py):
```python
# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# scheduler_events = {
# 	"all": [
# 		"casamoderna_dms.tasks.all"
# 	],
# 	"daily": [
# 		"casamoderna_dms.tasks.daily"
# 	],
# 	"hourly": [
# 		"casamoderna_dms.tasks.hourly"
# 	],
# 	"weekly": [
# 		"casamoderna_dms.tasks.weekly"
# 	],
# 	"monthly": [
# 		"casamoderna_dms.tasks.monthly"
# 	],
# }
```


### FILES / RECORDS CHANGED
- Added this report file only.
- No doctypes/workflows/print formats/fixtures/permissions were modified as part of Phase A audit evidence capture.

### COMMANDS
(Commands are listed in plain language; no bash pasted.)

For casamoderna-staging.local:
- Executed versions query via bench execute: frappe.utils.change_log.get_versions
- Executed doctype existence query via SQL against tabDocType (bench mariadb)
- Executed Sales Order workflow query via SQL: count of tabWorkflow where document_type = "Sales Order" (bench mariadb)
- Executed custom field inventory query via SQL against tabCustom Field (bench mariadb)
- Opened the deployed hooks module and captured: doc_events, override_doctype_class, scheduler_events (apps/casamoderna_dms/casamoderna_dms/hooks.py)
- Ran verify sequence: bench migrate, bench clear-cache, and executed stabilisation gate run(create_docs=1)

For two.casamodernadms.eu:
- Executed versions query via bench execute: frappe.utils.change_log.get_versions
- Executed doctype existence query via SQL against tabDocType (bench mariadb)
- Executed Sales Order workflow query via SQL: count of tabWorkflow where document_type = "Sales Order" (bench mariadb)
- Executed custom field inventory query via SQL against tabCustom Field (bench mariadb)
- Opened the deployed hooks module and captured: doc_events, override_doctype_class, scheduler_events (apps/casamoderna_dms/casamoderna_dms/hooks.py)
- Ran verify sequence: bench migrate, bench clear-cache, and executed stabilisation gate run(create_docs=1)

### RESULT
- Both sites: Frappe/ERPNext versions captured; required doctypes present; no Sales Order workflows found (count=0); relevant Custom Fields captured; Sales Doc doc_events hooks captured.

### SUCCESS CHECKS
- Stabilisation gate executed on BOTH sites after migrate/clear-cache; outputs show Sales Console smoke checks passed and summary JSON produced.

casamoderna-staging.local — stabilisation_gate.run(create_docs=1) tail output:
```text
SMOKE OK — FREE-TEXT PLACEHOLDERS
{
  "site": "casamoderna-staging.local",
  "inventory_path": "./casamoderna-staging.local/private/files/cm_stabilisation/
inventory_2026-03-04.json",                                                       "matrix_path": "./casamoderna-staging.local/private/files/cm_stabilisation/mat
rix_2026-03-04.json",                                                             "permissions_path": "./casamoderna-staging.local/private/files/cm_stabilisatio
n/permissions_2026-03-04.json",                                                   "counts": {
    "inventory": {
      "property_setters": 106,
      "custom_fields_target": 106,
      "custom_fields_cm": 149,
      "custom_docperms": 0,
      "roles_casamoderna": 5,
      "client_scripts_target": 4,
      "client_scripts_cm": 9,
      "print_formats": 2,
      "workspaces": 3,
      "list_filters": 16
    },
    "matrix_tests": 71,
    "permission_doctypes": 15
  }
}
{"site": "casamoderna-staging.local", "inventory_path": "./casamoderna-staging.l
ocal/private/files/cm_stabilisation/inventory_2026-03-04.json", "matrix_path": "./casamoderna-staging.local/private/files/cm_stabilisation/matrix_2026-03-04.json", "permissions_path": "./casamoderna-staging.local/private/files/cm_stabilisation/permissions_2026-03-04.json", "counts": {"inventory": {"property_setters": 106, "custom_fields_target": 106, "custom_fields_cm": 149, "custom_docperms": 0, "roles_casamoderna": 5, "client_scripts_target": 4, "client_scripts_cm": 9, "print_formats": 2, "workspaces": 3, "list_filters": 16}, "matrix_tests": 71, "permission_doctypes": 15}}                                                           
```

two.casamodernadms.eu — stabilisation_gate.run(create_docs=1) tail output:
```text
SMOKE OK — FREE-TEXT PLACEHOLDERS
{
  "site": "two.casamodernadms.eu",
  "inventory_path": "./two.casamodernadms.eu/private/files/cm_stabilisation/inve
ntory_2026-03-04.json",                                                           "matrix_path": "./two.casamodernadms.eu/private/files/cm_stabilisation/matrix_
2026-03-04.json",                                                                 "permissions_path": "./two.casamodernadms.eu/private/files/cm_stabilisation/pe
rmissions_2026-03-04.json",                                                       "counts": {
    "inventory": {
      "property_setters": 106,
      "custom_fields_target": 106,
      "custom_fields_cm": 149,
      "custom_docperms": 0,
      "roles_casamoderna": 5,
      "client_scripts_target": 4,
      "client_scripts_cm": 9,
      "print_formats": 2,
      "workspaces": 3,
      "list_filters": 16
    },
    "matrix_tests": 71,
    "permission_doctypes": 15
  }
}
{"site": "two.casamodernadms.eu", "inventory_path": "./two.casamodernadms.eu/pri
vate/files/cm_stabilisation/inventory_2026-03-04.json", "matrix_path": "./two.casamodernadms.eu/private/files/cm_stabilisation/matrix_2026-03-04.json", "permissions_path": "./two.casamodernadms.eu/private/files/cm_stabilisation/permissions_2026-03-04.json", "counts": {"inventory": {"property_setters": 106, "custom_fields_target": 106, "custom_fields_cm": 149, "custom_docperms": 0, "roles_casamoderna": 5, "client_scripts_target": 4, "client_scripts_cm": 9, "print_formats": 2, "workspaces": 3, "list_filters": 16}, "matrix_tests": 71, "permission_doctypes": 15}}                                                                           
```

### ROLLBACK
- This slice introduced no functional changes. To rollback the repo change from this slice, delete this report file or revert it in git.
