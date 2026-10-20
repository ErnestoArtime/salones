#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
backup_path=$(realpath "${1:?Usage: bash tools/verify-restore.sh backups/name}")
task_restore_dir=$(mktemp -d /tmp/lavia-restore-check.XXXXXX)
task_project="lavia-restore-check-$(date +%s)"
cp compose.yaml "$task_restore_dir/"
cp -r infra tools "$task_restore_dir/"
export COMPOSE_PROJECT_NAME="$task_project" DB_PORT=54340 AUTH_PORT=54341 HTTP_PORT=8140 MAIL_UI_PORT=8141
cleanup(){
 if [[ -f "$task_restore_dir/.env" ]]; then docker compose --project-directory "$task_restore_dir" -f "$task_restore_dir/compose.yaml" down -v >/dev/null 2>&1 || true; fi
 rm -rf "$task_restore_dir"
}
trap cleanup EXIT
bash "$task_restore_dir/tools/restore.sh" "$backup_path"
docker compose --project-directory "$task_restore_dir" -f "$task_restore_dir/compose.yaml" exec -T db psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres <<'SQL'
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM salon.tenants) THEN RAISE EXCEPTION 'No tenants restored'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users) THEN RAISE EXCEPTION 'No users restored'; END IF;
 IF (SELECT count(*) FROM public.lavia_migrations)<4 THEN RAISE EXCEPTION 'Missing migrations'; END IF;
END $$;
SET ROLE salon_api;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM salon.customers) THEN RAISE EXCEPTION 'RLS did not deny context-free access'; END IF;
END $$;
RESET ROLE;
SELECT 'Restore and runtime RLS verified' AS verification;
SQL
