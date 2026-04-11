#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "${ROOT_DIR}"

log() {
  echo "[启动] $1"
}

fail() {
  echo "[启动] 错误：$1" >&2
  exit 1
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "未检测到 $1，请先安装后再运行启动脚本。"
  fi
}

log "开始执行 Linux 启动脚本"
require_command node
require_command pnpm

[[ -d node_modules ]] || fail "未检测到 node_modules，请先运行 ./deploy-linux.sh。"
[[ -f dist/index.html ]] || fail "未检测到构建产物 dist/index.html，请先运行 ./deploy-linux.sh。"

HOST_VALUE="${HOST:-0.0.0.0}"
PORT_VALUE="${PORT:-3001}"

log "环境检查通过"
log "即将启动服务"
log "监听地址：${HOST_VALUE}:${PORT_VALUE}"
log "本机可通过 http://127.0.0.1:${PORT_VALUE} 访问"

export HOST="${HOST_VALUE}"
export PORT="${PORT_VALUE}"

exec pnpm start
