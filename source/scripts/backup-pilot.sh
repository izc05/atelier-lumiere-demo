#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ATELIER_ENV_FILE:-${ROOT_DIR}/.env}"
COMPOSE_FILE="${ROOT_DIR}/infra/docker/docker-compose.yml"
BACKUP_DIR="${1:-${ATELIER_BACKUP_DIR:-/opt/atelier-backups}}"
LOCK_DIR="${BACKUP_DIR}/.atelier-pilot-backup.lock"
SERVICES_STOPPED=false
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
mkdir -p -- "${BACKUP_DIR}"
chmod 700 -- "${BACKUP_DIR}"
mkdir -- "${LOCK_DIR}" 2>/dev/null || fail "Ya existe otra copia completa en ejecución."
COMPOSE=(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")
cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  if [[ "${SERVICES_STOPPED}" == "true" ]]; then
    "${COMPOSE[@]}" up -d api web >/dev/null 2>&1 || true
  fi
  rmdir -- "${LOCK_DIR}" 2>/dev/null || true
  exit "${exit_code}"
}
trap cleanup EXIT INT TERM

printf 'Pausando escrituras durante la copia consistente...\n'
"${COMPOSE[@]}" stop web api >/dev/null 2>&1 || true
SERVICES_STOPPED=true

bash "${ROOT_DIR}/scripts/backup-database.sh" "${BACKUP_DIR}"
DB_ARCHIVE="$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'atelier-*.dump' -printf '%T@ %p\n' | sort -nr | awk 'NR==1{sub(/^[^ ]+ /,"");print;exit}')"
[[ -n "${DB_ARCHIVE}" ]] || fail "No se localizó la copia PostgreSQL."
bash "${ROOT_DIR}/scripts/verify-database-backup.sh" "${DB_ARCHIVE}"

# backup-media necesita el contenedor API para identificar el volumen; lo crea sin aceptar tráfico.
"${COMPOSE[@]}" create api >/dev/null
bash "${ROOT_DIR}/scripts/backup-media.sh" "${BACKUP_DIR}"
MEDIA_ARCHIVE="$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'atelier-media-*.tar.gz' -printf '%T@ %p\n' | sort -nr | awk 'NR==1{sub(/^[^ ]+ /,"");print;exit}')"
[[ -n "${MEDIA_ARCHIVE}" ]] || fail "No se localizó la copia multimedia."
bash "${ROOT_DIR}/scripts/verify-media-backup.sh" "${MEDIA_ARCHIVE}"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
MANIFEST="${BACKUP_DIR}/atelier-pilot-${TIMESTAMP}.manifest"
DB_SHA="$(cut -d' ' -f1 "${DB_ARCHIVE}.sha256")"
MEDIA_SHA="$(cut -d' ' -f1 "${MEDIA_ARCHIVE}.sha256")"
GIT_COMMIT="$(git -C "${ROOT_DIR}/.." rev-parse HEAD 2>/dev/null || printf unknown)"
cat > "${MANIFEST}" <<META
created_at_utc=${TIMESTAMP}
git_commit=${GIT_COMMIT}
database=$(basename -- "${DB_ARCHIVE}")
database_sha256=${DB_SHA}
media=$(basename -- "${MEDIA_ARCHIVE}")
media_sha256=${MEDIA_SHA}
verified_database=true
verified_media=true
META
chmod 600 -- "${MANIFEST}"

MIRROR_DIR="${PILOT_BACKUP_MIRROR_DIR:-}"
if [[ -z "${MIRROR_DIR}" && -f "${ENV_FILE}" ]]; then
  MIRROR_DIR="$(awk -F= '/^[[:space:]]*PILOT_BACKUP_MIRROR_DIR[[:space:]]*=/{sub(/^[^=]*=/,"");gsub(/^[[:space:]\047\"]+|[[:space:]\047\"]+$/,"");print;exit}' "${ENV_FILE}")"
fi
if [[ -n "${MIRROR_DIR}" ]]; then
  [[ -d "${MIRROR_DIR}" && -w "${MIRROR_DIR}" ]] \
    || fail "La copia externa configurada no está montada o no permite escritura: ${MIRROR_DIR}"
  cp -- "${DB_ARCHIVE}" "${DB_ARCHIVE}.sha256" "${DB_ARCHIVE}.meta" \
    "${MEDIA_ARCHIVE}" "${MEDIA_ARCHIVE}.sha256" "${MEDIA_ARCHIVE}.meta" \
    "${MANIFEST}" "${MIRROR_DIR}/"
  printf 'Copia externa sincronizada: %s\n' "${MIRROR_DIR}"
fi

PILOT_BACKUP_RETENTION_DAYS="${PILOT_BACKUP_RETENTION_DAYS:-14}" \
  bash "${ROOT_DIR}/scripts/prune-pilot-backups.sh" "${BACKUP_DIR}"

"${COMPOSE[@]}" up -d api web >/dev/null
SERVICES_STOPPED=false
printf '\nCOPIA COMPLETA DEL PILOTO VERIFICADA\n'
printf 'Manifiesto: %s\n' "${MANIFEST}"
printf 'PostgreSQL: %s\n' "${DB_ARCHIVE}"
printf 'Multimedia: %s\n' "${MEDIA_ARCHIVE}"
