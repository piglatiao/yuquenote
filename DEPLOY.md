# 部署说明

## 发布入口

当前只保留根目录 4 个脚本：

- `deploy-windows.bat`
- `start-windows.bat`
- `deploy-linux.sh`
- `start-linux.sh`

## Windows 部署

1. 运行 `deploy-windows.bat`
2. 部署完成后，再运行 `start-windows.bat`

## Linux 部署

1. 执行 `chmod +x ./deploy-linux.sh ./start-linux.sh`
2. 运行 `./deploy-linux.sh`
3. 部署完成后，再运行 `./start-linux.sh`

## 部署脚本职责

部署脚本会自动完成：

1. 环境检测
2. 依赖安装
3. 默认使用国内镜像安装 Chromium 浏览器内核
4. Chromium 启动验证
5. 前端构建

如果环境不足，会直接提示缺失项并停止执行。

默认情况下，部署脚本会把 Playwright 浏览器下载源设置为 `https://npmmirror.com/mirrors/playwright`。

如果你已经提前设置了 `PLAYWRIGHT_DOWNLOAD_HOST`，脚本会直接使用你自己的下载源，不会覆盖。

## 启动脚本职责

启动脚本会检查：

- Node.js
- pnpm
- node_modules
- dist/index.html

如果缺少依赖或构建产物，会提示你先运行部署脚本。

## 默认端口

默认使用：

- `HOST=0.0.0.0`
- `PORT=3001`

本机通常可通过 `http://127.0.0.1:3001` 访问。

## 数据持久化

请保留以下路径：

- `data/app.db`
- `data/files/`
