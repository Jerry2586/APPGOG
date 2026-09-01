#!/bin/sh
set -eu
umask 077

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_dir=$(dirname -- "$script_dir")
stamp=$(date -u +%Y%m%dT%H%M%SZ)
target=${1:-"$project_dir/backups/appgog-$stamp.dump"}
case "$target" in /*) ;; *) target="$project_dir/$target" ;; esac
target_dir=$(dirname -- "$target")
mkdir -p -- "$target_dir"
partial="$target.partial"
trap 'rm -f -- "$partial"' EXIT HUP INT TERM

cd "$project_dir"
docker compose exec -T postgres pg_dump \
  --username=appgog --dbname=appgog --format=custom \
  --no-owner --no-privileges > "$partial"
test -s "$partial"
mv -- "$partial" "$target"
sha256sum "$target" > "$target.sha256"
trap - EXIT HUP INT TERM
printf '%s\n' "APPGOG 数据库备份完成：$target"
