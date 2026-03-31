# 语雀笔记 (Yuque Notes) 项目上下文

## 项目概述

这是一个**类语雀的在线协作文档系统**，基于 React + TypeScript + Vite 构建。项目支持个人笔记管理、团队空间协作、文件管理、富文本编辑等功能。

### 技术栈

- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite 6
- **UI 组件**: shadcn/ui (Radix UI + Tailwind CSS)
- **路由**: React Router v6
- **状态管理**: React Hooks (useState, useEffect, useCallback 等)
- **富文本编辑器**: TipTap
- **后端服务**: Node.js (Express/Koa 风格，自定义实现)
- **数据库**: SQLite (通过 `data/app.db`)
- **包管理器**: pnpm

### 项目架构

```
yuque-notes/
├── src/                    # 前端源代码
│   ├── components/         # React 组件
│   │   ├── RichTextEditor.tsx   # TipTap 富文本编辑器
│   │   ├── FileManagerGallery.tsx  # 文件管理
│   │   ├── TeamWorkspacePanel.tsx  # 团队空间面板
│   │   ├── ShareCenterPanel.tsx    # 分享中心
│   │   └── ...
│   ├── lib/                # 工具库和 API 服务
│   │   ├── authApi.ts      # 认证服务
│   │   ├── databaseApi.ts  # 数据库 API
│   │   ├── documentsApi.ts # 文档 API
│   │   ├── servicesApi.ts  # 评论/待办服务
│   │   └── types.ts        # TypeScript 类型定义
│   ├── pages/              # 页面组件
│   └── App.tsx             # 主应用组件
├── server/                 # 后端服务
│   ├── app.mjs             # 主服务器入口
│   ├── db.mjs              # 数据库操作
│   └── utils.mjs           # 工具函数
├── data/                   # 数据目录 (Git 忽略)
│   ├── app.db              # SQLite 数据库
│   └── files/              # 上传的文件
├── scripts/                # 构建脚本
├── dist/                   # 生产构建输出
└── public/                 # 静态资源
```

## 核心功能

### 1. 文档管理
- 树形结构的文档组织（支持文件夹）
- 富文本编辑（TipTap，支持表格、任务列表、图片等）
- 自动保存（1.2 秒防抖）
- 文档收藏/取消收藏
- 文档重命名、移动、删除
- 回收站功能

### 2. 团队协作
- 团队空间创建和管理
- 成员加入申请与审批
- 资源级权限控制（查看/编辑/删除）
- 团队分享功能

### 3. 文件管理
- 文件上传和预览
- 文件与文档关联
- 文件画廊视图

### 4. 分享功能
- 私有/团队/公开三种可见性
- 公开分享链接（匿名访问）
- 团队分享（需登录 + 授权）

### 5. 评论与待办
- 文档评论系统
- 待办事项管理

## 构建和运行

### 环境要求
- Node.js 20+
- pnpm 8+

### 安装依赖
```bash
pnpm install --prefer-offline
```

### 开发模式
```bash
# 启动完整开发环境（前端 + 后端）
pnpm dev

# 仅启动前端 Vite 开发服务器
pnpm dev:client

# 仅启动后端服务
pnpm dev:server
```

开发服务器代理配置（`vite.config.ts`）：
- `/api` -> `http://127.0.0.1:3001`
- `/uploads` -> `http://127.0.0.1:3001`

### 生产构建
```bash
# 标准构建
pnpm build

# 生产模式构建（启用 source identifier 插件）
pnpm build:prod
```

### 启动服务
```bash
# 默认端口 3001，监听 0.0.0.0
pnpm start

# 指定端口和主机
PORT=3001 HOST=0.0.0.0 pnpm start
```

### 其他命令
```bash
pnpm lint          # ESLint 检查
pnpm preview       # 预览生产构建
pnpm clean         # 清理依赖
```

## 开发约定

### 代码风格
- 使用 TypeScript 严格模式
- 函数组件 + Hooks 范式
- 使用 `@/` 别名指向 `src/` 目录
- Tailwind CSS + shadcn/ui 组件库

### 目录约定
- `src/components/` - 可复用的 UI 组件
- `src/pages/` - 页面级组件
- `src/lib/` - 工具函数和 API 服务
- `server/` - 后端服务代码（.mjs 格式）

### 状态管理
- 使用 React Hooks 管理本地状态
- URL 参数同步应用状态（`useSearchParams`）
- 服务层封装 API 调用（`authService`, `documentService` 等）

### 路由结构
| 路径 | 组件 | 说明 |
|------|------|------|
| `/` | `App` | 主工作区 |
| `/public` | `PublicLibraryStandalone` | 公开资源列表 |
| `/share/:token` | `SharePageAccess` | 分享页面访问 |
| `/spaces/:teamId/manage` | `SpaceManagementWorkspacePage` | 团队管理 |
| `/spaces/:teamId/recycle` | `SpaceRecyclePage` | 回收站 |

### URL 参数约定
- `tab` - 当前标签页 (`docs` | `files` | `star` | `teams` | `public`)
- `doc` - 文档 ID
- `team` - 团队 ID
- `comments` - 是否显示评论 (`1` | `0`)
- `todos` - 是否显示待办 (`1` | `0`)
- `file` - 文件 ID
- `folder` - 文件夹 ID

## 数据模型

### 核心表结构
- `users` - 用户表
- `documents` - 文档表（含 `team_id` 字段）
- `files` - 文件表（含 `team_id` 字段）
- `teams` - 团队表
- `team_members` - 团队成员表
- `resource_permissions` - 资源权限表
- `share_links` - 分享链接表
- `comments` - 评论表
- `todos` - 待办事项表

### 权限模型
- **private**: 仅资源所有者可见
- **team**: 需登录 + 属于团队 + 资源级授权
- **public**: 匿名 token 访问，出现在公开列表

## 部署

详见 [`DEPLOY.md`](./DEPLOY.md)：

### PM2 部署
```bash
pnpm add -g pm2
pm2 start server/app.mjs --name flowing-light-notes
pm2 save
pm2 startup
```

### Nginx 反向代理
```nginx
server {
    listen 80;
    client_max_body_size 200m;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 相关文件

- [`README.md`](./README.md) - Vite + React 模板说明
- [`DEPLOY.md`](./DEPLOY.md) - 部署指南
- [`TEAM_SHARING_PLAN.md`](./TEAM_SHARING_PLAN.md) - 团队分享权限一期方案
- [`TEAM_SHARING_TODO.md`](./TEAM_SHARING_TODO.md) - 待办事项列表
- [`package.json`](./package.json) - 依赖和脚本配置
- [`vite.config.ts`](./vite.config.ts) - Vite 配置（含代理）
- [`tailwind.config.js`](./tailwind.config.js) - Tailwind CSS 配置
- [`components.json`](./components.json) - shadcn/ui 配置
