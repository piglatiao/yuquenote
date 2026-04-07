# 部署说明

本文档只说明服务部署、运行方式、反向代理和数据持久化。系统功能介绍请查看根目录 [README.md](README.md)。

## 部署架构

当前项目采用单进程部署方式，一个 Node.js 服务同时负责：

- 提供前端构建产物 `dist/`
- 提供后端接口 `/api/*`
- 提供上传文件访问 `/uploads/*`

这意味着生产环境不需要再单独启动 Vite 开发服务器，也不需要前后端分开部署。

## 环境要求

- Node.js 24 LTS，或支持 `node:sqlite` 的 Node.js 版本
- pnpm 8 及以上
- Linux / Windows 服务器均可

说明：

- 启动时看到 `SQLite is an experimental feature` 是 Node 内置 SQLite 的提示，不影响当前项目运行。

## 首次部署

### 1. 拉取代码

```bash
git clone https://gitee.com/wei-jinjie/flowing-light-notes.git
cd flowing-light-notes
git checkout develop
```

### 2. 安装依赖

```bash
pnpm install --frozen-lockfile
```

### 3. 构建前端

```bash
pnpm build
```

### 4. 启动服务

```bash
pnpm start
```

默认监听地址：

- `HOST=0.0.0.0`
- `PORT=3001`

启动后可直接访问：

```text
http://服务器IP:3001
```

如果只在本机验证服务，可以先执行：

```bash
curl http://127.0.0.1:3001
```

返回首页 HTML 或服务响应，说明服务已正常启动。

## 指定监听地址和端口

### Linux / macOS

```bash
HOST=0.0.0.0 PORT=3001 pnpm start
```

### Windows PowerShell

```powershell
$env:HOST='0.0.0.0'
$env:PORT='3001'
pnpm start
```

## 默认演示账号

系统首次启动时会自动写入两个演示账号：

- `demo@example.com / 123456`
- `team@example.com / 123456`

也可以直接在登录页注册新账号。

## 生产环境推荐方式

### 使用 PM2 守护运行

```bash
pnpm add -g pm2
pm2 start server/app.mjs --name flowing-light-notes
pm2 save
pm2 startup
```

如果需要带环境变量：

```bash
HOST=0.0.0.0 PORT=3001 pm2 start server/app.mjs --name flowing-light-notes
```

常用命令：

```bash
pm2 status
pm2 logs flowing-light-notes
pm2 restart flowing-light-notes
pm2 stop flowing-light-notes
```

## Nginx 反向代理

如果希望通过 `80` 或 `443` 端口对外访问，推荐用 Nginx 转发到本地 `3001`。

### HTTP 示例

```nginx
server {
    listen 80;
    server_name _;

    client_max_body_size 200m;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }
}
```

说明：

- `X-Forwarded-Proto` 和 `X-Forwarded-Host` 建议保留，否则分享页里生成的绝对链接可能不是你对外访问的域名或协议。
- 上传文件较大时请调整 `client_max_body_size`。

### HTTPS 场景

如果你使用 HTTPS 域名访问，请确保：

- SSL 证书配置在 Nginx 层完成
- 请求仍然转发到 `http://127.0.0.1:3001`
- 保留 `X-Forwarded-Proto https`

这样分享链接和上传资源地址会正确生成 `https://你的域名/...`

## 防火墙与端口

如果不使用 Nginx，直接暴露 `3001` 端口时，请确保：

- 云服务器安全组已放行 `3001`
- 系统防火墙已放行 `3001`

如果使用 Nginx 统一代理，只需要对外开放 `80/443`。

## 数据持久化

以下目录必须保留并做好备份：

- `data/app.db`
- `data/files/`

说明：

- `data/app.db` 保存用户、空间、笔记、文件索引、分享、通知等业务数据
- `data/files/` 保存所有上传文件
- 文件会按空间范围、日期和类型落盘，例如：
  - `data/files/personal/2026-04-07/image/...`
  - `data/files/team-xxxx/2026-04-07/video/...`

只要保留 `data/` 目录，重新拉代码和重新构建后，历史数据仍会继续使用。

## 更新部署

```bash
git pull origin develop
pnpm install --frozen-lockfile
pnpm build
pm2 restart flowing-light-notes
```

如果不是通过 `pm2` 管理进程，请把最后一步替换成你自己的重启方式。

## 常见问题

### 1. 浏览器可以打开首页，但上传失败

优先检查：

- 是否已经登录
- `/uploads/*` 路径是否被代理到同一个服务
- 反向代理层是否限制了上传大小

### 2. 服务器本机可以访问，外网打不开

优先检查：

- 服务是否监听在 `0.0.0.0`
- 云服务器安全组是否放行端口
- 系统防火墙是否放行端口
- 是否需要通过 Nginx 转发后再对外开放

### 3. 刷新或分享页资源地址异常

优先检查 Nginx 是否保留以下请求头：

- `Host`
- `X-Forwarded-Proto`
- `X-Forwarded-Host`
