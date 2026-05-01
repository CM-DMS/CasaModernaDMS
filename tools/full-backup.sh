#!/usr/bin/env bash
# ============================================================================
# CasaModerna DMS (V3) — Full System Backup Script
# ============================================================================
# Creates a single compressed .tar.gz archive of the entire CasaModerna DMS
# system: MariaDB database dump, site configs, custom app source, frontend,
# product images, uploaded files, PDFs, nginx configs, and systemd services.
#
# Usage:
#   bash /home/frappe/CasaModernaDMS/tools/full-backup.sh
#
# Cron (daily at 02:00):
#   0 2 * * * /home/frappe/CasaModernaDMS/tools/full-backup.sh >> /home/frappe/backups/backup.log 2>&1
#
# Runs as user: frappe
# ============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BENCH_DIR="/home/frappe/frappe/casamoderna-bench-v3"
SITE="cms.local"
BENCH_BIN="/home/frappe/.local/bin/bench"

BACKUP_ROOT="/home/frappe/backups"
RETENTION_DAYS=14

# Source directories to include
CUSTOM_APP_SRC="/home/frappe/CasaModernaDMS/casamoderna_dms"
FRONTEND_SRC="/home/frappe/CasaModernaDMS/frontend"
NGINX_CONF_DIR="/etc/nginx/conf.d"
PDF_DIR="/var/www/pdfs"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
STAGING_DIR="${BACKUP_ROOT}/staging-${TIMESTAMP}"
ARCHIVE_NAME="CasaModerna-FULL-${TIMESTAMP}.tar.gz"
ARCHIVE_PATH="${BACKUP_ROOT}/${ARCHIVE_NAME}"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

log()  { echo "${LOG_PREFIX} $*"; }
warn() { echo "${LOG_PREFIX} WARNING: $*" >&2; }
die()  { echo "${LOG_PREFIX} FATAL: $*" >&2; exit 1; }

cleanup() {
    if [[ -d "${STAGING_DIR}" ]]; then
        rm -rf "${STAGING_DIR}"
    fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
log "========== CasaModerna DMS Full Backup — START =========="
log "Timestamp : ${TIMESTAMP}"
log "Archive   : ${ARCHIVE_PATH}"

mkdir -p "${BACKUP_ROOT}"

[[ -d "${BENCH_DIR}" ]] || die "Bench directory not found: ${BENCH_DIR}"
[[ -x "${BENCH_BIN}" ]] || die "Bench binary not found: ${BENCH_BIN}"

# ---------------------------------------------------------------------------
# Step 1: Fresh MariaDB dump via bench
# ---------------------------------------------------------------------------
log "Step 1/6: Creating fresh database backup for ${SITE} ..."
cd "${BENCH_DIR}"
${BENCH_BIN} --site "${SITE}" backup --with-files 2>&1 | tail -5
log "  Database backup complete."

# ---------------------------------------------------------------------------
# Step 2: Create staging directory structure
# ---------------------------------------------------------------------------
log "Step 2/6: Assembling staging directory ..."
mkdir -p "${STAGING_DIR}"/{database,site-configs,custom-app,frontend,public-files,private-files,nginx,systemd,pdfs}

# ---------------------------------------------------------------------------
# Step 3: Copy database backups (latest)
# ---------------------------------------------------------------------------
log "Step 3/6: Copying database dumps ..."

copy_latest_backups() {
    local site="$1"
    local backup_dir="${BENCH_DIR}/sites/${site}/private/backups"
    if [[ -d "${backup_dir}" ]]; then
        local latest_prefix
        latest_prefix=$(ls -1 "${backup_dir}"/*.sql.gz 2>/dev/null | sort | tail -1 | xargs -I{} basename {} | cut -d'-' -f1)
        if [[ -n "${latest_prefix}" ]]; then
            local dest="${STAGING_DIR}/database/${site}"
            mkdir -p "${dest}"
            cp "${backup_dir}/${latest_prefix}"* "${dest}/" 2>/dev/null || true
            log "  Copied backups for ${site} (prefix: ${latest_prefix})"
        else
            warn "No .sql.gz found for ${site}"
        fi
    else
        warn "Backup dir not found: ${backup_dir}"
    fi
}

copy_latest_backups "${SITE}"

# ---------------------------------------------------------------------------
# Step 4: Copy site configs and source code
# ---------------------------------------------------------------------------
log "Step 4/6: Copying site configurations ..."

cp "${BENCH_DIR}/sites/common_site_config.json" \
   "${STAGING_DIR}/site-configs/" 2>/dev/null || warn "common_site_config.json not found"

local_conf="${BENCH_DIR}/sites/${SITE}/site_config.json"
if [[ -f "${local_conf}" ]]; then
    cp "${local_conf}" "${STAGING_DIR}/site-configs/${SITE}-site_config.json"
fi

cp "${BENCH_DIR}/sites/apps.json" "${STAGING_DIR}/site-configs/" 2>/dev/null || true
cp "${BENCH_DIR}/Procfile"        "${STAGING_DIR}/site-configs/" 2>/dev/null || true

log "Step 5/6: Copying source code and assets ..."

# Custom Frappe app (backend)
if [[ -d "${CUSTOM_APP_SRC}" ]]; then
    rsync -a --exclude='__pycache__' --exclude='*.pyc' \
        "${CUSTOM_APP_SRC}/" "${STAGING_DIR}/custom-app/"
    log "  Custom app source copied."
else
    warn "Custom app source not found: ${CUSTOM_APP_SRC}"
fi

# Frontend (exclude node_modules)
if [[ -d "${FRONTEND_SRC}" ]]; then
    rsync -a --exclude='node_modules' --exclude='.git' \
        "${FRONTEND_SRC}/" "${STAGING_DIR}/frontend/"
    log "  Frontend source copied."
else
    warn "Frontend source not found: ${FRONTEND_SRC}"
fi

# Public files (product images, uploaded attachments)
SITE_PUBLIC="${BENCH_DIR}/sites/${SITE}/public/files"
if [[ -d "${SITE_PUBLIC}" ]]; then
    rsync -a "${SITE_PUBLIC}/" "${STAGING_DIR}/public-files/"
    log "  Public files copied."
else
    warn "Public files dir not found: ${SITE_PUBLIC}"
fi

# Private files
SITE_PRIVATE="${BENCH_DIR}/sites/${SITE}/private/files"
if [[ -d "${SITE_PRIVATE}" ]]; then
    rsync -a "${SITE_PRIVATE}/" "${STAGING_DIR}/private-files/"
    log "  Private files copied."
fi

# ---------------------------------------------------------------------------
# Step 6: Copy system configs and create archive
# ---------------------------------------------------------------------------
log "Step 6/6: Copying system configurations and archiving ..."

# Nginx configs (V3 uses /etc/nginx/conf.d/)
if [[ -d "${NGINX_CONF_DIR}" ]]; then
    cp "${NGINX_CONF_DIR}"/*.conf "${STAGING_DIR}/nginx/" 2>/dev/null || true
    log "  Nginx configs copied."
else
    warn "Nginx config dir not found: ${NGINX_CONF_DIR}"
fi

# Systemd service files
find /etc/systemd/system -name "casamoderna-bench-v3*.service" -o \
                          -name "mariadb-v3.service" 2>/dev/null | \
  xargs -I{} cp {} "${STAGING_DIR}/systemd/" 2>/dev/null || true

# Generated PDFs
if [[ -d "${PDF_DIR}" ]] && [[ -r "${PDF_DIR}" ]]; then
    rsync -a "${PDF_DIR}/" "${STAGING_DIR}/pdfs/"
    log "  Generated PDFs copied."
else
    warn "PDF dir not found or not readable: ${PDF_DIR}"
fi

# Record backup metadata
cat > "${STAGING_DIR}/BACKUP_META.json" << META_EOF
{
  "created": "$(date -Iseconds)",
  "hostname": "$(hostname)",
  "site": "${SITE}",
  "bench_dir": "${BENCH_DIR}",
  "archive": "${ARCHIVE_NAME}"
}
META_EOF

# Create compressed archive
log "Creating archive: ${ARCHIVE_PATH}"
tar -czf "${ARCHIVE_PATH}" -C "${BACKUP_ROOT}" "staging-${TIMESTAMP}"

# Generate SHA256 checksum
sha256sum "${ARCHIVE_PATH}" > "${ARCHIVE_PATH}.sha256"
log "  SHA256: $(cat "${ARCHIVE_PATH}.sha256" | awk '{print $1}')"

# Cleanup old backups
log "Removing archives older than ${RETENTION_DAYS} days ..."
find "${BACKUP_ROOT}" -maxdepth 1 -name "CasaModerna-FULL-*.tar.gz" \
    -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true
find "${BACKUP_ROOT}" -maxdepth 1 -name "CasaModerna-FULL-*.tar.gz.sha256" \
    -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true

ARCHIVE_SIZE=$(du -sh "${ARCHIVE_PATH}" | cut -f1)
log "========== CasaModerna DMS Full Backup — DONE (${ARCHIVE_SIZE}) =========="
