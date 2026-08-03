#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ATELIER_ENV_FILE:-${ROOT_DIR}/.env}"
COMPOSE_FILE="${ROOT_DIR}/infra/docker/docker-compose.yml"
ARCHIVE_PATH="${1:-}"
CONFIRMATION="${2:-}"
RESTORE_DATABASE=""
CURRENT_DATABASE=""
ROLLBACK_DATABASE=""
SWAP_COMPLETED=false

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

[[ -n "${ARCHIVE_PATH}" ]] || fail "Uso: ${0##*/} ARCHIVO.dump RESTORE_ACTIVE_DATABASE"
[[ -f "${ARCHIVE_PATH}" && -r "${ARCHIVE_PATH}" ]] || fail "No se puede leer ${ARCHIVE_PATH}."
[[ "${CONFIRMATION}" == "RESTORE_ACTIVE_DATABASE" ]] || fail "Falta la confirmación exacta RESTORE_ACTIVE_DATABASE."
[[ -f "${ENV_FILE}" ]] || fail "No existe ${ENV_FILE}."
command -v docker >/dev/null 2>&1 || fail "Docker no está disponible."
docker compose version >/dev/null 2>&1 || fail "docker compose no está disponible."

COMPOSE=(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM

  if [[ "${SWAP_COMPLETED}" != "true" && -n "${RESTORE_DATABASE}" ]]; then
    "${COMPOSE[@]}" exec -T database sh -ec '
      dropdb --if-exists --force --username="$POSTGRES_USER" "$1"
    ' sh "${RESTORE_DATABASE}" >/dev/null 2>&1 || true
  fi

  if [[ ${exit_code} -ne 0 ]]; then
    printf '\nLa restauración no se completó.\n' >&2
    if [[ -n "${ROLLBACK_DATABASE}" ]]; then
      printf 'Base anterior conservada como: %s\n' "${ROLLBACK_DATABASE}" >&2
    fi
    printf 'Revisa los logs antes de volver a iniciar la aplicación.\n' >&2
  fi
  exit "${exit_code}"
}
trap cleanup EXIT INT TERM

printf 'Verificando completamente la copia antes de continuar...\n'
bash "${ROOT_DIR}/scripts/verify-database-backup.sh" "${ARCHIVE_PATH}"

"${COMPOSE[@]}" up -d database >/dev/null
CURRENT_DATABASE="$("${COMPOSE[@]}" exec -T database sh -ec 'printf %s "$POSTGRES_DB"' | tr -d '\r\n')"
[[ "${CURRENT_DATABASE}" =~ ^[A-Za-z_][A-Za-z0-9_]{0,40}$ ]] \
  || fail "El nombre de la base activa no es válido para la restauración segura."

TIMESTAMP="$(date -u +%Y%m%d%H%M%S)"
RESTORE_DATABASE="atelier_restore_${TIMESTAMP}_${RANDOM}"
ROLLBACK_DATABASE="atelier_before_${TIMESTAMP}"

printf '\nATENCIÓN: se detendrán web y API.\n'
printf 'Base activa: %s\n' "${CURRENT_DATABASE}"
printf 'Base restaurada temporal: %s\n' "${RESTORE_DATABASE}"
printf 'Rollback que se conservará: %s\n' "${ROLLBACK_DATABASE}"

"${COMPOSE[@]}" stop web api >/dev/null 2>&1 || true

printf 'Creando base de restauración...\n'
"${COMPOSE[@]}" exec -T database sh -ec '
  createdb --username="$POSTGRES_USER" "$1"
' sh "${RESTORE_DATABASE}"

printf 'Restaurando archivo en la base aislada...\n'
"${COMPOSE[@]}" exec -T database sh -ec '
  pg_restore \
    --username="$POSTGRES_USER" \
    --dbname="$1" \
    --exit-on-error \
    --no-owner \
    --no-privileges
' sh "${RESTORE_DATABASE}" < "${ARCHIVE_PATH}"

printf 'Validando la base restaurada...\n'
RESTORE_CHECK="$("${COMPOSE[@]}" exec -T database sh -ec '
  psql --username="$POSTGRES_USER" --dbname="$1" --tuples-only --no-align --set=ON_ERROR_STOP=1 --command="
    SELECT
      (to_regclass('\''public.users'\'') IS NOT NULL)::int || '\'':'\'' ||
      (to_regclass('\''public.providers'\'') IS NOT NULL)::int || '\'':'\'' ||
      (to_regclass('\''public.schema_migrations'\'') IS NOT NULL)::int || '\'':'\'' ||
      COALESCE((SELECT count(*) FROM schema_migrations), 0);
  "
' sh "${RESTORE_DATABASE}" | tr -d '\r[:space:]')"

IFS=':' read -r HAS_USERS HAS_PROVIDERS HAS_MIGRATIONS MIGRATION_COUNT <<< "${RESTORE_CHECK}"
[[ "${HAS_USERS}:${HAS_PROVIDERS}:${HAS_MIGRATIONS}" == "1:1:1" ]] \
  || fail "La base restaurada no contiene la estructura mínima requerida."
[[ "${MIGRATION_COUNT}" =~ ^[0-9]+$ && "${MIGRATION_COUNT}" -gt 0 ]] \
  || fail "La base restaurada no contiene historial de migraciones."

printf 'Intercambiando bases de datos...\n'
"${COMPOSE[@]}" exec -T database sh -ec '
  current="$1"
  restored="$2"
  rollback="$3"

  case "$current:$restored:$rollback" in
    *[!A-Za-z0-9_:]*) exit 64 ;;
  esac

  psql --username="$POSTGRES_USER" --dbname=postgres --set=ON_ERROR_STOP=1 <<SQL
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname IN ('${current}', '${restored}')
  AND pid <> pg_backend_pid();
ALTER DATABASE "${current}" RENAME TO "${rollback}";
ALTER DATABASE "${restored}" RENAME TO "${current}";
SQL
' sh "${CURRENT_DATABASE}" "${RESTORE_DATABASE}" "${ROLLBACK_DATABASE}"

SWAP_COMPLETED=true
RESTORE_DATABASE=""

printf 'Verificando migraciones sobre la base restaurada...\n'
"${COMPOSE[@]}" run --rm migrate

printf 'Arrancando API y web...\n'
"${COMPOSE[@]}" up -d api web

printf '\nRESTAURACIÓN COMPLETADA\n'
printf 'Base activa restaurada: %s\n' "${CURRENT_DATABASE}"
printf 'Base anterior conservada para rollback: %s\n' "${ROLLBACK_DATABASE}"
printf 'Migraciones verificadas: %s\n' "${MIGRATION_COUNT}"
printf '\nNo borres %s hasta comprobar la aplicación y los datos.\n' "${ROLLBACK_DATABASE}"
