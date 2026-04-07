# Flowing Light Notes

Flowing Light Notes 是一个本地优先的知识库与文件协作系统，前端基于 React + Vite，后端基于 Node.js，数据持久化使用 SQLite，上传文件保存在磁盘目录中。系统支持个人空间、团队空间、笔记协作、文件管理、分享链接、空间分享、转存和回收站等能力。

## 系统功能介绍

### 1. 账号与个人空间

- 支持注册、登录、切换账号。
- 支持编辑个人资料，包括昵称、邮箱、密码和头像。
- 每个账号拥有独立的个人空间，个人笔记和个人文件彼此隔离。

### 2. 笔记系统

- 支持笔记文件夹、文件夹下新建笔记、文件夹重命名与删除。
- 支持富文本编辑、自动保存、评论、待办事项。
- 支持收藏笔记，收藏页可直接查看收藏内容。
- 支持笔记分享，包含分享到空间和分享链接两种方式。

### 3. 文件系统

- 支持创建文件夹后上传文件，根路径下不允许直接上传。
- 图片和视频支持卡片预览，首页可汇总展示所有图片和视频。
- 支持文件移动、批量移动、删除、收藏、分享。
- 文件索引保存在数据库中，实际文件存放在 `data/files/` 下。

### 4. 空间与团队协作

- 支持创建空间、加入空间、邀请成员、移除成员、退出空间、解散空间。
- 支持空间设置，包括空间名称、头像、创建时间和成员上限。
- 非创建者进入空间时仅显示空间总览，避免误操作管理项。
- 支持空间通知、邀请消息和动态消息统一展示。

### 5. 分享与转存

- 资源支持分享到指定空间。
- 资源支持生成分享链接，可选访问密码。
- 分享记录页可统一查看自己发起的分享，并支持取消分享。
- 空间分享页可查看当前空间收到的笔记与文件分享。
- 公开或分享出去的笔记、文件支持转存到自己的笔记文件夹或文件夹目录中。

### 6. 回收站与持久化

- 解散空间后，空间内笔记和文件进入回收站保留 7 天。
- 可访问已解散空间的回收站，并把内容转存回自己的空间。
- 数据库文件默认位于 `data/app.db`。
- 上传文件默认位于 `data/files/<personal|team-*>/<日期>/<类型>/`。

## 部署方式

### 环境要求

- Node.js 24 LTS 或支持 `node:sqlite` 的 Node.js 版本
- pnpm 8 及以上
- Linux / Windows 均可部署

说明：

- 启动时如果看到 `SQLite is an experimental feature`，这是 Node 内置 `node:sqlite` 的提示，当前项目可正常运行。

### 默认演示账号

首次启动后，系统会自动写入两个演示账号：

- `demo@example.com / 123456`
- `team@example.com / 123456`

也可以直接在登录页注册新账号。

### 本地开发

安装依赖：

```bash
pnpm install
```

一键启动前后端开发环境：

```bash
pnpm dev
```

默认端口：

- 前端开发服务：`http://127.0.0.1:5173`
- 后端接口服务：`http://127.0.0.1:3001`

如果只想单独启动某一端：

```bash
pnpm dev:client
pnpm dev:server
```

### 生产部署

1. 拉取代码并切换到开发分支：

```bash
git clone https://gitee.com/wei-jinjie/flowing-light-notes.git
cd flowing-light-notes
git checkout develop
```

2. 安装依赖：

```bash
pnpm install --frozen-lockfile
```

3. 构建前端静态资源：

```bash
pnpm build
```

4. 启动服务：

```bash
pnpm start
```

默认情况下，服务监听 `0.0.0.0:3001`，同一个 Node 进程会同时提供：

- 前端静态页面 `dist/`
- 后端接口 `/api/*`
- 上传文件 `/uploads/*`

如果需要显式指定端口和监听地址：

```bash
# Linux / macOS
HOST=0.0.0.0 PORT=3001 pnpm start
```

```powershell
# Windows PowerShell
$env:HOST='0.0.0.0'
$env:PORT='3001'
pnpm start
```

启动成功后可访问：

```text
http://服务器IP:3001
```

### 使用 PM2 持久运行

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

### Nginx 反向代理示例

如果希望通过 80 或 443 端口对外访问，可以把 Nginx 代理到 `3001`：

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
    }
}
```

### 数据持久化与备份

部署时请务必备份以下目录：

- `data/app.db`
- `data/files/`

只要保留 `data/` 目录，重新拉代码、重新构建后，历史账号、笔记、空间和上传文件都会继续保留。

### 更新部署

```bash
git pull origin develop
pnpm install --frozen-lockfile
pnpm build
pm2 restart flowing-light-notes
```

如果不是通过 `pm2` 管理进程，请把最后一步替换成你自己的服务重启方式。
