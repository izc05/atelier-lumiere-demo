#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_FILE="${ATELIER_ENV_FILE:-${ROOT_DIR}/.env}"
APP_URL="http://localhost:3000"
WEB_PORT="3000"
API_PORT="4000"
TMP_FILE=""

usage() {
  cat <<'EOF'
Uso: scripts/mini-pc-init-env.sh [opciones]

Opciones:
  --app-url URL     URL pública o local. Predeterminado: http://localhost:3000
  --web-port PORT   Puerto web local. Predeterminado: 3000
  --api-port PORT   Puerto API en loopback. Predeterminado: 4000
  --output RUTA     Ruta del archivo. Predeterminado: source/.env
  -h, --help        Mostrar ayuda

El comando nunca sobrescribe un archivo existente y no imprime los secretos.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-url)
      [[ $# -ge 2 ]] || { printf 'ERROR: --app-url necesita un valor.\n' >&2; exit 2; }
      APP_URL="$2"
      shift 2
      ;;
    --web-port)
      [[ $# -ge 2 ]] || { printf 'ERROR: --web-port necesita un valor.\n' >&2; exit 2; }
      WEB_PORT="$2"
      shift 2
      ;;
    --api-port)
      [[ $# -ge 2 ]] || { printf 'ERROR: --api-port necesita un valor.\n' >&2; exit 2; }
      API_PORT="$2"
      shift 2
      ;;
    --output)
      [[ $# -ge 2 ]] || { printf 'ERROR: --output necesita una ruta.\n' >&2; exit 2; }
      OUTPUT_FILE="$2"
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

command -v openssl >/dev/null 2>&1 || {
  printf 'ERROR: OpenSSL no está instalado.\n' >&2
  exit 1
}

[[ "${APP_URL}" =~ ^https?://[A-Za-z0-9._~-]+(:[0-9]{1,5})?/?$ ]] || {
  printf 'ERROR: --app-url debe ser una URL HTTP/HTTPS sin ruta, usuario ni contraseña.\n' >&2
  exit 2
}

for port_name in WEB_PORT API_PORT; do
  port_value="${!port_name}"
  [[ "${port_value}" =~ ^[0-9]+$ && "${port_value}" -ge 1 && "${port_value}" -le 65535 ]] || {
    printf 'ERROR: %s debe ser un puerto entre 1 y 65535.\n' "${port_name}" >&2
    exit 2
  }
done

[[ "${WEB_PORT}" != "${API_PORT}" ]] || {
  printf 'ERROR: WEB_PORT y API_PORT no pueden ser iguales.\n' >&2
  exit 2
}

[[ ! -e "${OUTPUT_FILE}" ]] || {
  printf 'ERROR: %s ya existe. No se sobrescribirá.\n' "${OUTPUT_FILE}" >&2
  exit 1
}

OUTPUT_DIR="$(dirname -- "${OUTPUT_FILE}")"
mkdir -p -- "${OUTPUT_DIR}"
TMP_FILE="$(mktemp "${OUTPUT_DIR}/.atelier-env.XXXXXX")"

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  [[ -n "${TMP_FILE}" && -f "${TMP_FILE}" ]] && rm -f -- "${TMP_FILE}"
  exit "${exit_code}"
}
trap cleanup EXIT INT TERM

random_hex() {
  openssl rand -hex 32
}

POSTGRES_PASSWORD="$(random_hex)"
AUTH_SECRET="$(random_hex)"
AUTH_LOGIN_PEPPER="$(random_hex)"
TWO_FACTOR_ENCRYPTION_KEY_BASE64="$(openssl rand -base64 32 | tr -d '\r\n')"
TWO_FACTOR_RECOVERY_PEPPER="$(random_hex)"
PAYMENT_SANDBOX_SESSION_SECRET="$(random_hex)"
PAYMENT_SANDBOX_WEBHOOK_SECRET="$(random_hex)"
COOKIE_SECURE="false"
[[ "${APP_URL}" == https://* ]] && COOKIE_SECURE="true"

cat > "${TMP_FILE}" <<EOF
# Generado por scripts/mini-pc-init-env.sh
# No subir a GitHub ni compartir su contenido.
NODE_ENV=production
APP_URL=${APP_URL%/}
AUTH_TRUSTED_ORIGINS=${APP_URL%/}
WEB_HOST=0.0.0.0
WEB_BIND_ADDRESS=0.0.0.0
WEB_PORT=${WEB_PORT}
API_HOST=0.0.0.0
API_PORT=${API_PORT}
API_INTERNAL_URL=http://api:4000

POSTGRES_USER=atelier
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=atelier_lumiere
DATABASE_POOL_MAX=10
DATABASE_STATEMENT_TIMEOUT_MS=5000
MIGRATION_STATEMENT_TIMEOUT_MS=120000
MIGRATION_LOCK_TIMEOUT_MS=10000

AUTH_SECRET=${AUTH_SECRET}
AUTH_LOGIN_PEPPER=${AUTH_LOGIN_PEPPER}
AUTH_SERVICE_USER_ID=00000000-0000-4000-8000-000000000008
PROVIDER_LOGIN_CHALLENGE_TTL_MINUTES=10
PROVIDER_SESSION_TTL_HOURS=12
ADMIN_LOGIN_CHALLENGE_TTL_MINUTES=10
ADMIN_SESSION_TTL_HOURS=8

ENABLE_ADMIN_UI=false
WEB_COOKIE_SECURE=${COOKIE_SECURE}
PROVIDER_COOKIE_SECURE=${COOKIE_SECURE}
ALLOW_DEV_ADMIN_AUTH=false
DEV_ADMIN_TOKEN=
DEV_ADMIN_USER_ID=00000000-0000-4000-8000-000000000001
DEV_ADMIN_EMAIL=admin@atelier.localhost
DEV_ADMIN_DISPLAY_NAME=Administración Atelier Lumière

PASSWORD_RESET_TTL_MINUTES=30
TWO_FACTOR_RESET_TTL_MINUTES=30
ACCOUNT_RECOVERY_COOLDOWN_SECONDS=300
LEGAL_SERVICE_USER_ID=00000000-0000-4000-8000-000000000007

PILOT_MODE_ENABLED=false
PILOT_CHECKOUT_ENABLED=false
PILOT_CHECKOUT_SERVICE_USER_ID=00000000-0000-4000-8000-000000000011
PILOT_SHIPPING_CENTS=0

PAYMENT_SANDBOX_ENABLED=false
PAYMENT_SERVICE_USER_ID=00000000-0000-4000-8000-000000000009
PAYMENT_SANDBOX_TTL_MINUTES=30
PAYMENT_SANDBOX_SESSION_SECRET=${PAYMENT_SANDBOX_SESSION_SECRET}
PAYMENT_SANDBOX_WEBHOOK_SECRET=${PAYMENT_SANDBOX_WEBHOOK_SECRET}

SMTP_ENABLED=false
SMTP_VERIFY_ON_START=false
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
SMTP_REPLY_TO=
SMTP_CONNECTION_TIMEOUT_MS=10000
SMTP_GREETING_TIMEOUT_MS=10000
SMTP_SOCKET_TIMEOUT_MS=30000
ORDER_EMAIL_NOTIFICATIONS_ENABLED=false
NOTIFICATION_SERVICE_USER_ID=00000000-0000-4000-8000-000000000010
ORDER_EMAIL_INTERVAL_MS=30000
ORDER_EMAIL_BATCH_SIZE=10
ORDER_EMAIL_MAX_ATTEMPTS=5

TWO_FACTOR_SETUP_TTL_MINUTES=15
TWO_FACTOR_ENCRYPTION_KEY_BASE64=${TWO_FACTOR_ENCRYPTION_KEY_BASE64}
TWO_FACTOR_RECOVERY_PEPPER=${TWO_FACTOR_RECOVERY_PEPPER}

STORAGE_DRIVER=local
STORAGE_PATH=/data/media
MEDIA_UPLOAD_TTL_MINUTES=15
MAX_IMAGE_MB=12
MAX_VIDEO_MB=50
MAX_IMAGES_PER_PRODUCT=8
REQUIRE_PROVIDER_2FA=true
INVITATION_TTL_HOURS=48
DOCKER_LOG_MAX_SIZE=10m
DOCKER_LOG_MAX_FILES=5
PILOT_BACKUP_MAX_AGE_HOURS=36
PILOT_BACKUP_RETENTION_DAYS=14
PILOT_BACKUP_MIRROR_DIR=
PILOT_MIN_FREE_GB=10
EMAIL_VERIFICATION_TTL_HOURS=24
EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS=60
EOF

chmod 600 -- "${TMP_FILE}"
mv -- "${TMP_FILE}" "${OUTPUT_FILE}"
TMP_FILE=""

printf '\nConfiguración privada creada correctamente.\n'
printf 'Archivo: %s\n' "${OUTPUT_FILE}"
printf 'URL: %s\n' "${APP_URL%/}"
printf 'Cookies Secure: %s\n' "${COOKIE_SECURE}"
printf 'Los secretos no se han mostrado.\n'
printf '\nSiguiente paso:\n'
printf '  npm run preflight:mini-pc -- --mode install\n'
