# 团队分享权限一期方案（资源级单独授权）

## 摘要
一期先把“团队查看”真正落地，并作为后续私有、公开、个人空间权限体系的基础。范围覆盖笔记和文件两类资源，权限核心是“资源级单独授权”：某个笔记或文件分享给团队后，再对该团队中的成员逐个勾选 `查看 / 编辑 / 删除` 权限。团队访问必须“登录 + 属于该团队 + 在该资源授权名单内满足权限”，私有资源仅所有者可见，公开资源继续保留匿名 token 访问，并新增公开列表页。

当前系统的问题是：`private | team | public` 只是字符串，后端没有团队模型、没有成员关系、没有鉴权、没有资源可见性过滤。因此一期必须先补齐团队与授权数据结构，再把所有文档、文件、分享接口接入统一权限判断。

## 关键变更

### 1. 数据模型
新增团队与资源授权相关表：

- `teams`
  - `id`, `name`, `owner_user_id`, `created_at`, `updated_at`
- `team_members`
  - `id`, `team_id`, `user_id`, `status` (`pending|approved|rejected`), `created_at`, `updated_at`
- `resource_permissions`
  - `id`, `team_id`, `resource_type` (`document|file`), `resource_id`, `member_user_id`, `can_view`, `can_edit`, `can_delete`, `created_at`, `updated_at`
  - 每条记录表示“某团队内某成员对某个资源的单独授权”
- 资源归属字段
  - `documents.team_id` nullable
  - `files.team_id` nullable
- 分享字段补强
  - `share_links.team_id` nullable
  - `visibility='team'` 时，`team_id` 必填
  - `visibility='public'` 时，`team_id` 可为空或保留资源归属团队信息
  - `document_id` / `file_id` 二选一保持不变

约束与默认：

- 每个笔记、文件只能归属“个人空间”或“一个团队”
- 团队资源必须配置资源级授权后，团队成员才可访问
- 申请加入团队通过后，默认仅具备“可被分配查看权限”的资格；不会自动拿到任意资源访问权

### 2. 后端接口与鉴权
补最小可用鉴权层，前端请求带当前用户标识，后端统一解析当前用户并执行权限判断。建议新增统一帮助函数：

- `getCurrentUser(req)`
- `canViewDocument(userId, documentId)`
- `canEditDocument(userId, documentId)`
- `canDeleteDocument(userId, documentId)`
- `canViewFile(userId, fileId)`
- `canManageTeam(userId, teamId)`
- `canApproveJoinRequest(userId, teamId)`

新增或调整 API：

- 团队
  - `GET /api/teams`
  - `POST /api/teams`
  - `GET /api/teams/:id`
  - `GET /api/teams/:id/members`
  - `POST /api/teams/:id/join-requests`
  - `GET /api/teams/:id/join-requests`
  - `POST /api/teams/:id/join-requests/:requestId/approve`
  - `POST /api/teams/:id/join-requests/:requestId/reject`
- 资源授权
  - `GET /api/teams/:id/resource-permissions`
    - 支持 `resourceType`、`resourceId`、`query` 过滤，供成员搜索与批量修改使用
  - `PUT /api/teams/:id/resource-permissions/batch`
    - 一次提交某资源对多个成员的 `can_view / can_edit / can_delete`
- 分享
  - `POST /api/share-links`
    - 创建团队分享时必须携带 `team_id`
  - `GET /api/share-links/token/:token`
    - 返回 link 基本信息前先执行权限校验
- 公开列表
  - `GET /api/public/documents`
  - `GET /api/public/files`

必须重做权限过滤的现有接口：

- `GET /api/documents`
  - 只返回当前用户可见文档
- `GET /api/documents/:id`
  - 未授权返回 `403`
- `PATCH /api/documents/:id`
  - 仅所有者或被勾选 `can_edit` 的成员可修改
- `DELETE /api/documents/:id`
  - 仅所有者或被勾选 `can_delete` 的成员可删除
- `GET /api/files`
  - 只返回当前用户可见文件
- `GET /api/files/:id`
  - 未授权返回 `403`
- `PATCH /api/files/:id`
  - 仅所有者或被勾选 `can_edit` 的成员可改
- `DELETE /api/files/:id`
  - 仅所有者或被勾选 `can_delete` 的成员可删

### 3. 权限规则
私有、团队、公开三条链路统一为后端判定：

- `private`
  - 仅资源所有者可见
  - 不对其他用户开放
- `team`
  - 必须登录
  - 当前用户必须是该团队已批准成员
  - 当前用户必须在该资源的 `resource_permissions` 中有对应权限
  - 查看分享页至少要求 `can_view = true`
- `public`
  - 匿名 token 可只读访问
  - 同时出现在公开列表
  - 公开只放开查看，不放开编辑、删除

资源归属与分享关系：

- 个人资源不能直接做团队分享；要做团队分享，先把资源归属到某团队
- 团队资源可设置为 `team` 或 `public`
- 团队资源的实际访问权限以“成员授权表”为准，不以团队成员身份自动放开
- 资源所有者默认拥有全部权限，不依赖授权表

### 4. 前端交互
团队功能第一版需要以下页面与流程：

- 团队中心
  - 创建团队
  - 查看我创建、我加入的团队
  - 申请加入团队
- 团队管理页
  - 团队创建者查看待审批申请
  - 审批通过、拒绝申请
  - 成员列表支持搜索
- 资源分享弹窗
  - 笔记与文件统一支持 `私有 / 团队 / 公开`
  - 选“团队”后必须选择具体团队
  - 进入“成员授权”面板，对该资源搜索成员并批量勾选 `查看 / 编辑 / 删除`
- 查看页
  - 未登录访问团队分享：提示先登录
  - 已登录但不在团队或未被授权：提示无权限
  - 已授权：正常只读展示
- 公开页
  - 新增公开笔记列表和公开文件列表
  - 点击后进入公开查看页或现有分享页

前端服务接口需要扩展：

- `teamService`
- `teamMemberService`
- `resourcePermissionService`
- `shareService.createShareLink` 增加 `teamId`
- 文档、文件列表 API 调用依赖后端过滤，不再前端自行假定全量可见

## 测试与验收

### 核心场景
- 用户 A 创建团队，用户 B 申请加入，A 审批通过。
- B 加入团队后默认不能访问任何团队资源，除非 A 在某个资源上勾选了 `查看`。
- A 创建团队归属的笔记，给 B 勾选 `查看`，B 登录后可查看。
- A 未给 B 勾选 `查看`，即使 B 属于该团队且拿到链接，也返回 `403`。
- A 给 B 勾选 `编辑` 后，B 可编辑该笔记；未勾选时编辑接口返回 `403`。
- A 给 B 勾选 `删除` 后，B 可删除对应资源；未勾选时删除接口返回 `403`。
- 团队文件与笔记遵循同一套规则。
- 非团队成员拿到 `team` token 也不能访问。
- `public` 资源匿名 token 可看，且出现在公开列表。
- `private` 资源仅所有者本人可见，不出现在其他人的列表中。

### 边界场景
- 成员被移出团队后，之前所有该团队资源授权立即失效。
- 资源从团队转回个人空间时，相关团队授权失效或清理。
- 分享链接存在但资源已删除、改私有、改归属团队时，应立即按新状态校验。
- 同一用户加入多个团队，只能访问被明确授权的对应团队资源。
- 批量修改成员权限后，权限立即生效。
- 团队创建者删除团队前，必须处理团队资源归属迁移或禁止删除。

## 假设与默认
- 团队创建者是团队唯一管理者；一期不做固定角色体系，审批、成员授权、团队管理都由创建者负责。
- 团队成员加入方式为申请审批。
- 申请通过后默认只获得“团队成员身份”，不自动获得任何资源级查看权。
- 资源授权粒度按“单个资源 -> 多个成员”维护，支持搜索成员和批量修改。
- 公开资源继续保留匿名 token，同时新增公开列表页。
- 一期不做团队会话切换、不做邀请链接、不做操作审计、不做公开评论。
