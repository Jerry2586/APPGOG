#!/bin/sh
set -eu
umask 077

repository_url='https://github.com/Jerry2586/APPGOG.git'
repository_ref=${APPGOG_REF:-main}
installer_revision='2026-09-02.1'
install_directory=${APPGOG_DIR:-/opt/APPGOG}
site_origin=${APPGOG_ORIGIN:-}
admin_email=${APPGOG_ADMIN_EMAIL:-admin@appgog.local}
admin_password=${APPGOG_ADMIN_PASSWORD:-}
web_port=${APPGOG_WEB_PORT:-8080}
panel=${APPGOG_PANEL:-ssh}
resume_install=false

log() { printf '%s\n' "[APPGOG] $*"; }
fail() { printf '%s\n' "[APPGOG] 错误：$*" >&2; exit 1; }

usage() {
  printf '%s\n' \
    'APPGOG 服务器一键安装部署' \
    '' \
    '用法：' \
    '  sudo sh install-one-click.sh --origin https://app.example.com' \
    '' \
    '参数：' \
    '  --origin URL   正式 HTTPS Origin；未传时在服务器终端询问' \
    '  --email EMAIL  初始管理员邮箱，默认 admin@appgog.local' \
    '  --port PORT    Web 端口，默认 8080' \
    '  --help         显示帮助' \
    '' \
    '也可使用 APPGOG_ORIGIN、APPGOG_ADMIN_EMAIL、APPGOG_ADMIN_PASSWORD、' \
    'APPGOG_WEB_PORT、APPGOG_DIR、APPGOG_REF 和 APPGOG_PANEL 环境变量。' \
    '未提供管理员密码时自动生成，并仅在安装成功后显示。'
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --origin) [ "$#" -ge 2 ] || fail '--origin 缺少值'; site_origin=$2; shift 2 ;;
    --email) [ "$#" -ge 2 ] || fail '--email 缺少值'; admin_email=$2; shift 2 ;;
    --port) [ "$#" -ge 2 ] || fail '--port 缺少值'; web_port=$2; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "未知参数：$1" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || fail '请使用 root 或 sudo 运行。'
log "服务器一键安装脚本版本：$installer_revision"
case "$repository_ref" in *[!A-Za-z0-9._/-]*|'') fail 'APPGOG_REF 含非法字符。' ;; esac
case "$install_directory" in /*) ;; *) fail 'APPGOG_DIR 必须是绝对路径。' ;; esac
case "$install_directory" in /|/opt|/usr|/var|/root|/home) fail 'APPGOG_DIR 不能指向系统根目录或宽泛目录。' ;; esac
case "$panel" in bt|1panel|aapanel|docker|ssh) ;; *) fail 'APPGOG_PANEL 只能是 bt、1panel、aapanel、docker 或 ssh。' ;; esac

if [ -z "$site_origin" ]; then
  [ -r /dev/tty ] || fail '非交互执行必须通过 --origin 或 APPGOG_ORIGIN 提供正式地址。'
  printf '%s' '请输入 APPGOG 正式 HTTPS 地址（例如 https://app.example.com）：' > /dev/tty
  IFS= read -r site_origin < /dev/tty
fi

case "$site_origin" in https://*) ;; *) fail '正式地址必须以 https:// 开头。' ;; esac
origin_host=${site_origin#https://}
case "$origin_host" in ''|*/*|*'?'*|*'#'*|*'@'*|*[!A-Za-z0-9.:-]*) fail '正式地址只能包含 HTTPS 主机名和可选端口，不能带路径、凭据、参数或片段。' ;; esac
case "$admin_email" in *@*.*) ;; *) fail '管理员邮箱格式错误。' ;; esac
case "$admin_email" in *[!A-Za-z0-9._+@-]*) fail '管理员邮箱包含不支持的字符。' ;; esac
case "$web_port" in ''|*[!0-9]*) fail 'Web 端口必须是整数。' ;; esac
[ "$web_port" -ge 1024 ] && [ "$web_port" -le 65535 ] || fail 'Web 端口必须为 1024–65535。'
case "$web_port" in 3000|5432|6379) fail 'Web 端口不能使用 3000、5432 或 6379。' ;; esac

validate_password() {
  value=$1
  [ "${#value}" -ge 16 ] && [ "${#value}" -le 128 ] || fail '管理员密码必须为 16–128 位。'
  case "$value" in *[!A-Za-z0-9._!@%+=:-]*) fail '自定义管理员密码只能使用字母、数字和 ._!@%+=:- 符号。' ;; esac
  classes=0
  case "$value" in *[a-z]*) classes=$((classes + 1)) ;; esac
  case "$value" in *[A-Z]*) classes=$((classes + 1)) ;; esac
  case "$value" in *[0-9]*) classes=$((classes + 1)) ;; esac
  case "$value" in *[!A-Za-z0-9]*) classes=$((classes + 1)) ;; esac
  [ "$classes" -ge 3 ] || fail '管理员密码必须包含大小写字母、数字和符号中的至少三类。'
}

os_id=''
os_codename=''
if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  os_id=${ID:-}
  os_codename=${VERSION_CODENAME:-${UBUNTU_CODENAME:-}}
fi

install_base_tools() {
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git openssl
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y ca-certificates curl git openssl
  elif command -v yum >/dev/null 2>&1; then
    yum install -y ca-certificates curl git openssl
  else
    fail '不支持当前包管理器；请先安装 curl、git、openssl、Docker Engine 和 Compose v2。'
  fi
}

install_docker_apt() {
  case "$os_id" in ubuntu|debian) ;; *) fail "当前系统 $os_id 不支持自动安装 Docker；请通过面板或 Docker 官方文档安装。" ;; esac
  [ -n "$os_codename" ] || fail '无法识别系统代号，拒绝写入 Docker 软件源。'
  for conflicting in docker.io docker-compose docker-compose-v2 docker-doc docker-buildx podman-docker; do
    if dpkg-query -W -f='${Status}' "$conflicting" 2>/dev/null | grep -q 'install ok installed'; then
      fail "检测到可能冲突的软件包 $conflicting；脚本不会自动卸载现有软件。"
    fi
  done
  install -m 0755 -d /etc/apt/keyrings
  key_tmp=$(mktemp)
  curl -fsSL "https://download.docker.com/linux/$os_id/gpg" -o "$key_tmp"
  install -m 0644 "$key_tmp" /etc/apt/keyrings/docker.asc
  rm -f "$key_tmp"
  architecture=$(dpkg --print-architecture)
  sources_tmp=$(mktemp)
  {
    printf '%s\n' 'Types: deb'
    printf 'URIs: https://download.docker.com/linux/%s\n' "$os_id"
    printf 'Suites: %s\n' "$os_codename"
    printf '%s\n' 'Components: stable'
    printf 'Architectures: %s\n' "$architecture"
    printf '%s\n' 'Signed-By: /etc/apt/keyrings/docker.asc'
  } > "$sources_tmp"
  install -m 0644 "$sources_tmp" /etc/apt/sources.list.d/docker.sources
  rm -f "$sources_tmp"
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
}

install_docker_rpm() {
  case "$os_id" in centos|rhel|fedora) docker_repo_os=$os_id ;; *) fail "当前系统 $os_id 不支持自动安装 Docker；请通过面板或 Docker 官方文档安装。" ;; esac
  if command -v dnf >/dev/null 2>&1; then
    dnf install -y dnf-plugins-core
    dnf config-manager --add-repo "https://download.docker.com/linux/$docker_repo_os/docker-ce.repo"
    dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  else
    yum install -y yum-utils
    yum-config-manager --add-repo "https://download.docker.com/linux/$docker_repo_os/docker-ce.repo"
    yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi
}

ensure_docker() {
  if command -v docker >/dev/null 2>&1; then
    docker compose version >/dev/null 2>&1 || fail '已发现 Docker，但缺少 Compose v2。'
  else
    log '未发现 Docker，准备从 Docker 官方软件源安装。'
    if command -v apt-get >/dev/null 2>&1; then install_docker_apt; else install_docker_rpm; fi
  fi
  if command -v systemctl >/dev/null 2>&1; then systemctl enable --now docker; fi
  docker info >/dev/null 2>&1 || fail 'Docker daemon 不可用。'
  docker compose version >/dev/null 2>&1 || fail 'Docker Compose v2 不可用。'
}

prepare_source() {
  if [ -e "$install_directory" ] && [ -n "$(find "$install_directory" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
    [ -d "$install_directory/.git" ] || fail "目标目录非空且不是 Git 仓库：$install_directory"
    [ ! -e "$install_directory/.appgog-install-state.json" ] || fail '检测到安装完成状态，拒绝重复安装。'
    if [ -e "$install_directory/.env" ]; then
      grep -qx 'APPGOG_INSTALL_MANAGED=true' "$install_directory/.env" || fail '检测到非一键脚本管理的 .env，拒绝覆盖。'
      [ "$(stat -c '%u:%a' "$install_directory/.env")" = '0:600' ] || fail '已有 .env 必须由 root 拥有且权限为 0600。'
      resume_install=true
    fi
    current_remote=$(git -C "$install_directory" remote get-url origin 2>/dev/null || true)
    [ "$current_remote" = "$repository_url" ] || fail '现有目录的 Git 远程地址不是 APPGOG 官方仓库。'
    working_tree_status=$(git -C "$install_directory" status --porcelain)
    if [ -n "$working_tree_status" ]; then
      content_status=$(git -c core.fileMode=false -C "$install_directory" status --porcelain)
      [ -z "$content_status" ] || fail '现有源码目录有未提交的内容修改，拒绝自动更新。'
      log '检测到旧安装脚本留下的纯文件权限变化；已安全忽略，不覆盖文件内容。'
    fi
    log "安全更新现有 $install_directory。"
    git -c core.fileMode=false -C "$install_directory" pull --ff-only origin "$repository_ref"
  else
    if [ ! -e "$install_directory" ]; then install -m 0750 -d "$install_directory"; fi
    log "从 $repository_url 获取 $repository_ref。"
    git clone --depth 1 --branch "$repository_ref" --single-branch "$repository_url" "$install_directory"
  fi
  [ -f "$install_directory/docker-compose.yml" ] || fail '仓库缺少 docker-compose.yml。'
  [ -f "$install_directory/Dockerfile.api" ] || fail '仓库缺少 Dockerfile.api。'
  [ -f "$install_directory/Dockerfile.web" ] || fail '仓库缺少 Dockerfile.web。'
}

write_environment() {
  if [ "$resume_install" = true ]; then
    existing_origin=$(sed -n 's/^APP_ORIGIN=//p' "$install_directory/.env" | tail -n 1)
    existing_email=$(sed -n 's/^ADMIN_EMAIL=//p' "$install_directory/.env" | tail -n 1)
    existing_port=$(sed -n 's/^APPGOG_WEB_PORT=//p' "$install_directory/.env" | tail -n 1)
    existing_password=$(sed -n 's/^ADMIN_INITIAL_PASSWORD=//p' "$install_directory/.env" | tail -n 1)
    [ "$existing_origin" = "$site_origin" ] || fail '恢复安装时 --origin 必须与已有 .env 一致。'
    [ "$existing_email" = "$admin_email" ] || fail '恢复安装时 --email 必须与已有 .env 一致。'
    [ "$existing_port" = "$web_port" ] || fail '恢复安装时 --port 必须与已有 .env 一致。'
    admin_password=$existing_password
    validate_password "$admin_password"
    log '检测到由一键脚本生成但尚未完成的配置，将安全恢复安装。'
    return
  fi
  database_password=$(openssl rand -hex 30)
  jwt_secret=$(openssl rand -hex 48)
  if [ -z "$admin_password" ]; then admin_password="Zx7!$(openssl rand -hex 18)"; fi
  validate_password "$admin_password"
  environment_tmp=$(mktemp "$install_directory/.env.tmp.XXXXXX")
  trap 'rm -f "$environment_tmp"' EXIT HUP INT TERM
  {
    printf '%s\n' '# 由 APPGOG 服务器一键安装脚本生成；禁止提交到版本库。'
    printf '%s\n' 'APPGOG_INSTALL_MANAGED=true'
    printf 'APPGOG_PANEL=%s\n' "$panel"
    printf 'APPGOG_WEB_PORT=%s\n' "$web_port"
    printf 'APPGOG_DB_PASSWORD=%s\n' "$database_password"
    printf 'JWT_SECRET=%s\n' "$jwt_secret"
    printf '%s\n' 'ADMIN_REFRESH_TTL_DAYS=7'
    printf 'APP_ORIGIN=%s\n' "$site_origin"
    printf 'ADMIN_ORIGIN=%s\n' "$site_origin"
    printf 'ADMIN_EMAIL=%s\n' "$admin_email"
    printf '%s\n' 'ADMIN_DISPLAY_NAME=APPGOG 管理员'
    printf 'ADMIN_INITIAL_PASSWORD=%s\n' "$admin_password"
    printf '%s\n' 'XBOARD_LOGIN_URL='
    printf '%s\n' 'XBOARD_REGISTER_URL='
    printf '%s\n' 'XBOARD_PURCHASE_URL='
    printf '%s\n' 'XBOARD_DASHBOARD_URL='
    printf '%s\n' 'XBOARD_TICKET_URL='
    printf '%s\n' 'XBOARD_AFFILIATE_URL='
    printf '%s\n' 'OPENAI_BASE_URL=https://api.openai.com/v1'
    printf '%s\n' 'OPENAI_API_KEY='
    printf '%s\n' 'OPENAI_CHAT_MODEL=gpt-4.1-mini'
    printf '%s\n' 'OPENAI_EMBEDDING_MODEL=text-embedding-3-small'
    printf '%s\n' 'AI_EXTERNAL_ENABLED=false'
    printf '%s\n' 'AI_DAILY_MODEL_CALL_LIMIT=200'
    printf '%s\n' 'AI_WORKER_ENABLED=true'
    printf '%s\n' 'AI_TRUSTED_PROXY_IPS='
  } > "$environment_tmp"
  chmod 600 "$environment_tmp"
  mv "$environment_tmp" "$install_directory/.env"
  trap - EXIT HUP INT TERM
}

recover_known_empty_stage3_failure() {
  [ "$resume_install" = true ] || return
  log '检查未完成安装的数据库迁移状态。'
  docker compose up -d postgres redis
  attempts=0
  until docker compose exec -T postgres pg_isready -U appgog -d appgog >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    [ "$attempts" -lt 30 ] || fail '恢复安装时 PostgreSQL 未在 150 秒内就绪。'
    sleep 5
  done
  migration_state=$(docker compose exec -T postgres psql -U appgog -d appgog -At -v ON_ERROR_STOP=1 -c \
    "SELECT CASE WHEN EXISTS (SELECT 1 FROM \"_prisma_migrations\" WHERE migration_name = '20260829030000_stage3_data_model' AND finished_at IS NULL AND rolled_back_at IS NULL) AND NOT EXISTS (SELECT 1 FROM \"_prisma_migrations\" WHERE migration_name NOT IN ('20260829000000_init', '20260829030000_stage3_data_model') AND finished_at IS NOT NULL) THEN 'recoverable' ELSE 'other' END" 2>/dev/null || printf '%s' 'other')
  [ "$migration_state" = recoverable ] || return
  business_data=$(docker compose exec -T postgres psql -U appgog -d appgog -At -v ON_ERROR_STOP=1 -c \
    'SELECT CASE WHEN EXISTS (SELECT 1 FROM "User") OR EXISTS (SELECT 1 FROM "Page") OR EXISTS (SELECT 1 FROM "Category") OR EXISTS (SELECT 1 FROM "Content") OR EXISTS (SELECT 1 FROM "KnowledgeChunk") OR EXISTS (SELECT 1 FROM "Product") OR EXISTS (SELECT 1 FROM "Theme") OR EXISTS (SELECT 1 FROM "ThemeSchedule") OR EXISTS (SELECT 1 FROM "MarketingCampaign") OR EXISTS (SELECT 1 FROM "GlobalSetting") OR EXISTS (SELECT 1 FROM "PluginSnippet") OR EXISTS (SELECT 1 FROM "AuditLog") THEN '\''present'\'' ELSE '\''empty'\'' END' 2>/dev/null || printf '%s' 'unknown')
  [ "$business_data" = empty ] || fail '已知迁移失败库中存在业务数据或无法确认空库，拒绝自动恢复。'
  log '确认仅存在已知的第 3 阶段失败记录且业务表为空；重建 APPGOG 空 schema 后继续。'
  docker compose rm -sf init api web >/dev/null 2>&1 || true
  docker compose exec -T postgres psql -U appgog -d appgog -v ON_ERROR_STOP=1 -c \
    'DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION appgog; GRANT ALL ON SCHEMA public TO public;' >/dev/null
}

deploy_application() {
  cd "$install_directory"
  log '验证 Docker Compose 配置。'
  docker compose config --quiet
  log '构建 APPGOG 镜像，首次执行可能需要数分钟。'
  docker compose build --pull
  recover_known_empty_stage3_failure
  log '启动数据库、Redis、迁移、API 和 Web。'
  docker compose up -d --wait --wait-timeout 300
  log '检查 API 和 Web 就绪状态。'
  docker compose exec -T api wget --no-verbose --tries=10 --spider http://localhost:3000/api/v1/health/ready
  curl --fail --silent --show-error --retry 10 --retry-delay 2 "http://127.0.0.1:$web_port/api/v1/health/ready" >/dev/null
  docker compose ps
  completed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  state_tmp=$(mktemp "$install_directory/.appgog-install-state.tmp.XXXXXX")
  {
    printf '%s\n' '{'
    printf '%s\n' '  "status": "completed",'
    printf '  "panel": "%s",\n' "$panel"
    printf '  "origin": "%s",\n' "$site_origin"
    printf '  "webPort": %s,\n' "$web_port"
    printf '  "updatedAt": "%s"\n' "$completed_at"
    printf '%s\n' '}'
  } > "$state_tmp"
  chmod 600 "$state_tmp"
  mv "$state_tmp" "$install_directory/.appgog-install-state.json"
}

install_base_tools
ensure_docker
prepare_source
write_environment
deploy_application

printf '\n%s\n' '================ APPGOG 安装完成 ================'
printf '官网地址：%s\n' "$site_origin"
printf '后台地址：%s/admin\n' "$site_origin"
printf '管理员账号：%s\n' "$admin_email"
printf '初始密码：%s\n' "$admin_password"
printf 'Web 上游：http://127.0.0.1:%s\n' "$web_port"
printf '%s\n' '请立即保存以上信息，登录后台后修改初始密码。'
printf '%s\n' '如果正式域名尚未接入，请把服务器现有 HTTPS 入口反向代理到上述 Web 上游。'
printf '%s\n' '3000、5432、6379 不得向公网开放。'
printf '%s\n' '=================================================='
