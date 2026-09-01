#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_dir=$(dirname -- "$script_dir")
drill_db=appgog_restore_drill
backup_file="$project_dir/backups/drill-$(date -u +%Y%m%dT%H%M%SZ).dump"
cd "$project_dir"
sh deploy/backup.sh "$backup_file"
cleanup() { docker compose exec -T postgres dropdb --username=appgog --if-exists "$drill_db" >/dev/null 2>&1 || true; }
trap cleanup EXIT HUP INT TERM
cleanup
docker compose exec -T postgres createdb --username=appgog "$drill_db"
docker compose exec -T postgres pg_restore \
  --username=appgog --dbname="$drill_db" --exit-on-error \
  --no-owner --no-privileges < "$backup_file"
schema_ok=$(docker compose exec -T postgres psql --username=appgog --dbname="$drill_db" --tuples-only --no-align \
  --command='SELECT to_regclass('"'"'public."AdminUser"'"'"') IS NOT NULL AND to_regclass('"'"'public."Page"'"'"') IS NOT NULL;')
test "$schema_ok" = "t"
cleanup
trap - EXIT HUP INT TERM
printf '%s\n' "APPGOG 非破坏性备份恢复演练通过：$backup_file"
