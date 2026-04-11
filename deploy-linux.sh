#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "${ROOT_DIR}"

log() {
  echo "[部署] $1"
}

fail() {
  echo "[部署] 错误：$1" >&2
  exit 1
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "未检测到 $1，请先安装后再重新运行部署脚本。"
  fi
}

check_node() {
  log "正在检测 Node.js 环境"
  require_command node

  local node_version
  local node_major
  node_version="$(node -p "process.versions.node" 2>/dev/null)" || fail "无法读取 Node.js 版本。"
  node_major="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null)" || fail "无法解析 Node.js 主版本号。"

  if [[ ! "${node_major}" =~ ^[0-9]+$ ]] || (( node_major < 22 )); then
    fail "当前 Node.js 版本为 ${node_version}，需要 22 或更高版本。"
  fi

  node --input-type=module -e "await import('node:sqlite')" >/dev/null 2>&1 || fail "当前 Node.js 不支持 node:sqlite，请升级 Node.js。"
  log "Node.js 检测通过：${node_version}"
}

check_pnpm() {
  log "正在检测 pnpm 环境"
  require_command pnpm

  local pnpm_version
  local pnpm_major
  pnpm_version="$(pnpm --version 2>/dev/null)" || fail "无法读取 pnpm 版本。"
  pnpm_major="${pnpm_version%%.*}"

  if [[ ! "${pnpm_major}" =~ ^[0-9]+$ ]] || (( pnpm_major < 8 )); then
    fail "当前 pnpm 版本为 ${pnpm_version}，需要 8 或更高版本。"
  fi

  log "pnpm 检测通过：${pnpm_version}"
}

install_dependencies() {
  if [[ -f pnpm-lock.yaml ]]; then
    log "检测到 pnpm-lock.yaml，开始按锁文件安装依赖"
    pnpm install --frozen-lockfile || fail "依赖安装失败。"
  else
    log "未检测到 pnpm-lock.yaml，开始普通安装依赖"
    pnpm install || fail "依赖安装失败。"
  fi
}

install_chromium() {
  log "开始安装 Playwright Chromium 浏览器内核"
  pnpm exec playwright install chromium || fail "浏览器内核安装失败，请检查网络或代理配置。"
}

verify_chromium() {
  log "开始验证 Chromium 是否可以正常启动"
  node --input-type=module -e "import { chromium } from 'playwright'; const browser = await chromium.launch({ headless: true }); await browser.close();" >/dev/null 2>&1 || fail "Chromium 启动验证失败。Linux 服务器如果缺少系统依赖，可以执行：pnpm exec playwright install --with-deps chromium"
}

build_release() {
  log "开始构建发布产物"
  pnpm build || fail "构建失败。"
}

log "开始执行 Linux 一键部署脚本"
log "该脚本会依次完成：环境检测、依赖安装、浏览器内核安装、运行验证、前端构建"

check_node
check_pnpm
install_dependencies
install_chromium
verify_chromium
build_release

log "部署完成，当前仅完成部署，服务尚未启动"
log "请运行 ./start-linux.sh 启动服务"
