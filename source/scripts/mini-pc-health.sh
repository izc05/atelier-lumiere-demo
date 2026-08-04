#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ATELIER_ENV_FILE:-${ROOT_DIR}/.env}"
COMPOSE_FILE="${ROOT_DIR}/infra/docker/docker-compose.yml"
BACKUP_DIR="${ATELIER_BACKUP_DIR:-/opt/atelier-backups}"
MAX_AGE_HOURS="${PILOT_BACKUP_MAX_AGE_HOURS:-36}"
MIN_FREE_GB="${PILOT_MIN_FREE_GB:-10}"
FAILURES=0

ok() { printf '[OK] %s\n' "$*"; }
warn() { printf '[AVISO] %s\n' "$*"; }
error() { printf '[ERROR] %s\n' "$*" >&2; FAILURES=$((FAILURES+1)); }

[[ -f "${ENV_FILE}" ]] || { error "No existe ${ENV_FILE}."; exit 1; }
COMPOSE=(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")
for service in database api web; do
  container="$("${COMPOSE[@]}" ps -q "${service}" 2>/dev/null || true)"
  if [[ -z "${container}" ]]; then
    error "${service}: contenedor ausente"
    continue
  fi
  state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container}" 2>/dev/null || true)"
  case "${state}" in healthy|running) ok "${service}: ${state}" ;; *) error "${service}: ${state:-desconocido}" ;; esac
done

WEB_PORT="$(awk -F= '/^[[:space:]]*WEB_PORT[[:space:]]*=/{gsub(/[[:space:]\r\047\"]/ ,"",$2);print $2;exit}' "${ENV_FILE}")"
WEB_PORT="${WEB_PORT:-3000}"
API_PORT="$(awk -F= '/^[[:space:]]*API_PORT[[:space:]]*=/{gsub(/[[:space:]\r\047\"]/ ,"",$2);print $2;exit}' "${ENV_FILE}")"
API_PORT="${API_PORT:-4000}"
curl --fail --silent --max-time 10 "http://127.0.0.1:${WEB_PORT}/" >/dev/null \
  && ok "web responde en loopback" || error "web no responde en loopback"
curl --fail --silent --max-time 10 "http://127.0.0.1:${API_PORT}/health" >/dev/null \
  && ok "API responde en loopback" || error "API no responde en loopback"

FREE_KB="$(df -Pk "${ROOT_DIR}" | awk 'NR==2{print $4}')"
FREE_GB=$((FREE_KB / 1024 / 1024))
if (( FREE_GB < MIN_FREE_GB )); then error "Espacio libre ${FREE_GB} GB; mínimo ${MIN_FREE_GB} GB"; else ok "Espacio libre ${FREE_GB} GB"; fi

LATEST_MANIFEST="$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'atelier-pilot-*.manifest' -printf '%T@ %p\n' 2>/dev/null | sort -nr | awk 'NR==1{sub(/^[^ ]+ /,"");print;exit}')"
if [[ -z "${LATEST_MANIFEST}" ]]; then
  warn "Todavía no existe una copia completa del piloto."
else
  NOW="$(date +%s)"
  MODIFIED="$(stat -c %Y "${LATEST_MANIFEST}")"
  AGE_HOURS=$(((NOW - MODIFIED) / 3600))
  if (( AGE_HOURS > MAX_AGE_HOURS )); then error "Última copia completa hace ${AGE_HOURS} h"; else ok "Última copia completa hace ${AGE_HOURS} h"; fi
fi

if (( FAILURES > 0 )); then
  printf 'Estado final: BLOQUEADO (%s errores)\n' "${FAILURES}" >&2
  exit 1
fi
printf 'Estado final: SALUDABLE\n'
