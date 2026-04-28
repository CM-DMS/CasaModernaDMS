"""
backup_api.py — Whitelisted endpoints for the Backup & Restore admin screen.

Security: all endpoints are restricted to users with the CM Super Admin role.
"""

import os
import re
import subprocess
import frappe

BACKUP_DIR      = "/home/frappe/backups"
BACKUP_SCRIPT   = "/home/frappe/ONE-CasaModernaDMS/tools/full-backup.sh"
RESTORE_SCRIPT  = "/home/frappe/ONE-CasaModernaDMS/tools/restore-backup.sh"
ALLOWED_ROLE    = "CM Super Admin"

# Only allow safe filenames: CasaModerna-FULL-YYYYMMDD-HHMMSS.tar.gz
SAFE_FILENAME = re.compile(r"^CasaModerna-FULL-\d{8}-\d{6}\.tar\.gz$")

ALL_COMPONENTS = [
    "database", "site-configs", "custom-app", "frontend",
    "public-files", "private-files", "pdfs", "nginx", "systemd",
]


def _check_access():
    if ALLOWED_ROLE not in frappe.get_roles(frappe.session.user):
        frappe.throw("Access denied", frappe.PermissionError)


@frappe.whitelist(methods=["GET"])
def list_backups():
    """Return list of available backup archives + disk info."""
    _check_access()

    backups = []
    if os.path.isdir(BACKUP_DIR):
        for f in sorted(os.listdir(BACKUP_DIR), reverse=True):
            if not SAFE_FILENAME.match(f):
                continue
            path = os.path.join(BACKUP_DIR, f)
            stat = os.stat(path)
            size_mb = stat.st_size / (1024 * 1024)
            # Parse date from filename: CasaModerna-FULL-YYYYMMDD-HHMMSS.tar.gz
            parts = f.replace("CasaModerna-FULL-", "").replace(".tar.gz", "")
            date_str = parts[:8]
            time_str = parts[9:] if len(parts) > 8 else ""
            formatted = (
                f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]} "
                f"{time_str[:2]}:{time_str[2:4]}:{time_str[4:6]}"
                if len(time_str) >= 6 else date_str
            )
            backups.append({
                "filename": f,
                "date": formatted,
                "size": f"{size_mb:.1f} MB",
                "bytes": stat.st_size,
            })

    # Disk info
    disk = {}
    try:
        st = os.statvfs(BACKUP_DIR if os.path.isdir(BACKUP_DIR) else "/home/frappe")
        free_gb = (st.f_bavail * st.f_frsize) / (1024 ** 3)
        total_gb = (st.f_blocks * st.f_frsize) / (1024 ** 3)
        disk = {"free": f"{free_gb:.1f} GB", "total": f"{total_gb:.1f} GB"}
    except Exception:
        pass

    return {"backups": backups, "disk": disk}


@frappe.whitelist(methods=["POST"])
def create_backup():
    """Trigger a full system backup by running the backup script."""
    _check_access()

    if not os.path.isfile(BACKUP_SCRIPT):
        frappe.throw(f"Backup script not found: {BACKUP_SCRIPT}")

    try:
        result = subprocess.run(
            ["bash", BACKUP_SCRIPT],
            capture_output=True,
            text=True,
            timeout=600,
        )
    except subprocess.TimeoutExpired:
        frappe.throw("Backup script timed out after 10 minutes")

    if result.returncode != 0:
        frappe.log_error(
            title="Backup script failed",
            message=result.stderr[:2000],
        )
        frappe.throw(f"Backup failed: {result.stderr[:500]}")

    # Parse archive name and size from output
    archive = ""
    size = ""
    for line in result.stdout.splitlines():
        if "Archive :" in line:
            archive = line.split("Archive :")[1].strip()
        if "Size    :" in line:
            size = line.split("Size    :")[1].strip()

    return {"archive": archive or "created", "size": size or "unknown"}


@frappe.whitelist(methods=["GET"], allow_guest=False)
def download_backup(filename=None):
    """Stream a backup archive as a file download."""
    _check_access()

    if not filename or not SAFE_FILENAME.match(filename):
        frappe.throw("Invalid filename")

    path = os.path.join(BACKUP_DIR, filename)
    if not os.path.isfile(path):
        frappe.throw("Backup file not found", frappe.DoesNotExistError)

    # Ensure the resolved path is within the backup directory (path traversal guard)
    real_path = os.path.realpath(path)
    if not real_path.startswith(os.path.realpath(BACKUP_DIR) + os.sep):
        frappe.throw("Invalid path")

    with open(real_path, "rb") as f:
        content = f.read()

    frappe.response["filename"] = filename
    frappe.response["filecontent"] = content
    frappe.response["type"] = "download"


@frappe.whitelist(methods=["POST"])
def delete_backup(filename=None):
    """Delete a backup archive from the VPS."""
    _check_access()

    if not filename or not SAFE_FILENAME.match(filename):
        frappe.throw("Invalid filename")

    path = os.path.join(BACKUP_DIR, filename)
    real_path = os.path.realpath(path)
    if not real_path.startswith(os.path.realpath(BACKUP_DIR) + os.sep):
        frappe.throw("Invalid path")

    if os.path.isfile(real_path):
        os.remove(real_path)
        # Also remove the .sha256 checksum
        sha_path = real_path + ".sha256"
        if os.path.isfile(sha_path):
            os.remove(sha_path)

    return {"deleted": filename}


# ── Restore endpoints ────────────────────────────────────────────────────────

@frappe.whitelist(methods=["GET"])
def inspect_backup(filename=None):
    """Return the components available inside a backup archive."""
    _check_access()

    if not filename or not SAFE_FILENAME.match(filename):
        frappe.throw("Invalid filename")

    path = os.path.join(BACKUP_DIR, filename)
    real_path = os.path.realpath(path)
    if not os.path.isfile(real_path):
        frappe.throw("Backup file not found", frappe.DoesNotExistError)
    if not real_path.startswith(os.path.realpath(BACKUP_DIR) + os.sep):
        frappe.throw("Invalid path")

    # List top-level dirs in the archive
    try:
        result = subprocess.run(
            ["tar", "-tzf", real_path],
            capture_output=True, text=True, timeout=30,
        )
        entries = result.stdout.strip().splitlines()
    except Exception as e:
        frappe.throw(f"Failed to read archive: {e}")

    top_dirs = set()
    db_file = None
    for entry in entries:
        parts = entry.strip("./").split("/")
        if parts[0]:
            top_dirs.add(parts[0])
        if entry.endswith(".sql.gz"):
            db_file = entry

    components = []
    component_map = {
        "database":      {"label": "Database (MariaDB)",   "icon": "🗄️"},
        "site-configs":  {"label": "Site Configurations",  "icon": "⚙️"},
        "custom-app":    {"label": "Backend App Source",    "icon": "🐍"},
        "frontend":      {"label": "Frontend Source",       "icon": "⚛️"},
        "public-files":  {"label": "Public Files & Images", "icon": "🖼️"},
        "private-files": {"label": "Private Files",         "icon": "🔒"},
        "pdfs":          {"label": "Generated PDFs",        "icon": "📄"},
        "nginx":         {"label": "Nginx Configs",         "icon": "🌐"},
        "systemd":       {"label": "Systemd Services",      "icon": "🔧"},
    }
    for key in ALL_COMPONENTS:
        if key in top_dirs:
            info = component_map.get(key, {"label": key, "icon": "📦"})
            components.append({"key": key, "label": info["label"], "icon": info["icon"]})

    return {
        "filename": filename,
        "components": components,
        "db_file": db_file,
        "total_entries": len(entries),
    }


@frappe.whitelist(methods=["POST"])
def restore_backup(filename=None, components=None, target="staging"):
    """Restore selected components from a backup archive.

    Args:
        filename:   Archive filename (must match SAFE_FILENAME pattern)
        components: JSON list of component keys to restore
        target:     'staging' (default) or 'production'
    """
    _check_access()

    if not filename or not SAFE_FILENAME.match(filename):
        frappe.throw("Invalid filename")

    path = os.path.join(BACKUP_DIR, filename)
    real_path = os.path.realpath(path)
    if not os.path.isfile(real_path):
        frappe.throw("Backup file not found", frappe.DoesNotExistError)
    if not real_path.startswith(os.path.realpath(BACKUP_DIR) + os.sep):
        frappe.throw("Invalid path")

    # Parse components
    if isinstance(components, str):
        import json
        try:
            components = json.loads(components)
        except Exception:
            components = [c.strip() for c in components.split(",") if c.strip()]

    if not components or not isinstance(components, list):
        frappe.throw("No components specified for restore")

    # Validate each component
    for c in components:
        if c not in ALL_COMPONENTS:
            frappe.throw(f"Invalid component: {c}")

    # Validate target
    if target not in ("staging", "production"):
        frappe.throw("Target must be 'staging' or 'production'")

    if not os.path.isfile(RESTORE_SCRIPT):
        frappe.throw(f"Restore script not found: {RESTORE_SCRIPT}")

    # Build command
    cmd = ["bash", RESTORE_SCRIPT, "--yes", "--skip-pre-backup"]
    if target == "production":
        cmd.append("--production")
    cmd.append(real_path)
    cmd.extend(components)

    frappe.log_error(
        title="Restore initiated",
        message=f"User: {frappe.session.user}\nArchive: {filename}\nComponents: {components}\nTarget: {target}",
    )

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=900,
        )
    except subprocess.TimeoutExpired:
        frappe.throw("Restore timed out after 15 minutes")

    output = result.stdout
    if result.returncode != 0:
        frappe.log_error(
            title="Restore failed",
            message=f"stderr: {result.stderr[:2000]}\nstdout: {output[:2000]}",
        )
        frappe.throw(f"Restore failed: {result.stderr[:500]}")

    return {
        "status": "success",
        "components": components,
        "target": target,
        "output": output[-2000:] if len(output) > 2000 else output,
    }
