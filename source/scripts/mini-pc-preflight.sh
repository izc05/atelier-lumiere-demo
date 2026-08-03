#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ATELIER_ENV_FILE:-${ROOT_DIR}/.env}"
COMPOSE_FILE="${ROOT_DIR}/infra/docker/docker-compose.yml"
MODE="check"
ERRORS=0
WARNINGS=0

usage() {
  cat <<'EOF'
Uso: scripts/mini-pc-preflight.sh [--mode check|install|update]

Comprueba el mini PC, el repositorio, Docker y el archivo .env sin modificar datos.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      [[ $# -ge 2 ]] || { printf 'ERROR: --mode necesita un valor.\n' >&2; exit 2; }
      MODE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'ERROR: argumento no reconocido: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "${MODE}" in
  check|install|update) ;;
  *) printf 'ERROR: modo no válido: %s\n' "${MODE}" >&2; exit 2 ;;
esac

ok() { printf '  [OK] %s\n' "$*"; }
warn() { printf '  [AVISO] %s\n' "$*"; WARNINGS=$((WARNINGS + 1)); }
error() { printf '  [ERROR] %s\n' "$*"; ERRORS=$((ERRORS + 1)); }

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

env_value() {
  local key="$1"
  awk -v key="${key}" '
    BEGIN { FS="=" }
    /^[[:space:]]*#/ { next }
    {
      line=$0
      sub(/\r$/, "", line)
      if (line ~ "^[[:space:]]*" key "[[:space:]]*=") {
        sub("^[[:space:]]*" key "[[:space:]]*=", "", line)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
        if ((line ~ /^".*"$/) || (line ~ /^\047.*\047$/)) {
          line=substr(line, 2, length(line)-2)
        }
        print line
        exit
      }
    }
  ' "${ENV_FILE}" 2>/dev/null || true
}

check_secret() {
  local key="$1"
  local minimum="$2"
  local value
  value="$(env_value "${key}")"
  if [[ -z "${value}" ]]; then
    error "${key} no está configurado."
  elif [[ ${#value} -lt ${minimum} ]]; then
    error "${key} debe tener al menos ${minimum} caracteres."
  elif [[ "${value}" == *GENERAR_* || "${value}" == *CAMBIAR_* || "${value}" == *example* ]]; then
    error "${key} conserva un valor de ejemplo."
  else
    ok "${key} tiene una longitud válida."
  fi
}

printf '\nAtelier Lumière · Comprobación del mini PC (%s)\n\n' "${MODE}"

printf 'Sistema\n'
if [[ "$(uname -s)" == "Linux" ]]; then
  ok "Sistema Linux detectado."
else
  error "El despliegue está preparado para Linux; se detectó $(uname -s)."
fi

ARCH="$(uname -m)"
case "${ARCH}" in
  x86_64|amd64|aarch64|arm64) ok "Arquitectura compatible: ${ARCH}." ;;
  *) warn "Arquitectura no validada en CI: ${ARCH}." ;;
esac

for required_command in git docker openssl curl awk stat df; do
  if command_exists "${required_command}"; then
    ok "Comando disponible: ${required_command}."
  else
    error "Falta el comando: ${required_command}."
  fi
done

if command_exists docker; then
  if docker info >/dev/null 2>&1; then
    ok "El servicio Docker responde para el usuario actual."
  else
    error "Docker no responde. Revisa el servicio y los permisos del usuario."
  fi

  if docker compose version >/dev/null 2>&1; then
    ok "Docker Compose está disponible."
  else
    error "Falta el complemento docker compose."
  fi
fi

if [[ -r /proc/meminfo ]]; then
  MEMORY_KB="$(awk '/MemTotal:/ { print $2; exit }' /proc/meminfo)"
  if [[ "${MEMORY_KB:-0}" -ge 2000000 ]]; then
    ok "Memoria disponible: $((MEMORY_KB / 1024)) MiB."
  else
    warn "Memoria inferior a 2 GiB: $((MEMORY_KB / 1024)) MiB."
  fi
fi

AVAILABLE_KB="$(df -Pk "${ROOT_DIR}" | awk 'NR==2 { print $4 }')"
if [[ "${AVAILABLE_KB:-0}" -ge 5242880 ]]; then
  ok "Espacio libre: $((AVAILABLE_KB / 1024 / 1024)) GiB."
else
  warn "Hay menos de 5 GiB libres en el disco del proyecto."
fi

printf '\nRepositorio\n'
if git -C "${ROOT_DIR}/.." rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  ok "Repositorio Git detectado."
  CURRENT_BRANCH="$(git -C "${ROOT_DIR}/.." branch --show-current)"
  if [[ "${MODE}" == "install" || "${MODE}" == "update" ]]; then
    if [[ "${CURRENT_BRANCH}" == "main" ]]; then
      ok "Rama main activa."
    else
      error "Para desplegar debe estar activa la rama main; ahora: ${CURRENT_BRANCH:-detached}."
    fi
  else
    ok "Rama actual: ${CURRENT_BRANCH:-detached}."
  fi

  if [[ -z "$(git -C "${ROOT_DIR}/.." status --porcelain --untracked-files=normal)" ]]; then
    ok "El repositorio no tiene cambios locales."
  else
    error "Hay cambios locales sin guardar; no se debe desplegar así."
  fi
else
  error "No se detecta un repositorio Git válido."
fi

printf '\nConfiguración privada\n'
if [[ -f "${ENV_FILE}" ]]; then
  ok "Archivo .env encontrado."
  ENV_MODE="$(stat -c '%a' "${ENV_FILE}" 2>/dev/null || printf 'unknown')"
  case "${ENV_MODE}" in
    600|400) ok "Permisos privados de .env: ${ENV_MODE}." ;;
    *) error ".env debe tener permisos 600 o 400; ahora: ${ENV_MODE}." ;;
  esac
else
  error "Falta ${ENV_FILE}. Copia .env.example y configura los secretos."
fi

if [[ -f "${ENV_FILE}" ]]; then
  NODE_ENV_VALUE="$(env_value NODE_ENV)"
  [[ "${NODE_ENV_VALUE}" == "production" ]] \
    && ok "NODE_ENV=production." \
    || error "NODE_ENV debe ser production para el mini PC."

  ALLOW_DEV_VALUE="$(env_value ALLOW_DEV_ADMIN_AUTH)"
  [[ "${ALLOW_DEV_VALUE}" == "false" ]] \
    && ok "Acceso administrativo temporal desactivado." \
    || error "ALLOW_DEV_ADMIN_AUTH debe ser false."

  check_secret POSTGRES_PASSWORD 16
  check_secret AUTH_LOGIN_PEPPER 32
  check_secret TWO_FACTOR_RECOVERY_PEPPER 32

  TOTP_KEY="$(env_value TWO_FACTOR_ENCRYPTION_KEY_BASE64)"
  if [[ -z "${TOTP_KEY}" || "${TOTP_KEY}" == *GENERAR_* ]]; then
    error "TWO_FACTOR_ENCRYPTION_KEY_BASE64 no está configurada."
  else
    DECODED_BYTES="$(printf '%s' "${TOTP_KEY}" | openssl base64 -d -A 2>/dev/null | wc -c | tr -d ' ')"
    [[ "${DECODED_BYTES}" == "32" ]] \
      && ok "Clave TOTP Base64 válida: 32 bytes." \
      || error "TWO_FACTOR_ENCRYPTION_KEY_BASE64 debe decodificar exactamente 32 bytes."
  fi

  if grep -Eq '(^|=)(GENERAR_|CAMBIAR_|atelier_dev_change_me)' "${ENV_FILE}"; then
    error ".env todavía contiene marcadores de ejemplo."
  else
    ok "No se detectan marcadores de ejemplo en .env."
  fi

  if docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" config --quiet >/dev/null 2>&1; then
    ok "Docker Compose acepta la configuración."
  else
    error "Docker Compose no puede interpretar .env o docker-compose.yml."
  fi
fi

printf '\nRed y operación\n'
WEB_PORT_VALUE="$(env_value WEB_PORT)"
WEB_PORT_VALUE="${WEB_PORT_VALUE:-3000}"
API_PORT_VALUE="$(env_value API_PORT)"
API_PORT_VALUE="${API_PORT_VALUE:-4000}"

if [[ "${MODE}" == "install" ]] && command_exists ss; then
  if ss -ltnH | awk '{print $4}' | grep -Eq "[:.]${WEB_PORT_VALUE}$"; then
    warn "El puerto web ${WEB_PORT_VALUE} ya está ocupado; comprueba si es una instalación existente."
  else
    ok "Puerto web ${WEB_PORT_VALUE} disponible."
  fi
fi

if [[ "${API_PORT_VALUE}" == "4000" ]]; then
  ok "La API mantiene el puerto interno esperado 4000."
else
  warn "API_PORT=${API_PORT_VALUE}; revisa cualquier proxy local existente."
fi

if [[ -d /opt/atelier-backups ]]; then
  BACKUP_MODE="$(stat -c '%a' /opt/atelier-backups 2>/dev/null || printf 'unknown')"
  [[ -w /opt/atelier-backups ]] \
    && ok "Carpeta de copias disponible: /opt/atelier-backups (${BACKUP_MODE})." \
    || warn "/opt/atelier-backups existe pero el usuario no puede escribir."
else
  warn "Aún no existe /opt/atelier-backups. El instalador puede crearla con permisos privados."
fi

printf '\nResultado\n'
printf '  Errores: %s\n' "${ERRORS}"
printf '  Avisos: %s\n' "${WARNINGS}"

if [[ ${ERRORS} -gt 0 ]]; then
  printf '\nPRECHECK FALLIDO. No se debe instalar ni actualizar todavía.\n' >&2
  exit 1
fi

printf '\nPRECHECK CORRECTO. El mini PC está preparado para el siguiente paso.\n'
