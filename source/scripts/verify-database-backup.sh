#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ATELIER_ENV_FILE:-${ROOT_DIR}/.env}"
COMPOSE_FILE="${ROOT_DIR}/infra/docker/docker-compose.yml"
ARCHIVE_PATH="${1:-}"
VERIFY_DATABASE=""

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

[[ -n "${ARCHIVE_PATH}" ]] \
  || fail "Uso: ${0##*/} /ruta/a/atelier-AAAAmmddTHHMMSSZ.dump"
[[ -f "${ARCHIVE_PATH}" && -r "${ARCHIVE_PATH}" ]] \
  || fail "No se puede leer ${ARCHIVE_PATH}."
[[ -f "${ARCHIVE_PATH}.sha256" ]] \
  || fail "Falta ${ARCHIVE_PATH}.sha256."
[[ -f "${ENV_FILE}" ]] || fail "No existe ${ENV_FILE}."
command -v docker >/dev/null 2>&1 || fail "Docker no está disponible."
docker compose version >/dev/null 2>&1 || fail "docker compose no está disponible."

COMPOSE=(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")

cleanup() {
  local exit_code=$?
  if [[ -n "${VERIFY_DATABASE}" ]]; then
    "${COMPOSE[@]}" exec -T database sh -ec '
      dropdb --if-exists --force --username="$POSTGRES_USER" "$1"
    ' sh "${VERIFY_DATABASE}" >/dev/null 2>&1 || true
  fi
  exit "${exit_code}"
}
trap cleanup EXIT INT TERM

printf 'Comprobando SHA-256...\n'
(
  cd -- "$(dirname -- "${ARCHIVE_PATH}")"
  sha256sum --check --status -- "$(basename -- "${ARCHIVE_PATH}.sha256")"
) || fail "El SHA-256 no coincide. La copia está dañada o fue modificada."

printf 'Comprobando el catálogo PostgreSQL del archivo...\n'
"${COMPOSE[@]}" up -d database >/dev/null
"${COMPOSE[@]}" exec -T database pg_restore --list < "${ARCHIVE_PATH}" >/dev/null \
  || fail "pg_restore no puede leer el archivo."

VERIFY_DATABASE="atelier_verify_$(date -u +%Y%m%d%H%M%S)_${RANDOM}"
VERIFY_DATABASE="${VERIFY_DATABASE,,}"

printf 'Creando base temporal: %s\n' "${VERIFY_DATABASE}"
"${COMPOSE[@]}" exec -T database sh -ec '
  createdb --username="$POSTGRES_USER" "$1"
' sh "${VERIFY_DATABASE}"

printf 'Restaurando la copia en la base temporal...\n'
"${COMPOSE[@]}" exec -T database sh -ec '
  pg_restore \
    --username="$POSTGRES_USER" \
    --dbname="$1" \
    --exit-on-error \
    --no-owner \
    --no-privileges
' sh "${VERIFY_DATABASE}" < "${ARCHIVE_PATH}"

printf 'Comprobando estructura restaurada...\n'
STRUCTURE_RESULT="$("${COMPOSE[@]}" exec -T database sh -ec '
  psql --username="$POSTGRES_USER" --dbname="$1" --tuples-only --no-align --command="
    SELECT
      (to_regclass('\''public.users'\'') IS NOT NULL)::int || '\'':'\'' ||
      (to_regclass('\''public.providers'\'') IS NOT NULL)::int || '\'':'\'' ||
      (to_regclass('\''public.schema_migrations'\'') IS NOT NULL)::int || '\'':'\'' ||
      COALESCE((SELECT count(*) FROM schema_migrations), 0);
  "
' sh "${VERIFY_DATABASE}" | tr -d '\r[:space:]')"

IFS=':' read -r HAS_USERS HAS_PROVIDERS HAS_MIGRATIONS MIGRATION_COUNT <<< "${STRUCTURE_RESULT}"
[[ "${HAS_USERS}" == "1" ]] || fail "La restauración no contiene public.users."
[[ "${HAS_PROVIDERS}" == "1" ]] || fail "La restauración no contiene public.providers."
[[ "${HAS_MIGRATIONS}" == "1" ]] || fail "La restauración no contiene schema_migrations."
[[ "${MIGRATION_COUNT}" =~ ^[0-9]+$ && "${MIGRATION_COUNT}" -gt 0 ]] \
  || fail "El historial de migraciones restaurado está vacío."

printf 'Comprobando consistencia básica...\n'
"${COMPOSE[@]}" exec -T database sh -ec '
  psql --username="$POSTGRES_USER" --dbname="$1" --set=ON_ERROR_STOP=1 --command="
    SELECT count(*) AS users FROM users;
    SELECT count(*) AS providers FROM providers;
    SELECT count(*) AS migrations FROM schema_migrations;
  "
' sh "${VERIFY_DATABASE}" >/dev/null

printf 'Eliminando base temporal...\n'
"${COMPOSE[@]}" exec -T database sh -ec '
  dropdb --if-exists --force --username="$POSTGRES_USER" "$1"
' sh "${VERIFY_DATABASE}"
VERIFY_DATABASE=""

printf '\nCOPIA VERIFICADA CORRECTAMENTE\n'
printf 'Archivo: %s\n' "${ARCHIVE_PATH}"
printf 'Migraciones restauradas: %s\n' "${MIGRATION_COUNT}"
printf 'La base activa no ha sido modificada.\n'
