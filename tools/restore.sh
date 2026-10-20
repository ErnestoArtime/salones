#!/usr/bin/env bash
# For a NEW destination only. Never use on an existing installation with business data.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
backup_source=$(realpath "${1:?Usage: bash tools/restore.sh /path/to/backup}")
if [[ -e .env ]]; then echo 'Destino ya configurado. Usa un checkout nuevo para restaurar sin sobrescribir datos.' >&2; exit 1; fi
(cd "$backup_source" && sha256sum -c SHA256SUMS)
umask 077
cp "$backup_source/environment.env" .env
docker compose up -d --wait db
# Only the newly initialized target database is replaced.
docker compose exec -T db pg_restore -U supabase_admin -d postgres --clean --if-exists --exit-on-error < "$backup_source/database.dump"
docker compose stop db
for item in storage-data pg-config; do
 project_name=$(docker inspect "$(docker compose ps -aq db)" --format '{{ index .Config.Labels "com.docker.compose.project" }}')
 docker volume create --label "com.docker.compose.project=$project_name" --label "com.docker.compose.volume=$item" "${project_name}_${item}" >/dev/null
 volume_name=$(docker volume ls --filter "label=com.docker.compose.project=$(docker inspect "$(docker compose ps -aq db)" --format '{{ index .Config.Labels "com.docker.compose.project" }}')" --filter "label=com.docker.compose.volume=$item" --format '{{.Name}}')
 # Compose creates all declared volumes during up; fall back to create through the service if necessary.
 test -n "$volume_name"
 docker run --rm -i --network none --mount "type=volume,src=$volume_name,dst=/data" busybox:1.37.0 tar -xzf - -C /data < "$backup_source/$item.tar.gz"
done
docker compose up -d --wait db
echo 'Datos restaurados. Ajusta las URLs en .env, ejecuta bash tools/deploy.sh y cambia el DNS.'
