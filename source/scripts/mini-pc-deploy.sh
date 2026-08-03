#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$(cd -- "${ROOT_DIR}/.." && pwd)"
ENV_FILE="${ATELIER_ENV_FILE:-${ROOT_DIR}/.env}"
COMPOSE_FILE="${ROOT_DIR}/infra/docker/docker-compose.yml"
BACKUP_DIR="${ATELIER_BACKUP_DIR:-/opt/atelier-backups}"
MODE="${1:-}"
DRY_RUN=false
STAGE="inicio"
BEFORE_SHA=""
AFTER_SHA=""
BACKUP_ARCHIVE=""
DEPLOYMENT_RECORD=""

usage() {
  cat <<'EOF'
Uso:
  scripts/mini-pc-deploy.sh install [--dry-run]
  scripts/mini-pc-deploy.sh update  [--dry-run]

install  Construye una instalación nueva y aplica las migraciones.
update   Crea y verifica una copia, actualiza main, migra y reinicia.

No crea automáticamente el PLATFORM_OWNER ni realiza restauraciones reales.
EOF
}

[[ "${MODE}" == "install" || "${MODE}" == "update" ]] || {
  usage >&2
  exit 2
}
shift || true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'ERROR: argumento no reconocido: %s\n' "$1" >&2; exit 2 ;;
  esac
done

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nERROR [%s]: %s\n' "${STAGE}" "$*" >&2; exit 1; }

run() {
  if [[ "${DRY_RUN}" == "true" ]]; then
    printf '  [DRY-RUN]'
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi
  "$@"
}

on_exit() {
  local exit_code=$?
  trap - EXIT INT TERM
  if [[ ${exit_code} -ne 0 ]]; then
    printf '\nDESPLIEGUE INTERRUMPIDO EN: %s\n' "${STAGE}" >&2
    [[ -n "${BEFORE_SHA}" ]] && printf 'Commit anterior: %s\n' "${BEFORE_SHA}" >&2
    [[ -n "${AFTER_SHA}" ]] && printf 'Commit descargado: %s\n' "${AFTER_SHA}" >&2
    [[ -n "${BACKUP_ARCHIVE}" ]] && printf 'Copia verificada: %s\n' "${BACKUP_ARCHIVE}" >&2
    printf 'No borres volúmenes ni la copia. Revisa:\n' >&2
    printf '  docker compose --env-file %q -f %q ps -a\n' "${ENV_FILE}" "${COMPOSE_FILE}" >&2
    printf '  docker compose --env-file %q -f %q logs --tail=200 migrate api web database\n' "${ENV_FILE}" "${COMPOSE_FILE}" >&2
  fi
  exit "${exit_code}"
}
trap on_exit EXIT INT TERM

COMPOSE=(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")

STAGE="preflight"
log "Comprobación previa"
run bash "${ROOT_DIR}/scripts/mini-pc-preflight.sh" --mode "${MODE}"

if [[ "${DRY_RUN}" == "true" ]]; then
  printf '\nEl modo simulación no modifica Git, Docker ni PostgreSQL.\n'
fi

if [[ "${MODE}" == "update" ]]; then
  STAGE="preparar copias"
  log "Preparación de la copia verificada"
  run mkdir -p -- "${BACKUP_DIR}"
  run chmod 700 -- "${BACKUP_DIR}"

  BEFORE_SHA="$(git -C "${REPO_DIR}" rev-parse HEAD)"

  if [[ "${DRY_RUN}" == "false" ]]; then
    run "${COMPOSE[@]}" up -d database
    run npm --prefix "${ROOT_DIR}" run backup:database -- "${BACKUP_DIR}"
    BACKUP_ARCHIVE="$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'atelier-*.dump' -printf '%T@ %p\n' \
      | sort -nr | awk 'NR==1 { sub(/^[^ ]+ /, ""); print; exit }')"
    [[ -n "${BACKUP_ARCHIVE}" && -s "${BACKUP_ARCHIVE}" ]] \
      || fail "No se localizó la copia recién creada."
    run npm --prefix "${ROOT_DIR}" run verify:backup -- "${BACKUP_ARCHIVE}"
  else
    run npm --prefix "${ROOT_DIR}" run backup:database -- "${BACKUP_DIR}"
    run npm --prefix "${ROOT_DIR}" run verify:backup -- "${BACKUP_DIR}/atelier-FECHA.dump"
  fi

  STAGE="actualizar repositorio"
  log "Actualización segura de main"
  run git -C "${REPO_DIR}" fetch --prune origin main
  run git -C "${REPO_DIR}" merge --ff-only origin/main
  if [[ "${DRY_RUN}" == "false" ]]; then
    AFTER_SHA="$(git -C "${REPO_DIR}" rev-parse HEAD)"
  fi
else
  BEFORE_SHA="$(git -C "${REPO_DIR}" rev-parse HEAD)"
  AFTER_SHA="${BEFORE_SHA}"
fi

STAGE="construir imágenes"
log "Construcción de imágenes Docker"
run "${COMPOSE[@]}" build --pull

STAGE="preparar base de datos"
log "Preparación de PostgreSQL"
run "${COMPOSE[@]}" up -d database

if [[ "${MODE}" == "install" ]]; then
  if [[ "${DRY_RUN}" == "true" ]]; then
    printf '  [DRY-RUN] comprobar que la base pública no contiene tablas\n'
  else
    EXISTING_TABLES="$("${COMPOSE[@]}" exec -T database sh -ec '
      psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --tuples-only --no-align --set=ON_ERROR_STOP=1 --command="
        SELECT count(*)
        FROM pg_catalog.pg_tables
        WHERE schemaname = '\''public'\'';
      "
    ' | tr -d '\r[:space:]')"
    [[ "${EXISTING_TABLES}" =~ ^[0-9]+$ ]] \
      || fail "No se pudo comprobar si la base está vacía."
    [[ "${EXISTING_TABLES}" == "0" ]] \
      || fail "La base ya contiene ${EXISTING_TABLES} tablas. Usa el modo update para crear una copia antes de migrar."
  fi
fi

STAGE="migrar base de datos"
log "Aplicación de migraciones"
run "${COMPOSE[@]}" run --rm migrate

STAGE="arrancar servicios"
log "Arranque de API y web"
run "${COMPOSE[@]}" up -d api web

wait_for_healthy() {
  local service="$1"
  local attempts="${2:-30}"
  local container status

  if [[ "${DRY_RUN}" == "true" ]]; then
    printf '  [DRY-RUN] comprobar salud de %s\n' "${service}"
    return 0
  fi

  container="$("${COMPOSE[@]}" ps -q "${service}")"
  [[ -n "${container}" ]] || fail "No existe el contenedor ${service}."

  for _ in $(seq 1 "${attempts}"); do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container}" 2>/dev/null || true)"
    case "${status}" in
      healthy|running) printf '  [OK] %s: %s\n' "${service}" "${status}"; return 0 ;;
      unhealthy|exited|dead) fail "${service} terminó con estado ${status}." ;;
    esac
    sleep 2
  done
  fail "${service} no alcanzó estado saludable."
}

STAGE="verificar servicios"
log "Verificación final"
wait_for_healthy database 30
wait_for_healthy api 40
wait_for_healthy web 40

if [[ "${DRY_RUN}" == "false" ]]; then
  API_PUBLIC_PORT="$(awk -F= '/^[[:space:]]*API_PORT[[:space:]]*=/ { gsub(/[[:space:]\r\047\"]/, "", $2); print $2; exit }' "${ENV_FILE}")"
  API_PUBLIC_PORT="${API_PUBLIC_PORT:-4000}"
  curl --fail --silent --show-error "http://127.0.0.1:${API_PUBLIC_PORT}/health" >/dev/null \
    || fail "La API no responde correctamente en el puerto ${API_PUBLIC_PORT}."

  WEB_PORT="$(awk -F= '/^[[:space:]]*WEB_PORT[[:space:]]*=/ { gsub(/[[:space:]\r\047\"]/, "", $2); print $2; exit }' "${ENV_FILE}")"
  WEB_PORT="${WEB_PORT:-3000}"
  curl --fail --silent --show-error "http://127.0.0.1:${WEB_PORT}/" >/dev/null \
    || fail "La web no responde correctamente en el puerto ${WEB_PORT}."
fi

STAGE="registrar despliegue"
if [[ "${DRY_RUN}" == "false" ]]; then
  run mkdir -p -- "${BACKUP_DIR}/deployments"
  run chmod 700 -- "${BACKUP_DIR}/deployments"
  DEPLOYMENT_RECORD="${BACKUP_DIR}/deployments/$(date -u +%Y%m%dT%H%M%SZ)-${MODE}.meta"
  cat > "${DEPLOYMENT_RECORD}" <<EOF
mode=${MODE}
completed_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
before_commit=${BEFORE_SHA}
after_commit=${AFTER_SHA:-${BEFORE_SHA}}
backup=${BACKUP_ARCHIVE:-none-new-installation}
status=healthy
EOF
  chmod 600 -- "${DEPLOYMENT_RECORD}"
fi

printf '\nDESPLIEGUE COMPLETADO CORRECTAMENTE\n'
printf 'Modo: %s\n' "${MODE}"
printf 'Commit: %s\n' "${AFTER_SHA:-${BEFORE_SHA}}"
[[ -n "${BACKUP_ARCHIVE}" ]] && printf 'Copia verificada: %s\n' "${BACKUP_ARCHIVE}"
[[ -n "${DEPLOYMENT_RECORD}" ]] && printf 'Registro: %s\n' "${DEPLOYMENT_RECORD}"

if [[ "${MODE}" == "install" ]]; then
  printf '\nSiguiente paso presencial:\n'
  printf '  docker compose --env-file %q -f %q exec -it api npm run bootstrap:platform-owner\n' \
    "${ENV_FILE}" "${COMPOSE_FILE}"
fi
