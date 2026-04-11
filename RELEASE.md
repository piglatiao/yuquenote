# 发布说明

当前仓库的发布方式已经收敛为根目录 4 个脚本：

- `deploy-windows.bat`
- `start-windows.bat`
- `deploy-linux.sh`
- `start-linux.sh`

## 使用方式

### Windows

1. 双击或执行 `deploy-windows.bat`
2. 部署完成后，再运行 `start-windows.bat`

### Linux

1. 先赋予脚本执行权限
2. 运行 `./deploy-linux.sh`
3. 部署完成后，再运行 `./start-linux.sh`

示例：

```bash
chmod +x ./deploy-linux.sh ./start-linux.sh
./deploy-linux.sh
./start-linux.sh
```

## 部署脚本会做什么

部署脚本会按顺序执行以下步骤，并在终端输出中文提示：

1. 检测 `Node.js`
2. 检测 `pnpm`
3. 检测 `node:sqlite` 能力
4. 安装依赖
5. 默认使用国内镜像安装 Playwright Chromium 浏览器内核
6. 验证 Chromium 能否正常启动
7. 构建前端发布产物

如果环境不足，脚本会直接提示缺失项并停止执行。

默认情况下，部署脚本会把 Playwright 浏览器下载源设置为 `https://npmmirror.com/mirrors/playwright`。

如果你已经提前设置了 `PLAYWRIGHT_DOWNLOAD_HOST`，脚本会直接使用你自己的下载源，不会覆盖。

## 启动脚本会做什么

启动脚本会先检查：

- `Node.js` 是否存在
- `pnpm` 是否存在
- `node_modules` 是否存在
- `dist/index.html` 是否存在

如果缺少依赖或构建产物，会提示你先运行对应的部署脚本。

## 说明

- 部署脚本只负责部署，不会自动启动服务。
- 部署完成后，脚本会明确提示你去运行对应的 `start` 脚本。
- 默认启动地址为 `0.0.0.0:3001`。
- 本机访问地址通常可以使用 `http://127.0.0.1:3001`。
