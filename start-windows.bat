@echo off
chcp 936 >nul
setlocal EnableExtensions

cd /d "%~dp0"

echo [启动] 开始执行 Windows 启动脚本

echo [启动] 正在检测 Node.js 环境...
where node >nul 2>nul
if errorlevel 1 goto :missing_node

echo [启动] 正在检测 pnpm 环境...
where pnpm >nul 2>nul
if errorlevel 1 goto :missing_pnpm

if not exist node_modules goto :missing_node_modules
if not exist dist\index.html goto :missing_dist

if "%HOST%"=="" set "HOST=0.0.0.0"
if "%PORT%"=="" set "PORT=3001"

echo [启动] 环境检查通过
echo [启动] 即将启动服务...
echo [启动] 监听地址：%HOST%:%PORT%
echo [启动] 本机访问地址：http://127.0.0.1:%PORT%

call pnpm start
if errorlevel 1 goto :start_failed
exit /b 0

:missing_node
echo [启动] 错误：未检测到 Node.js，请先安装 Node.js 后再运行启动脚本。
exit /b 1

:missing_pnpm
echo [启动] 错误：未检测到 pnpm，请先安装 pnpm 后再运行启动脚本。
exit /b 1

:missing_node_modules
echo [启动] 错误：未检测到 node_modules，请先运行 deploy-windows.bat。
exit /b 1

:missing_dist
echo [启动] 错误：未检测到构建产物 dist\index.html，请先运行 deploy-windows.bat。
exit /b 1

:start_failed
echo [启动] 错误：服务启动失败。
exit /b 1