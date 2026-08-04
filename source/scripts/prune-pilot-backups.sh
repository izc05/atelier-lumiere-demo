#!/usr/bin/env bash
set -Eeuo pipefail
BACKUP_DIR="${1:-${ATELIER_BACKUP_DIR:-/opt/atelier-backups}}"
RETENTION_DAYS="${PILOT_BACKUP_RETENTION_DAYS:-14}"
[[ "${RETENTION_DAYS}" =~ ^[0-9]+$ && "${RETENTION_DAYS}" -ge 3 && "${RETENTION_DAYS}" -le 365 ]] || {
  printf 'ERROR: PILOT_BACKUP_RETENTION_DAYS debe estar entre 3 y 365.\n' >&2
  exit 1
}
[[ -d "${BACKUP_DIR}" ]] || exit 0
find "${BACKUP_DIR}" -maxdepth 1 -type f -mtime "+${RETENTION_DAYS}" \
  \( -name 'atelier-*.dump' -o -name 'atelier-*.dump.sha256' -o -name 'atelier-*.dump.meta' \
     -o -name 'atelier-media-*.tar.gz' -o -name 'atelier-media-*.tar.gz.sha256' \
     -o -name 'atelier-media-*.tar.gz.meta' -o -name 'atelier-pilot-*.manifest' \) \
  -print -delete
