#!/bin/sh
set -eu
umask 077

project_directory=${APPGOG_DIR:-/opt/APPGOG}
log() { printf '%s\n' "[APPGOG] $*"; }
fail() { printf '%s\n' "[APPGOG] 错误：$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail '请使用 root 或 sudo 运行。'
[ -d "$project_directory" ] || fail "项目目录不存在：$project_directory"
[ -f "$project_directory/.env" ] || fail '缺少安装器生成的 .env。'
[ -f "$project_directory/.appgog-install-state.json" ] || fail 'APPGOG 尚未完成本机安装。'
grep -qx 'APPGOG_INSTALL_MANAGED=true' "$project_directory/.env" || fail '拒绝修改非一键脚本管理的 .env。'
[ "$(stat -c '%u:%a' "$project_directory/.env")" = '0:600' ] || fail '.env 必须由 root 拥有且权限为 0600。'

site_origin=$(sed -n 's/^APP_ORIGIN=//p' "$project_directory/.env" | tail -n 1)
case "$site_origin" in https://*) ;; *) fail 'APP_ORIGIN 必须是正式 HTTPS 地址。' ;; esac
domain=${site_origin#https://}
case "$domain" in ''|*/*|*:*|*'?'*|*'#'*|*'@'*|*[!A-Za-z0-9.-]*) fail '自动 HTTPS 仅支持不带端口和路径的正式域名。' ;; esac

existing_domain=$(sed -n 's/^APPGOG_DOMAIN=//p' "$project_directory/.env" | tail -n 1)
if [ -n "$existing_domain" ]; then
  [ "$existing_domain" = "$domain" ] || fail '已有 APPGOG_DOMAIN 与 APP_ORIGIN 不一致。'
else
  environment_tmp=$(mktemp "$project_directory/.env.gateway.XXXXXX")
  trap 'rm -f "$environment_tmp"' EXIT HUP INT TERM
  cp "$project_directory/.env" "$environment_tmp"
  printf 'APPGOG_DOMAIN=%s\n' "$domain" >> "$environment_tmp"
  chmod 600 "$environment_tmp"
  mv "$environment_tmp" "$project_directory/.env"
  trap - EXIT HUP INT TERM
fi

cd "$project_directory"
log "启动 $domain 的自动 HTTPS 网关。"
COMPOSE_PROFILES=gateway
export COMPOSE_PROFILES
docker compose up -d gateway

attempts=0
until curl --fail --silent --show-error --resolve "$domain:443:127.0.0.1" "https://$domain/api/v1/health/ready" >/dev/null 2>&1; do
  attempts=$((attempts + 1))
  if [ "$attempts" -ge 36 ]; then
    docker compose logs --no-color --tail=120 gateway >&2 || true
    fail 'HTTPS 证书或网关未在 180 秒内就绪；请检查云防火墙是否允许 TCP 80/443。'
  fi
  sleep 5
done

docker compose ps gateway
printf '\n%s\n' '================ APPGOG HTTPS 已启用 ================'
printf '官网地址：https://%s\n' "$domain"
printf '后台地址：https://%s/admin\n' "$domain"
printf '%s\n' '证书与私钥保存在独立 Docker 数据卷中，请勿随意删除。'
printf '%s\n' '======================================================'
