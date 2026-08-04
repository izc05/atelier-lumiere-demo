#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ATELIER_ENV_FILE:-${ROOT_DIR}/.env}"
COMPOSE_FILE="${ROOT_DIR}/infra/docker/docker-compose.yml"
TMP_ENV=""

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
cleanup() { [[ -n "${TMP_ENV}" && -f "${TMP_ENV}" ]] && rm -f -- "${TMP_ENV}"; }
trap cleanup EXIT INT TERM

[[ -f "${ENV_FILE}" ]] || fail "No existe ${ENV_FILE}."
command -v docker >/dev/null 2>&1 || fail "Docker no está disponible."
docker compose version >/dev/null 2>&1 || fail "docker compose no está disponible."

read -r -p "Servidor SMTP: " ATELIER_SMTP_HOST
read -r -p "Puerto SMTP [587]: " ATELIER_SMTP_PORT
ATELIER_SMTP_PORT="${ATELIER_SMTP_PORT:-587}"
read -r -p "Conexión SSL directa (true para puerto 465) [false]: " ATELIER_SMTP_SECURE
ATELIER_SMTP_SECURE="${ATELIER_SMTP_SECURE:-false}"
read -r -p "Exigir STARTTLS [true]: " ATELIER_SMTP_REQUIRE_TLS
ATELIER_SMTP_REQUIRE_TLS="${ATELIER_SMTP_REQUIRE_TLS:-true}"
read -r -p "Usuario SMTP (vacío si no usa autenticación): " ATELIER_SMTP_USER
read -r -s -p "Contraseña SMTP: " ATELIER_SMTP_PASSWORD
printf '\n'
read -r -p "Remitente, por ejemplo Atelier Lumière <correo@dominio.es>: " ATELIER_SMTP_FROM
read -r -p "Dirección de respuesta [vacía]: " ATELIER_SMTP_REPLY_TO
read -r -p "Correo donde recibir la prueba: " SMTP_TEST_TO

[[ -n "${ATELIER_SMTP_HOST}" && -n "${ATELIER_SMTP_FROM}" && -n "${SMTP_TEST_TO}" ]] \
  || fail "Servidor, remitente y destinatario de prueba son obligatorios."

TMP_ENV="$(mktemp "${ROOT_DIR}/.smtp-test.XXXXXX")"
cp -- "${ENV_FILE}" "${TMP_ENV}"
chmod 600 -- "${TMP_ENV}"
export ATELIER_SMTP_HOST ATELIER_SMTP_PORT ATELIER_SMTP_SECURE ATELIER_SMTP_REQUIRE_TLS
export ATELIER_SMTP_USER ATELIER_SMTP_PASSWORD ATELIER_SMTP_FROM ATELIER_SMTP_REPLY_TO
node "${ROOT_DIR}/scripts/write-smtp-env.mjs" "${TMP_ENV}"

printf 'Verificando conexión y enviando un mensaje de diagnóstico...\n'
SMTP_TEST_TO="${SMTP_TEST_TO}" docker compose --env-file "${TMP_ENV}" -f "${COMPOSE_FILE}" \
  run --rm --no-deps -e SMTP_TEST_TO api node src/smtp-diagnostic.mjs

cp -- "${ENV_FILE}" "${ENV_FILE}.before-smtp"
chmod 600 -- "${ENV_FILE}.before-smtp"
mv -- "${TMP_ENV}" "${ENV_FILE}"
TMP_ENV=""
chmod 600 -- "${ENV_FILE}"

printf '\nSMTP verificado y guardado.\n'
printf 'Copia anterior: %s.before-smtp\n' "${ENV_FILE}"
printf 'Los avisos de pedidos siguen desactivados hasta confirmar que el mensaje llegó correctamente.\n'
printf 'Después de comprobar la bandeja, cambia ORDER_EMAIL_NOTIFICATIONS_ENABLED=true y recrea API.\n'
