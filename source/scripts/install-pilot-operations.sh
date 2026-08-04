#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_USER="${SUDO_USER:-${USER}}"
BACKUP_DIR="${ATELIER_BACKUP_DIR:-/opt/atelier-backups}"
[[ "${EUID}" -eq 0 ]] || { printf 'Ejecuta con sudo: sudo npm run install:pilot-operations\n' >&2; exit 1; }
install -d -m 700 -o "${RUN_USER}" -g "${RUN_USER}" "${BACKUP_DIR}"
cat > /etc/systemd/system/atelier-pilot-backup.service <<UNIT
[Unit]
Description=Copia completa verificada de Atelier Lumière
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
User=${RUN_USER}
WorkingDirectory=${ROOT_DIR}
Environment=ATELIER_BACKUP_DIR=${BACKUP_DIR}
ExecStart=/usr/bin/npm run backup:pilot -- ${BACKUP_DIR}
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=7
UNIT
cat > /etc/systemd/system/atelier-pilot-backup.timer <<'UNIT'
[Unit]
Description=Copia diaria de Atelier Lumière

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true
RandomizedDelaySec=10m
Unit=atelier-pilot-backup.service

[Install]
WantedBy=timers.target
UNIT
cat > /etc/systemd/system/atelier-pilot-health.service <<UNIT
[Unit]
Description=Comprobación de salud de Atelier Lumière
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
User=${RUN_USER}
WorkingDirectory=${ROOT_DIR}
Environment=ATELIER_BACKUP_DIR=${BACKUP_DIR}
ExecStart=/usr/bin/npm run health:mini-pc
UNIT
cat > /etc/systemd/system/atelier-pilot-health.timer <<'UNIT'
[Unit]
Description=Comprobación periódica de Atelier Lumière

[Timer]
OnBootSec=5m
OnUnitActiveSec=15m
Persistent=true
Unit=atelier-pilot-health.service

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now atelier-pilot-backup.timer atelier-pilot-health.timer
printf 'Temporizadores instalados.\n'
systemctl list-timers 'atelier-pilot-*' --no-pager
