#!/usr/bin/env bash
set -Eeuo pipefail
cd "${LAVIA_BACKUP_PROJECT_DIR:-$(dirname "$0")/..}"
umask 077
mkdir -p .local
if [[ "${LAVIA_BACKUP_LOCK_HELD:-0}" != 1 ]]; then
 exec 9>.local/backup.lock
 flock -n 9 || { echo "Ya hay un respaldo en curso." >&2; exit 1; }
fi
backup_root="${1:-backups/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$backup_root"
# Quiesce all writers. Resume only the services that were running beforehand.
resume_services=()
while read -r service; do
 case "$service" in web|api|auth|storage|rest) resume_services+=("$service");; esac
done < <(docker compose ps --status running --services)
backup_complete=0
resume(){
 if [[ "$backup_complete" != 1 || "${LAVIA_BACKUP_KEEP_STOPPED:-0}" != 1 ]]; then
  if ((${#resume_services[@]})); then docker compose start "${resume_services[@]}" >/dev/null; fi
 fi
}
trap resume EXIT
if ((${#resume_services[@]})); then docker compose stop "${resume_services[@]}" >/dev/null; fi
docker compose exec -T db pg_dump -U supabase_admin -d postgres -Fc > "$backup_root/database.dump"
docker compose exec -T db pg_dumpall -U supabase_admin --roles-only > "$backup_root/roles.sql"
for item in storage-data pg-config; do
 volume_name=$(docker volume ls --filter "label=com.docker.compose.project=$(docker inspect "$(docker compose ps -aq db)" --format '{{ index .Config.Labels "com.docker.compose.project" }}')" --filter "label=com.docker.compose.volume=$item" --format '{{.Name}}')
 test -n "$volume_name"
 docker run --rm --network none --mount "type=volume,src=$volume_name,dst=/data,readonly" busybox:1.37.0 tar -czf - -C /data . > "$backup_root/$item.tar.gz"
done
cp .env "$backup_root/environment.env"
cp pnpm-lock.yaml "$backup_root/pnpm-lock.yaml"
(cd "$backup_root" && sha256sum database.dump roles.sql storage-data.tar.gz pg-config.tar.gz environment.env pnpm-lock.yaml > SHA256SUMS)
backup_complete=1
printf 'Respaldo consistente creado en %s. Contiene secretos: cópialo cifrado fuera del VPS.\n' "$backup_root"
