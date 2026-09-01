#!/bin/sh
set -eu

if [ "$#" -ne 1 ] || [ "${APPGOG_RESTORE_CONFIRM:-}" != "APPGOG_RESTORE" ]; then
  printf '%s\n' '用法：APPGOG_RESTORE_CONFIRM=APPGOG_RESTORE sh deploy/restore.sh <备份.dump>' >&2
  exit 64
fi
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_dir=$(dirname -- "$script_dir")
case "$1" in /*) source_file=$1 ;; *) source_file="$project_dir/$1" ;; esac
test -f "$source_file" && test -s "$source_file"
if [ -f "$source_file.sha256" ]; then
  (cd "$(dirname -- "$source_file")" && sha256sum -c "$(basename -- "$source_file.sha256")")
fi

cd "$project_dir"
pre_restore="$project_dir/backups/pre-restore-$(date -u +%Y%m%dT%H%M%SZ).dump"
sh deploy/backup.sh "$pre_restore"
docker compose stop api
restart_api() { docker compose start api >/dev/null 2>&1 || true; }
trap restart_api EXIT HUP INT TERM
docker compose exec -T postgres pg_restore \
  --username=appgog --dbname=appgog --clean --if-exists \
  --exit-on-error --no-owner --no-privileges < "$source_file"
docker compose run --rm init
docker compose start api
trap - EXIT HUP INT TERM
docker compose exec -T api wget --no-verbose --tries=10 --spider http://127.0.0.1:3000/api/v1/health/ready
printf '%s\n' "APPGOG 数据库恢复完成；恢复前快照：$pre_restore"
