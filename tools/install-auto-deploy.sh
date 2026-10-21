#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
# This installer adopts only this existing deployment; no database initialization.
[[ "$(id -un)" == ernesto ]] || { echo "Ejecuta como ernesto." >&2; exit 1; }
[[ "$(pwd -P)" == /home/ernesto/proyectos/beauty-saas ]] || { echo "Instala desde el checkout de producción esperado." >&2; exit 1; }
sudo -n true
sudo -n install -d -m 755 /usr/local/lib/lavia-deploy
sudo -n install -m 644 infra/auto-deploy/deploy.py /usr/local/lib/lavia-deploy/deploy.py
sudo -n install -m 644 tools/backup.sh /usr/local/lib/lavia-deploy/backup.sh
wrapper=$(mktemp)
trap 'rm -f "$wrapper"' EXIT
cat > "$wrapper" <<'WRAPPER'
#!/bin/sh
exec /usr/bin/python3 /usr/local/lib/lavia-deploy/deploy.py --state /home/ernesto/.local/share/lavia-deploy "$@"
WRAPPER
sudo -n install -m 755 "$wrapper" /usr/local/bin/lavia-deploy
if [[ ! -f /home/ernesto/.local/share/lavia-deploy/config.json ]]; then
 /usr/local/bin/lavia-deploy init --workspace "$(pwd -P)"
fi
sudo -n install -m 644 infra/auto-deploy/lavia-deploy.service /etc/systemd/system/lavia-deploy.service
sudo -n install -m 644 infra/auto-deploy/lavia-deploy.timer /etc/systemd/system/lavia-deploy.timer
sudo -n systemctl daemon-reload
sudo -n systemctl enable --now lavia-deploy.timer
printf 'Supervisor instalado. Estado: lavia-deploy status\n'
