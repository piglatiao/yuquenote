# 服务器测试部署

这个项目现在支持同一个 Node 进程同时提供：

- 前端静态页面 `dist/`
- 后端接口 `/api/*`
- 上传文件 `/uploads/*`

也就是说，服务器上不需要再单独启动 Vite 开发服务器。

## 环境要求

- Node.js 20 或更高
- pnpm 8 或更高
- Linux / Ubuntu / CentOS 均可

## 首次部署

```bash
git clone https://gitee.com/wei-jinjie/flowing-light-notes.git
cd flowing-light-notes
git checkout develop
pnpm install --frozen-lockfile
pnpm build
```

## 启动测试环境

默认端口是 `3001`，默认监听 `0.0.0.0`：

```bash
pnpm start
```

指定端口启动：

```bash
PORT=3001 HOST=0.0.0.0 pnpm start
```

启动后可直接访问：

```text
http://服务器IP:3001
```

## 数据目录

以下目录需要保留和备份：

- `data/app.db`：SQLite 数据库
- `data/files/`：上传的图片、视频和其他文件

如果你重新部署代码，但保留 `data/` 目录，业务数据会继续存在。

## 后台运行

推荐用 `pm2`：

```bash
pnpm add -g pm2
pm2 start server/app.mjs --name flowing-light-notes
pm2 save
pm2 startup
```

如果需要指定环境变量：

```bash
PORT=3001 HOST=0.0.0.0 pm2 start server/app.mjs --name flowing-light-notes
```

## Nginx 反向代理示例

如果你想通过 80 端口访问，可以加一层 Nginx：

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

## 更新部署

```bash
git pull origin develop
pnpm install --frozen-lockfile
pnpm build
pm2 restart flowing-light-notes
```

如果不是用 `pm2`，重启你自己的进程管理服务即可。
