"""
Phase 1 DB dump for v3 rebuild. Run via:

    cd /home/frappe/frappe/casamoderna-bench
    bench --site two.casamodernadms.eu execute \
      casamoderna_dms.dev_tools.v3_dump_doctypes.run

Output is written to JSON files in /home/frappe/CasaModernaDMS/docs/db.
Read-only — no DB writes.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import frappe

OUT = Path("/home/frappe/CasaModernaDMS/docs/db")
OUT.mkdir(parents=True, exist_ok=True)


def _write(name: str, data) -> None:
    path = OUT / f"{name}.json"
    path.write_text(json.dumps(data, indent=2, default=str, sort_keys=True), encoding="utf-8")
    print(f"  wrote {path}  ({len(data) if hasattr(data, '__len__') else '?'} rows)")


def run() -> None:
    print(f"Dumping DocType metadata for site {frappe.local.site} -> {OUT}")

    # Custom DocTypes (anything in our module, plus anything custom=1)
    custom_doctypes = frappe.db.sql(
        """
        SELECT name, module, custom, istable, issingle, is_submittable,
               autoname, naming_rule, search_fields, title_field, sort_field,
               sort_order, track_changes, modified
          FROM `tabDocType`
         WHERE module LIKE 'Casamoderna%%'
            OR module = 'Casa Moderna Custom'
            OR custom = 1
         ORDER BY module, name
        """,
        as_dict=True,
    )
    _write("doctypes", custom_doctypes)

    # Fields for those DocTypes
    if custom_doctypes:
        names = [d["name"] for d in custom_doctypes]
        placeholders = ", ".join(["%s"] * len(names))
        fields = frappe.db.sql(
            f"""
            SELECT parent AS doctype, idx, fieldname, label, fieldtype, options,
                   reqd, unique_, read_only, hidden, in_list_view, in_standard_filter,
                   `default`, depends_on, `fetch_from`, description
              FROM (
                SELECT parent, idx, fieldname, label, fieldtype, options, reqd,
                       `unique` AS unique_, read_only, hidden, in_list_view,
                       in_standard_filter, `default`, depends_on, fetch_from, description
                  FROM `tabDocField`
                 WHERE parent IN ({placeholders})
              ) t
             ORDER BY doctype, idx
            """,
            names,
            as_dict=True,
        )
        _write("docfields", fields)

    # Custom fields injected onto stock DocTypes
    custom_fields = frappe.db.sql(
        """
        SELECT dt AS doctype, fieldname, label, fieldtype, options, insert_after,
               reqd, `unique`, read_only, hidden, `default`, depends_on, fetch_from,
               module, modified
          FROM `tabCustom Field`
         ORDER BY dt, idx
        """,
        as_dict=True,
    )
    _write("custom_fields", custom_fields)

    # Property Setters (overrides on stock fields)
    property_setters = frappe.db.sql(
        """
        SELECT doc_type, field_name, property, property_type, value, modified
          FROM `tabProperty Setter`
         ORDER BY doc_type, field_name, property
        """,
        as_dict=True,
    )
    _write("property_setters", property_setters)

    # Naming series / Document Naming Rules
    naming_rules = frappe.db.sql(
        """
        SELECT name, document_type, prefix, prefix_digits, counter, disabled, priority
          FROM `tabDocument Naming Rule`
         ORDER BY document_type, priority
        """,
        as_dict=True,
    )
    _write("naming_rules", naming_rules)

    # Workflows
    workflows = frappe.db.sql(
        """
        SELECT name, document_type, workflow_state_field, is_active, send_email_alert
          FROM `tabWorkflow`
         ORDER BY document_type
        """,
        as_dict=True,
    )
    _write("workflows", workflows)

    workflow_states = frappe.db.sql(
        """
        SELECT parent AS workflow, state, doc_status, allow_edit, update_field,
               update_value, message
          FROM `tabWorkflow Document State`
         ORDER BY parent, idx
        """,
        as_dict=True,
    )
    _write("workflow_states", workflow_states)

    workflow_transitions = frappe.db.sql(
        """
        SELECT parent AS workflow, state, action, next_state, allowed, allow_self_approval,
               `condition`
          FROM `tabWorkflow Transition`
         ORDER BY parent, idx
        """,
        as_dict=True,
    )
    _write("workflow_transitions", workflow_transitions)

    # Roles
    roles = frappe.db.sql(
        """
        SELECT name, desk_access, disabled, two_factor_auth, restrict_to_domain
          FROM `tabRole`
         WHERE name NOT IN ('Administrator','Guest','All','System Manager')
         ORDER BY name
        """,
        as_dict=True,
    )
    _write("roles", roles)

    # Per-DocType permissions
    perms = frappe.db.sql(
        """
        SELECT parent AS doctype, role, permlevel, `read`, `write`, `create`,
               `delete`, submit, cancel, amend, print, email, export, import_,
               share, report
          FROM (
            SELECT parent, role, permlevel, `read`, `write`, `create`, `delete`,
                   submit, cancel, amend, print, email, export, `import` AS import_,
                   `share`, `report`
              FROM `tabCustom DocPerm`
          ) t
         ORDER BY doctype, role, permlevel
        """,
        as_dict=True,
    )
    _write("custom_docperms", perms)

    # Server Scripts
    server_scripts = frappe.db.sql(
        """
        SELECT name, script_type, reference_doctype, doctype_event, api_method,
               disabled, modified
          FROM `tabServer Script`
         ORDER BY script_type, name
        """,
        as_dict=True,
    )
    _write("server_scripts", server_scripts)

    # Client Scripts
    client_scripts = frappe.db.sql(
        """
        SELECT name, dt AS doctype, view, enabled, modified
          FROM `tabClient Script`
         ORDER BY dt, name
        """,
        as_dict=True,
    )
    _write("client_scripts", client_scripts)

    # Print Formats (custom)
    print_formats = frappe.db.sql(
        """
        SELECT name, doc_type, print_format_type, standard, disabled, modified
          FROM `tabPrint Format`
         WHERE standard = 'No' OR module LIKE 'Casamoderna%%'
         ORDER BY doc_type, name
        """,
        as_dict=True,
    )
    _write("print_formats", print_formats)

    # Installed apps
    apps = frappe.get_installed_apps()
    _write("installed_apps", [{"app": a, "version": frappe.get_attr(f"{a}.__version__") if a != "frappe" else frappe.__version__} for a in apps if frappe.get_module(a)])

    # Row counts for our DocTypes (helps migration sizing)
    counts = []
    for d in custom_doctypes:
        try:
            n = frappe.db.count(d["name"])
        except Exception as e:  # noqa: BLE001
            n = f"err: {e}"
        counts.append({"doctype": d["name"], "module": d["module"], "row_count": n})
    _write("row_counts", counts)

    print("\nDone.")
