#!/usr/bin/env bash
# ============================================================================
# CasaModerna DMS (V3) — Selective Restore Script
# ============================================================================
# Restores components from a CasaModerna full backup archive.
#
# Usage:
#   bash restore-backup.sh <archive.tar.gz> [components...]
#
# Components (specify one or more, or 'all'):
#   database       — Restore MariaDB database
#   site-configs   — Restore site_config.json files
#   custom-app     — Restore casamoderna_dms Frappe app + migrate
#   frontend       — Restore frontend source + rebuild
#   public-files   — Restore product images & uploaded attachments
#   private-files  — Restore private site files
#   pdfs           — Restore generated PDF documents
#   nginx          — Restore nginx virtual host configs (requires sudo)
#   systemd        — Restore systemd service files (requires sudo)
#   all            — Restore everything above
#
# Examples:
#   bash restore-backup.sh CasaModerna-FULL-20260327-020000.tar.gz database
#   bash restore-backup.sh CasaModerna-FULL-20260327-020000.tar.gz database custom-app
#   bash restore-backup.sh /home/frappe/backups/CasaModerna-FULL-20260327-020000.tar.gz all
# ============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BENCH_DIR="/home/frappe/frappe/casamoderna-bench-v3"
BENCH_BIN="/home/frappe/.local/bin/bench"
SITE="cms.local"
CUSTOM_APP_DEST="${BENCH_DIR}/apps/casamoderna_dms"
FRONTEND_DEST="/home/frappe/CasaModernaDMS/frontend"
NGINX_CONF_DIR="/etc/nginx/conf.d"

LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"
log()  { echo "${LOG_PREFIX} $*"; }
warn() { echo "${LOG_PREFIX} WARNING: $*" >&2; }
die()  { echo "${LOG_PREFIX} FATAL: $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
ARCHIVE="${1:-}"
shift || true
COMPONENTS=("$@")

[[ -n "${ARCHIVE}" ]] || die "Usage: $0 <archive.tar.gz> [components...]"
[[ -f "${ARCHIVE}" ]] || die "Archive not found: ${ARCHIVE}"
[[ ${#COMPONENTS[@]} -gt 0 ]] || die "Specify at least one component or 'all'."

has_component() { [[ " ${COMPONENTS[*]} " == *" $1 "* ]] || [[ " ${COMPONENTS[*]} " == *" all "* ]]; }

# ---------------------------------------------------------------------------
# Extract archive
# ---------------------------------------------------------------------------
EXTRACT_DIR=$(mktemp -d)
trap 'rm -rf "${EXTRACT_DIR}"' EXIT

log "Extracting ${ARCHIVE} ..."
tar -xzf "${ARCHIVE}" -C "${EXTRACT_DIR}"
STAGING=$(find "${EXTRACT_DIR}" -maxdepth 1 -type d | tail -1)
log "Staging dir: ${STAGING}"

# ---------------------------------------------------------------------------
# Restore components
# ---------------------------------------------------------------------------

if has_component "database"; then
    log "=== Restoring database ==="
    DB_DIR="${STAGING}/database/${SITE}"
    SQL_FILE=$(ls -1 "${DB_DIR}"/*.sql.gz 2>/dev/null | sort | tail -1 || true)
    [[ -n "${SQL_FILE}" ]] || die "No SQL dump found in ${DB_DIR}"
    read -rp "Restore database from $(basename "${SQL_FILE}") to ${SITE}? [y/N] " confirm
    [[ "${confirm}" == [yY] ]] || { log "Skipped database restore."; }
    if [[ "${confirm}" == [yY] ]]; then
        cd "${BENCH_DIR}"
        ${BENCH_BIN} --site "${SITE}" restore "${SQL_FILE}"
        log "  Database restored."
    fi
fi

if has_component "site-configs"; then
    log "=== Restoring site configs ==="
    read -rp "Overwrite site configs for ${SITE}? [y/N] " confirm
    if [[ "${confirm}" == [yY] ]]; then
        cp "${STAGING}/site-configs/${SITE}-site_config.json" \
           "${BENCH_DIR}/sites/${SITE}/site_config.json" 2>/dev/null || warn "site_config not found"
        cp "${STAGING}/site-configs/common_site_config.json" \
           "${BENCH_DIR}/sites/common_site_config.json" 2>/dev/null || warn "common_site_config not found"
        log "  Site configs restored."
    fi
fi

if has_component "custom-app"; then
    log "=== Restoring custom app ==="
    read -rp "Overwrite ${CUSTOM_APP_DEST} and migrate? [y/N] " confirm
    if [[ "${confirm}" == [yY] ]]; then
        rsync -a --exclude='__pycache__' --exclude='*.pyc' \
            "${STAGING}/custom-app/" "${CUSTOM_APP_DEST}/"
        cd "${BENCH_DIR}"
        ${BENCH_BIN} --site "${SITE}" migrate
        ${BENCH_BIN} --site "${SITE}" clear-cache
        log "  Custom app restored and migrated."
    fi
fi

if has_component "frontend"; then
    log "=== Restoring frontend ==="
    read -rp "Overwrite ${FRONTEND_DEST} and rebuild? [y/N] " confirm
    if [[ "${confirm}" == [yY] ]]; then
        rsync -a --exclude='node_modules' --exclude='dist' \
            "${STAGING}/frontend/" "${FRONTEND_DEST}/"
        cd "${FRONTEND_DEST}"
        npm install
        npm run build
        cp -r dist/* "${BENCH_DIR}/sites/${SITE}/public/casamoderna_dms/"
        log "  Frontend restored and rebuilt."
    fi
fi

if has_component "public-files"; then
    log "=== Restoring public files ==="
    DEST_PUBLIC="${BENCH_DIR}/sites/${SITE}/public/files"
    read -rp "Sync public files to ${DEST_PUBLIC}? [y/N] " confirm
    if [[ "${confirm}" == [yY] ]]; then
        rsync -a "${STAGING}/public-files/" "${DEST_PUBLIC}/"
        log "  Public files restored."
    fi
fi

if has_component "private-files"; then
    log "=== Restoring private files ==="
    DEST_PRIVATE="${BENCH_DIR}/sites/${SITE}/private/files"
    read -rp "Sync private files to ${DEST_PRIVATE}? [y/N] " confirm
    if [[ "${confirm}" == [yY] ]]; then
        rsync -a "${STAGING}/private-files/" "${DEST_PRIVATE}/"
        log "  Private files restored."
    fi
fi

if has_component "nginx"; then
    log "=== Restoring nginx configs ==="
    read -rp "Overwrite configs in ${NGINX_CONF_DIR} (requires sudo)? [y/N] " confirm
    if [[ "${confirm}" == [yY] ]]; then
        sudo cp "${STAGING}/nginx/"*.conf "${NGINX_CONF_DIR}/" 2>/dev/null || warn "No .conf files found"
        sudo nginx -t && sudo systemctl reload nginx
        log "  Nginx configs restored and reloaded."
    fi
fi

if has_component "systemd"; then
    log "=== Restoring systemd configs ==="
    read -rp "Overwrite systemd service files (requires sudo)? [y/N] " confirm
    if [[ "${confirm}" == [yY] ]]; then
        sudo cp "${STAGING}/systemd/"*.service /etc/systemd/system/ 2>/dev/null || warn "No .service files found"
        sudo systemctl daemon-reload
        log "  Systemd configs restored."
    fi
fi

if has_component "pdfs"; then
    log "=== Restoring PDFs ==="
    read -rp "Sync PDFs to /var/www/pdfs/ (requires sudo)? [y/N] " confirm
    if [[ "${confirm}" == [yY] ]]; then
        sudo rsync -a "${STAGING}/pdfs/" /var/www/pdfs/
        log "  PDFs restored."
    fi
fi

log "========== CasaModerna DMS Restore — DONE =========="
