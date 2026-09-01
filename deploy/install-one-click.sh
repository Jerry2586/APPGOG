#!/bin/sh
set -eu
umask 077

repository_url='https://github.com/Jerry2586/APPGOG.git'
repository_ref=${APPGOG_REF:-main}
install_directory=${APPGOG_DIR:-/opt/APPGOG}
runtime_directory=${APPGOG_RUNTIME_DIR:-/opt/appgog-runtime}

log() { printf '%s\n' "[APPGOG] $*"; }
fail() { printf '%s\n' "[APPGOG] 错误：$*" >&2; exit 1; }

usage() {
  printf '%s\n' \
    'APPGOG 一键引导安装' \
    '' \
    '用法：sudo sh install-one-click.sh' \
    '' \
    '可选环境变量：' \
    '  APPGOG_DIR                 安装目录，默认 /opt/APPGOG' \
    '  APPGOG_REF                 Git 分支或标签，默认 main' \
    '  APPGOG_INSTALL_TOKEN       至少 20 位的一次性安装 Token' \
    '  APPGOG_INSTALL_REMOTE=true 临时监听 0.0.0.0:3099；必须配合 HTTPS 和来源 IP 限制' \
    '' \
    '脚本只用于首次安装。目标目录非空、已有 .env 或安装状态时会拒绝覆盖。'
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  '') ;;
  *) fail "未知参数：$1" ;;
esac

[ "$(id -u)" -eq 0 ] || fail '请使用 root 或 sudo 运行。'
case "$repository_ref" in *[!A-Za-z0-9._/-]*|'') fail 'APPGOG_REF 含非法字符。' ;; esac
case "$install_directory" in
  /*) ;;
  *) fail 'APPGOG_DIR 必须是绝对路径。' ;;
esac
case "$install_directory" in
  /|/opt|/usr|/var|/root|/home) fail 'APPGOG_DIR 不能指向系统根目录或宽泛目录。' ;;
esac

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
    DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git tar xz-utils
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y ca-certificates curl git tar xz
  elif command -v yum >/dev/null 2>&1; then
    yum install -y ca-certificates curl git tar xz
  else
    fail '不支持当前包管理器；请先安装 curl、git、tar、xz、ca-certificates、Docker Engine 和 Compose v2。'
  fi
}

install_docker_apt() {
  case "$os_id" in ubuntu|debian) ;; *) fail "当前系统 $os_id 不支持自动安装 Docker；请通过 1Panel 或 Docker 官方文档安装。" ;; esac
  [ -n "$os_codename" ] || fail '无法识别系统代号，拒绝写入 Docker 软件源。'
  for conflicting in docker.io docker-compose docker-compose-v2 docker-doc docker-buildx podman-docker; do
    if dpkg-query -W -f='${Status}' "$conflicting" 2>/dev/null | grep -q 'install ok installed'; then
      fail "检测到可能冲突的软件包 $conflicting；请按 Docker 官方文档处理后重试，脚本不会自动卸载现有软件。"
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
  case "$os_id" in
    centos|rhel|fedora) docker_repo_os=$os_id ;;
    *) fail "当前系统 $os_id 不支持自动安装 Docker；请通过 1Panel 或 Docker 官方文档安装。" ;;
  esac
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
    docker compose version >/dev/null 2>&1 || fail '已发现 Docker，但缺少 Compose v2；请先安装 docker-compose-plugin。'
  else
    log '未发现 Docker，准备从 Docker 官方软件源安装。'
    if command -v apt-get >/dev/null 2>&1; then install_docker_apt; else install_docker_rpm; fi
  fi
  if command -v systemctl >/dev/null 2>&1; then systemctl enable --now docker; fi
  docker info >/dev/null 2>&1 || fail 'Docker daemon 不可用。'
  docker compose version >/dev/null 2>&1 || fail 'Docker Compose v2 不可用。'
}

node_major() {
  "$1" -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || printf '0\n'
}

ensure_node() {
  if command -v node >/dev/null 2>&1 && [ "$(node_major "$(command -v node)")" -ge 22 ]; then
    log "使用现有 $(node -v)。"
    return
  fi
  case "$(uname -m)" in
    x86_64|amd64) node_arch=x64 ;;
    aarch64|arm64) node_arch=arm64 ;;
    armv7l) node_arch=armv7l ;;
    ppc64le) node_arch=ppc64le ;;
    s390x) node_arch=s390x ;;
    *) fail "Node.js 22 不支持当前架构：$(uname -m)" ;;
  esac
  log '从 nodejs.org 下载 Node.js 22 并校验 SHA-256。'
  node_base='https://nodejs.org/dist/latest-v22.x'
  node_tmp=$(mktemp -d)
  trap 'rm -rf "$node_tmp"' EXIT HUP INT TERM
  curl -fsSL "$node_base/SHASUMS256.txt" -o "$node_tmp/SHASUMS256.txt"
  node_file=$(awk -v suffix="linux-$node_arch.tar.xz" '$2 ~ suffix "$" { print $2; exit }' "$node_tmp/SHASUMS256.txt")
  [ -n "$node_file" ] || fail '官方校验清单中没有匹配的 Node.js 22 Linux 架构包。'
  expected_hash=$(awk -v file="$node_file" '$2 == file { print $1; exit }' "$node_tmp/SHASUMS256.txt")
  curl -fsSL "$node_base/$node_file" -o "$node_tmp/$node_file"
  actual_hash=$(sha256sum "$node_tmp/$node_file" | awk '{ print $1 }')
  [ "$actual_hash" = "$expected_hash" ] || fail 'Node.js 下载文件 SHA-256 校验失败。'
  node_release=${node_file%.tar.xz}
  install -m 0755 -d "$runtime_directory"
  [ ! -e "$runtime_directory/$node_release" ] || fail "Node.js 目标目录已存在：$runtime_directory/$node_release"
  tar -xJf "$node_tmp/$node_file" -C "$runtime_directory"
  ln -sfn "$runtime_directory/$node_release" "$runtime_directory/current"
  PATH="$runtime_directory/current/bin:$PATH"
  export PATH
  trap - EXIT HUP INT TERM
  rm -rf "$node_tmp"
  [ "$(node_major "$runtime_directory/current/bin/node")" -ge 22 ] || fail 'Node.js 22 安装验证失败。'
}

prepare_source() {
  if [ -e "$install_directory" ]; then
    [ -d "$install_directory" ] || fail "目标已存在且不是目录：$install_directory"
    [ -z "$(find "$install_directory" -mindepth 1 -maxdepth 1 -print -quit)" ] || fail "目标目录非空，拒绝覆盖：$install_directory"
  else
    install -m 0750 -d "$install_directory"
  fi
  log "从 $repository_url 获取 $repository_ref。"
  git clone --depth 1 --branch "$repository_ref" --single-branch "$repository_url" "$install_directory"
  [ -f "$install_directory/docker-compose.yml" ] || fail '仓库缺少 docker-compose.yml。'
  [ -f "$install_directory/deploy/start-installer.sh" ] || fail '仓库缺少安装向导启动脚本。'
  [ ! -e "$install_directory/.env" ] || fail '仓库中不应包含 .env。'
  [ ! -e "$install_directory/.appgog-install-state.json" ] || fail '仓库中不应包含安装完成状态。'
  chmod 750 "$install_directory"/deploy/*.sh
}

install_base_tools
ensure_docker
ensure_node
prepare_source

log "源码已安装到 $install_directory。"
log '向导默认只监听 127.0.0.1:3099。请在本机另开终端建立：'
log 'ssh -N -L 3099:127.0.0.1:3099 root@服务器IP'
log '然后打开 http://127.0.0.1:3099/install/ 并使用终端显示的一次性 Token。'
if [ "${APPGOG_INSTALL_REMOTE:-false}" = 'true' ]; then
  log '警告：已启用远程模式；必须使用临时 HTTPS 反向代理并限制管理员来源 IP。'
fi

cd "$install_directory"
exec sh deploy/start-installer.sh
