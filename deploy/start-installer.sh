#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_dir=$(dirname -- "$script_dir")
cd "$project_dir"

node_bin=$(command -v node 2>/dev/null || true)
if [ -z "$node_bin" ] || [ "$("$node_bin" -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || printf '0')" -lt 22 ]; then
  fallback_node=${APPGOG_NODE_BIN:-/opt/appgog-runtime/current/bin/node}
  [ -x "$fallback_node" ] || { printf '%s\n' '需要 Node.js 22 或更高版本。' >&2; exit 69; }
  node_bin=$fallback_node
fi
major=$("$node_bin" -p "Number(process.versions.node.split('.')[0])")
[ "$major" -ge 22 ] || { printf '%s\n' '需要 Node.js 22 或更高版本。' >&2; exit 69; }

if [ "${APPGOG_INSTALL_REMOTE:-false}" = "true" ]; then
  exec "$node_bin" deploy/installer/server.mjs --host 0.0.0.0 --allow-remote "$@"
fi
exec "$node_bin" deploy/installer/server.mjs "$@"
