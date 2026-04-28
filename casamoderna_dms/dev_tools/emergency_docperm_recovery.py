import json
from typing import Iterable, Optional

import frappe


KEY_DOCTYPES: tuple[str, ...] = (
    "Item",
    "Sales Order",
    "Quotation",
    "Supplier",
    "User",
    "Role",
    "Custom Field",
    "Property Setter",
    "Print Format",
)

# Explicit alias for readability in the emergency contract report.
KEY_PERMISSION_DOCTYPES: tuple[str, ...] = KEY_DOCTYPES


def _sql_value(sql: str, params: Optional[object] = None):
    rows = frappe.db.sql(sql, params or (), as_list=True)
    if not rows or not rows[0]:
        return None
    return rows[0][0]


def _print_header(title: str):
    print("=" * 88)
    print(title)
    print("=" * 88)


def docperm_phase_a_evidence() -> None:
    """Phase A evidence collection using MariaDB via frappe.db.sql.

    Output is intentionally plain-text and stable for copy/paste into incident reports.
    """

    _print_header("PHASE A — DocPerm DB Evidence")

    docperm_count = _sql_value("SELECT COUNT(*) FROM `tabDocPerm`")
    print("A1) SELECT COUNT(*) FROM `tabDocPerm`; =>", docperm_count)

    print("A1) SELECT parent, COUNT(*) FROM `tabDocPerm` GROUP BY parent ORDER BY COUNT(*) DESC LIMIT 20;")
    top20 = frappe.db.sql(
        "SELECT parent, COUNT(*) AS cnt FROM `tabDocPerm` GROUP BY parent ORDER BY cnt DESC LIMIT 20",
        as_list=True,
    )
    for parent, cnt in top20:
        print(f"  {parent}: {cnt}")

    print("A2) Spot-check key doctypes:")
    for doctype in KEY_DOCTYPES:
        c = _sql_value("SELECT COUNT(*) FROM `tabDocPerm` WHERE parent=%s", doctype)
        print(f"  {doctype}: {c}")

    try:
        custom_docperm_count = _sql_value("SELECT COUNT(*) FROM `tabCustom DocPerm`")
        print("Extra) SELECT COUNT(*) FROM `tabCustom DocPerm`; =>", custom_docperm_count)
    except Exception as exc:  # table can differ by version
        print("Extra) tabCustom DocPerm count => <error>", str(exc))


def custom_docperm_top_parents(limit: int = 30) -> None:
    _print_header("PHASE A — Custom DocPerm distribution (top parents)")
    try:
        rows = frappe.db.sql(
            "SELECT parent, COUNT(*) AS cnt FROM `tabCustom DocPerm` GROUP BY parent ORDER BY cnt DESC LIMIT %s",
            limit,
            as_list=True,
        )
    except Exception as exc:
        print("Custom DocPerm table not available or query failed =>", str(exc))
        return

    for parent, cnt in rows:
        print(f"  {parent}: {cnt}")


def custom_docperm_key_doctypes() -> None:
    _print_header("PHASE A — Custom DocPerm key-doctype spot-check")
    try:
        for dt in KEY_PERMISSION_DOCTYPES:
            c = _sql_value("SELECT COUNT(*) FROM `tabCustom DocPerm` WHERE parent=%s", dt)
            print(f"  {dt}: {c}")
    except Exception as exc:
        print("Custom DocPerm table not available or query failed =>", str(exc))


def roles_referenced_by_permissions(limit: int = 200) -> None:
    _print_header("PHASE B — Roles referenced by permissions vs tabRole")

    existing_roles = set(frappe.get_all("Role", pluck="name"))

    roles_from_docperm = {
        r[0]
        for r in frappe.db.sql("SELECT DISTINCT role FROM `tabDocPerm` WHERE ifnull(role,'')!=''", as_list=True)
    }

    try:
        roles_from_custom = {
            r[0]
            for r in frappe.db.sql(
                "SELECT DISTINCT role FROM `tabCustom DocPerm` WHERE ifnull(role,'')!=''", as_list=True
            )
        }
    except Exception:
        roles_from_custom = set()

    roles_from_assignments = {
        r[0]
        for r in frappe.db.sql(
            "SELECT DISTINCT role FROM `tabHas Role` WHERE ifnull(role,'')!=''",
            as_list=True,
        )
    }

    referenced = roles_from_docperm | roles_from_custom | roles_from_assignments
    missing = sorted(r for r in referenced if r and r not in existing_roles)

    print("tabRole count =>", len(existing_roles))
    print("distinct roles referenced (DocPerm/Custom DocPerm/Has Role) =>", len(referenced))
    print("missing roles in tabRole =>", len(missing))

    for name in missing[:limit]:
        print("  ", name)


def restore_missing_roles_from_permissions(commit: bool = False, limit: int = 500) -> None:
    """Recreate missing Role docs for roles referenced in permissions/assignments.

    This restores Permission Manager role dropdown visibility without changing DocPerm rules.
    """

    _print_header(f"FIX — Restore missing Role docs (commit={commit})")

    existing_roles = set(frappe.get_all("Role", pluck="name"))

    roles_from_docperm = {
        r[0]
        for r in frappe.db.sql("SELECT DISTINCT role FROM `tabDocPerm` WHERE ifnull(role,'')!=''", as_list=True)
    }

    try:
        roles_from_custom = {
            r[0]
            for r in frappe.db.sql(
                "SELECT DISTINCT role FROM `tabCustom DocPerm` WHERE ifnull(role,'')!=''", as_list=True
            )
        }
    except Exception:
        roles_from_custom = set()

    roles_from_assignments = {
        r[0]
        for r in frappe.db.sql(
            "SELECT DISTINCT role FROM `tabHas Role` WHERE ifnull(role,'')!=''",
            as_list=True,
        )
    }

    referenced = roles_from_docperm | roles_from_custom | roles_from_assignments
    missing = [r for r in sorted(referenced) if r and r not in existing_roles]

    print("missing roles to create =>", len(missing))
    for name in missing[:80]:
        print("  ", name)

    if not missing:
        print("No missing roles detected.")
        return

    if not commit:
        print("Dry-run only (commit=False). No DB changes applied.")
        return

    created = 0
    for role_name in missing[:limit]:
        doc = frappe.get_doc(
            {
                "doctype": "Role",
                "role_name": role_name,
                "desk_access": 1,
                "disabled": 0,
                "is_custom": 0,
            }
        )

        # Website-only roles should not have desk access.
        if role_name in {"Customer", "Supplier", "Guest"}:
            doc.desk_access = 0

        doc.insert(ignore_permissions=True, ignore_if_duplicate=True)
        created += 1

    frappe.db.commit()
    frappe.clear_cache()
    print("created roles =>", created)


def backup_custom_docperm(path: Optional[str] = None) -> None:
    """Backup Custom DocPerm rows to a JSON file for rollback."""

    _print_header("ROLLBACK PREP — Backup Custom DocPerm")

    try:
        rows = frappe.get_all(
            "Custom DocPerm",
            fields=[
                "name",
                "parent",
                "role",
                "permlevel",
                "if_owner",
                "read",
                "write",
                "create",
                "delete",
                "submit",
                "cancel",
                "amend",
            ],
            order_by="parent asc, role asc, permlevel asc, name asc",
            limit_page_length=0,
        )
    except Exception as exc:
        print("Custom DocPerm table not available or query failed =>", str(exc))
        return

    if path is None:
        import os

        from frappe.utils import now_datetime

        ts = now_datetime().strftime("%Y-%m-%d_%H%M%S")
        path = os.path.join(
            frappe.get_site_path("private", "files", "cm_emergency"), f"custom_docperm_backup_{ts}.json"
        )

    frappe.create_folder(path.rsplit("/", 1)[0])
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"count": len(rows), "rows": rows}, f, indent=2, sort_keys=True)

    print("backup_path =>", path)
    print("rows_backed_up =>", len(rows))


def delete_all_custom_docperm(commit: bool = False) -> None:
    """Hard-delete all Custom DocPerm rows (DocPerm-only baseline).

    Use `backup_custom_docperm()` first if rollback may be needed.
    """

    _print_header(f"FIX — Delete ALL Custom DocPerm rows (commit={commit})")

    try:
        count = _sql_value("SELECT COUNT(*) FROM `tabCustom DocPerm`")
    except Exception as exc:
        print("Custom DocPerm table not available or query failed =>", str(exc))
        return

    print("current Custom DocPerm COUNT =>", count)
    if not commit:
        print("Dry-run only (commit=False). No DB changes applied.")
        return

    frappe.db.sql("DELETE FROM `tabCustom DocPerm`")
    frappe.db.commit()
    frappe.clear_cache()
    print("Custom DocPerm rows deleted + cache cleared.")


def restore_custom_docperm_from_backup(path: str, commit: bool = False) -> None:
    """Rollback helper: restore Custom DocPerm rows from `backup_custom_docperm()` JSON."""

    _print_header(f"ROLLBACK — Restore Custom DocPerm from backup (commit={commit})")
    print("backup_path =>", path)

    with open(path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    rows = payload.get("rows") or []
    print("rows_in_backup =>", len(rows))
    if not rows:
        print("Nothing to restore.")
        return

    if not commit:
        print("Dry-run only (commit=False). No DB changes applied.")
        return

    inserted = 0
    for row in rows:
        doc = frappe.get_doc({"doctype": "Custom DocPerm", **row})
        # Use insert to ensure the document gets a new name if name clashes.
        doc.insert(ignore_permissions=True)
        inserted += 1

    frappe.db.commit()
    frappe.clear_cache()
    print("rows_inserted =>", inserted)


def role_disabled_evidence(limit: int = 50) -> None:
    _print_header("PHASE B — Role disabled evidence")

    total = _sql_value("SELECT COUNT(*) FROM tabRole")
    disabled = _sql_value("SELECT COUNT(*) FROM tabRole WHERE ifnull(disabled, 0)=1")
    enabled = _sql_value("SELECT COUNT(*) FROM tabRole WHERE ifnull(disabled, 0)=0")
    std_disabled = _sql_value(
        "SELECT COUNT(*) FROM tabRole WHERE ifnull(disabled, 0)=1 AND ifnull(is_custom, 0)=0"
    )

    print("tabRole total =>", total)
    print("tabRole disabled =>", disabled)
    print("tabRole enabled =>", enabled)
    print("tabRole disabled AND is_custom=0 (standard roles) =>", std_disabled)

    rows = frappe.db.sql(
        """
        SELECT name, ifnull(is_custom, 0) AS is_custom, ifnull(disabled, 0) AS disabled, ifnull(restrict_to_domain, '') AS restrict_to_domain
        FROM tabRole
        WHERE ifnull(disabled, 0)=1
        ORDER BY ifnull(is_custom, 0) ASC, name ASC
        LIMIT %s
        """,
        limit,
        as_list=True,
    )
    if not rows:
        print("No disabled roles found.")
        return
    print("disabled roles sample (name, is_custom, disabled, restrict_to_domain):")
    for r in rows:
        print("  ", r)


def print_all_roles() -> None:
    _print_header("PHASE B — tabRole names")
    for name in frappe.get_all("Role", pluck="name"):
        print(name)


def reenable_standard_roles_referenced_by_perms(commit: bool = False, limit: int = 200) -> None:
    """Re-enable standard (is_custom=0) roles that are disabled but still referenced in DocPerm/Custom DocPerm.

    This is a minimal-risk way to restore permission UI visibility without touching custom roles.
    """

    _print_header(f"FIX — Re-enable standard roles referenced by perms (commit={commit})")

    # Find disabled standard roles that appear in either DocPerm or Custom DocPerm.
    roles = frappe.db.sql(
        """
        SELECT DISTINCT r.name
        FROM tabRole r
        WHERE ifnull(r.disabled,0)=1
          AND ifnull(r.is_custom,0)=0
          AND (
            EXISTS (SELECT 1 FROM `tabDocPerm` p WHERE p.role=r.name)
            OR EXISTS (SELECT 1 FROM `tabCustom DocPerm` cp WHERE cp.role=r.name)
          )
        ORDER BY r.name
        LIMIT %s
        """,
        limit,
        as_list=True,
    )

    role_names = [r[0] for r in roles]
    print("disabled standard roles referenced by perms =>", len(role_names))
    for name in role_names[:80]:
        print("  ", name)

    if not commit:
        print("Dry-run only (commit=False). No DB changes applied.")
        return

    for name in role_names:
        frappe.db.set_value("Role", name, "disabled", 0, update_modified=False)

    frappe.db.commit()
    frappe.clear_cache()
    print("Re-enabled roles committed + cache cleared.")


def find_users_like_brian(limit: int = 20) -> None:
    """Locate candidates for Brian's user based on name/email heuristics."""

    _print_header("PHASE A4 — Brian user lookup candidates")

    patterns = (
        "brian%",
        "% brian%",
        "%brian%",
        "%brian%",
    )

    candidates = frappe.db.sql(
        """
        SELECT name, email, full_name, enabled, user_type
        FROM tabUser
        WHERE lower(full_name) LIKE %s
           OR lower(full_name) LIKE %s
           OR lower(email) LIKE %s
           OR lower(name) LIKE %s
        ORDER BY enabled DESC, name
        LIMIT %s
        """,
        (*patterns, limit),
        as_dict=True,
    )

    if not candidates:
        print("No tabUser rows matched brian heuristics.")
        return

    for row in candidates:
        print(
            json.dumps(
                {
                    "name": row.name,
                    "email": row.email,
                    "full_name": row.full_name,
                    "enabled": row.enabled,
                    "user_type": row.user_type,
                },
                sort_keys=True,
            )
        )


def print_user_roles(user: str) -> None:
    _print_header(f"PHASE A4 — Roles for user: {user}")

    exists = _sql_value("SELECT COUNT(*) FROM tabUser WHERE name=%s", user)
    if not exists:
        print("User not found in tabUser.")
        return

    roles = frappe.db.sql(
        "SELECT parent, role FROM `tabHas Role` WHERE parent=%s ORDER BY role",
        user,
        as_list=True,
    )

    if not roles:
        print("No roles found in tabHas Role for this user.")
        return

    for _, role in roles:
        print(role)


def ensure_user_has_roles(user: str, roles: Iterable[str], *, commit: bool = False) -> None:
    """Minimal role assignment helper.

    commit=False by default to prevent accidental writes during evidence gathering.
    """

    _print_header(f"ROLE FIX — Ensure roles for user: {user} (commit={commit})")

    user_doc = frappe.get_doc("User", user)

    existing_roles = {d.role for d in user_doc.roles}
    to_add = [r for r in roles if r not in existing_roles]

    if not to_add:
        print("No changes needed; user already has all specified roles.")
        return

    for role in to_add:
        user_doc.append("roles", {"role": role})
        print("Will add role:", role)

    if not commit:
        print("Dry-run only (commit=False). No DB changes applied.")
        return

    user_doc.save(ignore_permissions=True)
    frappe.db.commit()
    print("Roles saved + committed.")


def permission_manager_snapshot(user: str, doctype: str = "Item") -> None:
    """Diagnose Role Permission Manager symptoms for a specific user.

    This calls the same server-side functions the UI uses, but inside bench execute.
    """

    _print_header(f"PHASE B — Permission Manager snapshot as: {user}")

    from frappe.core.page.permission_manager import permission_manager

    # Simulate session user.
    frappe.set_user(user)

    try:
        active_domains = frappe.get_active_domains()
    except Exception as exc:
        active_domains = f"<error: {exc}>"
    print("active_domains =>", active_domains)

    try:
        payload = permission_manager.get_roles_and_doctypes()
    except Exception as exc:
        print("get_roles_and_doctypes ERROR =>", str(exc))
        return

    doctypes = payload.get("doctypes") or []
    roles = payload.get("roles") or []
    print("get_roles_and_doctypes => doctypes:", len(doctypes), "roles:", len(roles))

    doctype_values = {d.get("value") for d in doctypes if d.get("value")}
    for probe in ("Item", "Sales Order", "Quotation", "Supplier", "Purchase Order"):
        print(f"doctype present? {probe} =>", probe in doctype_values)

    if roles:
        print("roles sample (first 15):")
        for r in roles[:15]:
            print("  ", r.get("value"))
    else:
        print("roles sample => <empty>")

    if doctypes:
        print("doctypes sample (first 15):")
        for d in doctypes[:15]:
            print("  ", d.get("value"))
    else:
        print("doctypes sample => <empty>")

    # Also fetch permission grid for a known doctype.
    try:
        perms = permission_manager.get_permissions(doctype=doctype)
    except Exception as exc:
        print(f"get_permissions({doctype}) ERROR =>", str(exc))
        return

    print(f"get_permissions({doctype}) => rows:", len(perms))
    for row in perms[:10]:
        print(
            json.dumps(
                {
                    "parent": row.get("parent"),
                    "role": row.get("role"),
                    "permlevel": row.get("permlevel"),
                    "read": row.get("read"),
                    "write": row.get("write"),
                    "create": row.get("create"),
                    "delete": row.get("delete"),
                    "if_owner": row.get("if_owner"),
                },
                sort_keys=True,
            )
        )
