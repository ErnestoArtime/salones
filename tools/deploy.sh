#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
node tools/setup.mjs
docker compose config --quiet
docker compose build api web
docker compose up -d --wait --wait-timeout 180
