@echo off
chcp 936 >nul
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

echo [部署] 开始执行 Windows 一键部署脚本
echo [部署] 当前步骤：环境检测 -> 依赖安装 -> 浏览器内核安装 -> 启动验证 -> 前端构建

echo [部署] 正在检测 Node.js 环境...
where node >nul 2>nul
if errorlevel 1 goto :missing_node

for /f %%i in ('node -p "process.versions.node"') do set "NODE_VERSION=%%i"
for /f "tokens=1 delims=." %%i in ("!NODE_VERSION!") do set "NODE_MAJOR=%%i"
if "!NODE_MAJOR!"=="" goto :node_version_error
if !NODE_MAJOR! LSS 22 goto :node_version_low

call node --input-type=module -e "await import('node:sqlite')" >nul 2>nul
if errorlevel 1 goto :sqlite_missing
echo [部署] Node.js 检测通过：!NODE_VERSION!

echo [部署] 正在检测 pnpm 环境...
where pnpm >nul 2>nul
if errorlevel 1 goto :missing_pnpm

for /f %%i in ('pnpm --version') do set "PNPM_VERSION=%%i"
for /f "tokens=1 delims=." %%i in ("!PNPM_VERSION!") do set "PNPM_MAJOR=%%i"
if "!PNPM_MAJOR!"=="" goto :pnpm_version_error
if !PNPM_MAJOR! LSS 8 goto :pnpm_version_low
echo [部署] pnpm 检测通过：!PNPM_VERSION!

if exist pnpm-lock.yaml (
  echo [部署] 检测到 pnpm-lock.yaml，开始按锁文件安装依赖...
  call pnpm install --frozen-lockfile
) else (
  echo [部署] 未检测到 pnpm-lock.yaml，开始普通安装依赖...
  call pnpm install
)
if errorlevel 1 goto :install_failed

echo [部署] 开始安装 Playwright Chromium 浏览器内核...
call pnpm exec playwright install chromium
if errorlevel 1 goto :chromium_install_failed

echo [部署] 正在验证 Chromium 是否可以正常启动...
call node --input-type=module -e "import { chromium } from 'playwright'; const browser = await chromium.launch({ headless: true }); await browser.close();" >nul 2>nul
if errorlevel 1 goto :chromium_verify_failed
echo [部署] Chromium 启动验证通过

echo [部署] 开始构建发布产物...
call pnpm build
if errorlevel 1 goto :build_failed

echo [部署] 部署完成，当前仅完成部署，服务尚未启动。
echo [部署] 请运行 start-windows.bat 启动服务。
exit /b 0

:missing_node
echo [部署] 错误：未检测到 Node.js，请先安装 Node.js 22 或更高版本。
exit /b 1

:node_version_error
echo [部署] 错误：无法解析 Node.js 版本，请检查 Node.js 安装是否完整。
exit /b 1

:node_version_low
echo [部署] 错误：当前 Node.js 版本为 !NODE_VERSION!，需要 22 或更高版本。
exit /b 1

:sqlite_missing
echo [部署] 错误：当前 Node.js 不支持 node:sqlite，请升级 Node.js。
exit /b 1

:missing_pnpm
echo [部署] 错误：未检测到 pnpm，请先安装 pnpm 8 或更高版本。
exit /b 1

:pnpm_version_error
echo [部署] 错误：无法解析 pnpm 版本，请检查 pnpm 安装是否完整。
exit /b 1

:pnpm_version_low
echo [部署] 错误：当前 pnpm 版本为 !PNPM_VERSION!，需要 8 或更高版本。
exit /b 1

:install_failed
echo [部署] 错误：依赖安装失败。
exit /b 1

:chromium_install_failed
echo [部署] 错误：Playwright Chromium 浏览器内核安装失败，请检查网络或代理配置。
exit /b 1

:chromium_verify_failed
echo [部署] 错误：Chromium 启动验证失败，请确认浏览器内核已正确下载。
exit /b 1

:build_failed
echo [部署] 错误：发布构建失败。
exit /b 1