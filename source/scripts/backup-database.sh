#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ATELIER_ENV_FILE:-${ROOT_DIR}/.env}"
COMPOSE_FILE="${ROOT_DIR}/infra/docker/docker-compose.yml"
BACKUP_DIR="${1:-${ATELIER_BACKUP_DIR:-/opt/atelier-backups}}"
LOCK_DIR="${BACKUP_DIR}/.atelier-backup.lock"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

[[ -f "${ENV_FILE}" ]] || fail "No existe ${ENV_FILE}. Crea primero el archivo privado .env."
command -v docker >/dev/null 2>&1 || fail "Docker no está instalado o no está disponible en PATH."
docker compose version >/dev/null 2>&1 || fail "El complemento docker compose no está disponible."

mkdir -p -- "${BACKUP_DIR}"
[[ -d "${BACKUP_DIR}" && -w "${BACKUP_DIR}" ]] \
  || fail "No se puede escribir en ${BACKUP_DIR}."

if ! mkdir -- "${LOCK_DIR}" 2>/dev/null; then
  fail "Ya existe otra copia en ejecución: ${LOCK_DIR}"
fi

TMP_ARCHIVE=""
cleanup() {
  local exit_code=$?
  [[ -n "${TMP_ARCHIVE}" && -f "${TMP_ARCHIVE}" ]] && rm -f -- "${TMP_ARCHIVE}"
  rmdir -- "${LOCK_DIR}" 2>/dev/null || true
  exit "${exit_code}"
}
trap cleanup EXIT INT TERM

COMPOSE=(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")

printf 'Comprobando PostgreSQL...\n'
"${COMPOSE[@]}" up -d database >/dev/null

DATABASE_CONTAINER="$("${COMPOSE[@]}" ps -q database)"
[[ -n "${DATABASE_CONTAINER}" ]] || fail "No se encontró el contenedor de PostgreSQL."

for _ in $(seq 1 30); do
  HEALTH="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${DATABASE_CONTAINER}" 2>/dev/null || true)"
  [[ "${HEALTH}" == "healthy" ]] && break
  sleep 2
done
[[ "${HEALTH:-}" == "healthy" ]] || fail "PostgreSQL no está saludable (${HEALTH:-desconocido})."

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE_NAME="atelier-${TIMESTAMP}.dump"
ARCHIVE_PATH="${BACKUP_DIR}/${ARCHIVE_NAME}"
TMP_ARCHIVE="${ARCHIVE_PATH}.part"
CHECKSUM_PATH="${ARCHIVE_PATH}.sha256"
METADATA_PATH="${ARCHIVE_PATH}.meta"

[[ ! -e "${ARCHIVE_PATH}" ]] || fail "Ya existe ${ARCHIVE_PATH}."

printf 'Creando copia consistente: %s\n' "${ARCHIVE_PATH}"
"${COMPOSE[@]}" exec -T database sh -ec '
  pg_dump \
    --username="$POSTGRES_USER" \
    --dbname="$POSTGRES_DB" \
    --format=custom \
    --compress=6 \
    --no-owner \
    --no-privileges
' > "${TMP_ARCHIVE}"

[[ -s "${TMP_ARCHIVE}" ]] || fail "pg_dump generó un archivo vacío."

printf 'Validando el catálogo interno del archivo...\n'
"${COMPOSE[@]}" exec -T database pg_restore --list < "${TMP_ARCHIVE}" >/dev/null

mv -- "${TMP_ARCHIVE}" "${ARCHIVE_PATH}"
TMP_ARCHIVE=""

(
  cd -- "${BACKUP_DIR}"
  sha256sum -- "${ARCHIVE_NAME}" > "${ARCHIVE_NAME}.sha256"
)

ARCHIVE_SHA256="$(cut -d' ' -f1 -- "${CHECKSUM_PATH}")"
GIT_COMMIT="$(git -C "${ROOT_DIR}/.." rev-parse HEAD 2>/dev/null || printf 'unknown')"
POSTGRES_VERSION="$("${COMPOSE[@]}" exec -T database pg_dump --version | tr -d '\r')"
ARCHIVE_BYTES="$(wc -c < "${ARCHIVE_PATH}" | tr -d ' ')"

cat > "${METADATA_PATH}" <<EOF
archive=${ARCHIVE_NAME}
created_at_utc=${TIMESTAMP}
sha256=${ARCHIVE_SHA256}
bytes=${ARCHIVE_BYTES}
git_commit=${GIT_COMMIT}
postgres=${POSTGRES_VERSION}
format=postgresql-custom
verified_catalog=true
EOF

chmod 600 -- "${ARCHIVE_PATH}" "${CHECKSUM_PATH}" "${METADATA_PATH}"

printf '\nCopia creada y validada correctamente.\n'
printf 'Archivo: %s\n' "${ARCHIVE_PATH}"
printf 'SHA-256: %s\n' "${ARCHIVE_SHA256}"
printf 'Metadatos: %s\n' "${METADATA_PATH}"
printf 'Siguiente comprobación recomendada:\n  %q %q\n' \
  "${ROOT_DIR}/scripts/verify-database-backup.sh" "${ARCHIVE_PATH}"
