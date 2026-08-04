#!/usr/bin/env bash
set -Eeuo pipefail
ARCHIVE_PATH="${1:-}"
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ -n "${ARCHIVE_PATH}" && -f "${ARCHIVE_PATH}" ]] || fail "Uso: ${0##*/} ARCHIVO.tar.gz"
CHECKSUM_PATH="${ARCHIVE_PATH}.sha256"
[[ -f "${CHECKSUM_PATH}" ]] || fail "Falta ${CHECKSUM_PATH}."
(
  cd -- "$(dirname -- "${ARCHIVE_PATH}")"
  sha256sum --check -- "$(basename -- "${CHECKSUM_PATH}")" >/dev/null
)
while IFS= read -r entry; do
  [[ "${entry}" != /* ]] || fail "La copia contiene una ruta absoluta."
  case "/${entry}/" in */../*) fail "La copia contiene una ruta no segura." ;; esac
done < <(tar -tzf "${ARCHIVE_PATH}")
tar -tzf "${ARCHIVE_PATH}" >/dev/null
printf 'Copia multimedia verificada: %s\n' "${ARCHIVE_PATH}"
