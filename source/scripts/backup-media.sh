#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ATELIER_ENV_FILE:-${ROOT_DIR}/.env}"
COMPOSE_FILE="${ROOT_DIR}/infra/docker/docker-compose.yml"
BACKUP_DIR="${1:-${ATELIER_BACKUP_DIR:-/opt/atelier-backups}}"
LOCK_DIR="${BACKUP_DIR}/.atelier-media-backup.lock"

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ -f "${ENV_FILE}" ]] || fail "No existe ${ENV_FILE}."
command -v docker >/dev/null 2>&1 || fail "Docker no está disponible."
docker compose version >/dev/null 2>&1 || fail "docker compose no está disponible."
mkdir -p -- "${BACKUP_DIR}"
chmod 700 -- "${BACKUP_DIR}"
mkdir -- "${LOCK_DIR}" 2>/dev/null || fail "Ya existe otra copia multimedia en ejecución."
TMP_ARCHIVE=""
cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  [[ -n "${TMP_ARCHIVE}" && -f "${TMP_ARCHIVE}" ]] && rm -f -- "${TMP_ARCHIVE}"
  rmdir -- "${LOCK_DIR}" 2>/dev/null || true
  exit "${exit_code}"
}
trap cleanup EXIT INT TERM

COMPOSE=(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")
API_CONTAINER="$("${COMPOSE[@]}" ps -a -q api)"
if [[ -z "${API_CONTAINER}" ]]; then
  "${COMPOSE[@]}" create api >/dev/null
  API_CONTAINER="$("${COMPOSE[@]}" ps -a -q api)"
fi
[[ -n "${API_CONTAINER}" ]] || fail "No se encontró el contenedor API."
MEDIA_VOLUME="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data/media"}}{{.Name}}{{end}}{{end}}' "${API_CONTAINER}")"
API_IMAGE="$(docker inspect --format '{{.Config.Image}}' "${API_CONTAINER}")"
[[ -n "${MEDIA_VOLUME}" && -n "${API_IMAGE}" ]] || fail "No se pudo identificar el volumen multimedia."

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE_NAME="atelier-media-${TIMESTAMP}.tar.gz"
ARCHIVE_PATH="${BACKUP_DIR}/${ARCHIVE_NAME}"
TMP_ARCHIVE="${ARCHIVE_PATH}.part"

printf 'Creando copia multimedia: %s\n' "${ARCHIVE_PATH}"
docker run --rm --user 0 \
  -v "${MEDIA_VOLUME}:/data:ro" \
  "${API_IMAGE}" sh -ec 'cd /data && tar -czf - .' > "${TMP_ARCHIVE}"
[[ -s "${TMP_ARCHIVE}" ]] || fail "La copia multimedia está vacía."
mv -- "${TMP_ARCHIVE}" "${ARCHIVE_PATH}"
TMP_ARCHIVE=""
(
  cd -- "${BACKUP_DIR}"
  sha256sum -- "${ARCHIVE_NAME}" > "${ARCHIVE_NAME}.sha256"
)
ENTRY_COUNT="$(tar -tzf "${ARCHIVE_PATH}" | wc -l | tr -d ' ')"
BYTES="$(wc -c < "${ARCHIVE_PATH}" | tr -d ' ')"
cat > "${ARCHIVE_PATH}.meta" <<META
archive=${ARCHIVE_NAME}
created_at_utc=${TIMESTAMP}
bytes=${BYTES}
entries=${ENTRY_COUNT}
volume=${MEDIA_VOLUME}
format=tar-gzip
META
chmod 600 -- "${ARCHIVE_PATH}" "${ARCHIVE_PATH}.sha256" "${ARCHIVE_PATH}.meta"
printf 'Copia multimedia creada: %s\n' "${ARCHIVE_PATH}"
