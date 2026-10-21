#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
if [[ -f .local/auto-deploy.enabled ]]; then
 exec /usr/local/bin/lavia-deploy check --retry
fi
mkdir -p .local
exec 9>.local/deploy.lock
flock -n 9 || { echo "Ya hay un despliegue en curso." >&2; exit 1; }
node tools/setup.mjs
docker compose config --quiet
docker compose build api web
docker compose up -d --wait --wait-timeout 180
