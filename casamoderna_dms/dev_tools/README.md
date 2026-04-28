# dev_tools

Development audit scripts and slice reports from the incremental build process.

These files are **NOT part of the live app**.
They are NOT called by hooks, patches, or any runtime code path.

## Usage

Run diagnostics individually via `bench execute`:

```bash
cd /home/frappe/frappe/casamoderna-bench
bench --site two.casamodernadms.eu execute casamoderna_dms.dev_tools.smoke_checks
```

## Contents

- `contract*.py` — contract audit and inspection scripts from build slices
- `smoke_checks*.py` — smoke check scripts (not wired to any test runner)
- `sales_docs_*_audit.py` — audit scripts from sales doc UI slices
- `products_*.py` — products module audit scripts
- `audit_item_*.py` — item tab audit scripts
- `ux_integration_audit.py` — UX integration audit
- `emergency_docperm_recovery.py` — DocPerm recovery utility (run manually only)
- `CONTRACT*.md`, `contract_reset_*.md` — slice implementation reports
