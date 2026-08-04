#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ATELIER_ENV_FILE:-${ROOT_DIR}/.env}"
COMPOSE_FILE="${ROOT_DIR}/infra/docker/docker-compose.yml"
ARCHIVE_PATH="${1:-}"
CONFIRMATION="${2:-}"
ROLLBACK_DIR="${ATELIER_BACKUP_DIR:-/opt/atelier-backups}"
SERVICES_STOPPED=false
ROLLBACK_ARCHIVE=""

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ -n "${ARCHIVE_PATH}" && -f "${ARCHIVE_PATH}" ]] \
  || fail "Uso: ${0##*/} ARCHIVO.tar.gz RESTORE_MEDIA_VOLUME"
[[ "${CONFIRMATION}" == "RESTORE_MEDIA_VOLUME" ]] \
  || fail "La restauración exige la confirmación literal RESTORE_MEDIA_VOLUME."
[[ -f "${ENV_FILE}" ]] || fail "No existe ${ENV_FILE}."
command -v docker >/dev/null 2>&1 || fail "Docker no está disponible."
docker compose version >/dev/null 2>&1 || fail "docker compose no está disponible."

bash "${ROOT_DIR}/scripts/verify-media-backup.sh" "${ARCHIVE_PATH}"
mkdir -p -- "${ROLLBACK_DIR}"
chmod 700 -- "${ROLLBACK_DIR}"
COMPOSE=(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  if [[ "${SERVICES_STOPPED}" == "true" ]]; then
    "${COMPOSE[@]}" up -d api web >/dev/null 2>&1 || true
  fi
  exit "${exit_code}"
}
trap cleanup EXIT INT TERM

printf 'Deteniendo web y API para congelar el volumen multimedia...\n'
"${COMPOSE[@]}" stop web api >/dev/null 2>&1 || true
SERVICES_STOPPED=true

printf 'Creando rollback multimedia antes de reemplazar datos...\n'
bash "${ROOT_DIR}/scripts/backup-media.sh" "${ROLLBACK_DIR}"
ROLLBACK_ARCHIVE="$(find "${ROLLBACK_DIR}" -maxdepth 1 -type f -name 'atelier-media-*.tar.gz' -printf '%T@ %p\n' \
  | sort -nr | awk 'NR==1{sub(/^[^ ]+ /,"");print;exit}')"
[[ -n "${ROLLBACK_ARCHIVE}" && -s "${ROLLBACK_ARCHIVE}" ]] \
  || fail "No se pudo crear la copia de rollback multimedia."
bash "${ROOT_DIR}/scripts/verify-media-backup.sh" "${ROLLBACK_ARCHIVE}"

"${COMPOSE[@]}" create api >/dev/null
API_CONTAINER="$("${COMPOSE[@]}" ps -a -q api)"
[[ -n "${API_CONTAINER}" ]] || fail "No se encontró el contenedor API."
MEDIA_VOLUME="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data/media"}}{{.Name}}{{end}}{{end}}' "${API_CONTAINER}")"
API_IMAGE="$(docker inspect --format '{{.Config.Image}}' "${API_CONTAINER}")"
[[ -n "${MEDIA_VOLUME}" && -n "${API_IMAGE}" ]] || fail "No se pudo identificar el volumen multimedia."

restore_archive() {
  local archive="$1"
  docker run --rm --user 0 \
    -v "${MEDIA_VOLUME}:/data" \
    -v "${archive}:/backup/archive.tar.gz:ro" \
    "${API_IMAGE}" sh -ec '
      find /data -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
      tar -xzf /backup/archive.tar.gz -C /data
      chown -R node:node /data
    '
}

printf 'Restaurando multimedia desde: %s\n' "${ARCHIVE_PATH}"
if ! restore_archive "${ARCHIVE_PATH}"; then
  printf 'ERROR: falló la restauración. Recuperando el rollback: %s\n' "${ROLLBACK_ARCHIVE}" >&2
  restore_archive "${ROLLBACK_ARCHIVE}" \
    || fail "También falló el rollback multimedia. Mantén los servicios detenidos y revisa el volumen."
  fail "La restauración solicitada falló y se recuperó el contenido anterior."
fi

"${COMPOSE[@]}" up -d api web >/dev/null
SERVICES_STOPPED=false
printf '\nRESTAURACIÓN MULTIMEDIA COMPLETADA\n'
printf 'Origen: %s\n' "${ARCHIVE_PATH}"
printf 'Rollback conservado: %s\n' "${ROLLBACK_ARCHIVE}"
