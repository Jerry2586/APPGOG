# APPGOG 双系统架构与项目骨架

版本：1.0  
状态：第 2 阶段已完成，等待产品负责人验收  
依据：`docs/01-REQUIREMENTS-BASELINE.md`

## 1. 架构结论

APPGOG 是独立的主题扩展系统，Xboard 是外部黑盒。两者没有数据库、API、身份、Cookie 或内部网络连接。

```text
┌────────────────────────────── 用户浏览器 ──────────────────────────────┐
│                                                                        │
│  www.domain.com                                                        │
│  APPGOG Vue 前台                                                       │
│       │                                                                │
│       │ HTTPS JSON（唯一 API 通道）                                    │
│       ▼                                                                │
│  api.domain.com:3000                                                   │
│  APPGOG NestJS API ── PostgreSQL / Redis / 对象存储 / AI 模型供应商    │
│                                                                        │
│  登录、注册、套餐、面板、工单按钮                                      │
│       │                                                                │
│       └──────── 普通 HTTPS 页面跳转 ────────► panel.domain.com         │
│                                              Xboard 黑盒                │
└────────────────────────────────────────────────────────────────────────┘
```

### 绝对禁止的连接

```text
APPGOG Web  ─X─► Xboard API
APPGOG API  ─X─► Xboard API
APPGOG API  ─X─► Xboard Database
Xboard      ─X─► APPGOG Database
APPGOG      ─X─► Xboard Cookie / Session / SSO
AI          ─X─► Xboard 用户与业务数据
```

允许的唯一关系是用户点击一个普通 HTTP/HTTPS 链接后离开 APPGOG 页面。

## 2. 运行单元

| 单元 | 技术 | 默认端口 | 职责 |
|---|---|---:|---|
| `apps/web` | Vue 3、TypeScript、Vite | 5173/80 | APPGOG 官网、公开页面、后台 UI 和 JSON 页面渲染器。 |
| `apps/api` | NestJS、TypeScript | 3000 | APPGOG 管理 API、公开 API、CMS、AI、主题和调度。 |
| PostgreSQL | PostgreSQL 16 + pgvector | 5432（仅开发暴露） | 只保存 APPGOG 独立数据。 |
| Redis | Redis 7 | 6379（仅开发暴露） | 缓存、限流和异步任务；不能保存 Xboard Session。 |
| Xboard | 外部黑盒 | 80/443 | 核心用户和交易业务；不属于本仓库进程。 |

`apps/web` 使用一个前端工程承载公开站点和管理后台，原因是编辑器预览与公开渲染必须共享同一组件注册表和渲染器。生产构建必须按路由懒加载，避免管理后台进入公开首屏包。

## 3. 域名与网络边界

### 生产建议

| 域名 | 目标 | 说明 |
|---|---|---|
| `www.domain.com` | APPGOG Web | 公开站点和 `/admin` 管理入口。 |
| `api.domain.com` | APPGOG API:3000 | 唯一数据 API。 |
| `panel.domain.com` | Xboard | 外部黑盒，仅作为跳转目标。 |

### Cookie 与认证

- APPGOG 管理员认证只属于 APPGOG 管理后台。
- APPGOG 管理员不是 Xboard 用户。
- 管理 Cookie/JWT 的作用域不得覆盖 `panel.domain.com`。
- APPGOG 不接收、转发或解析 Xboard Cookie。
- 公开站点、CMS、AI 和独立商城不依赖 Xboard 登录态。

## 4. 应用内部模块边界

```text
apps/api/src
├─ platform/        配置、日志、错误、健康检查
├─ admin-auth/      APPGOG 管理员认证（第 4 阶段）
├─ pages/           路由、页面、版本与发布（第 5 阶段）
├─ media/           上传和对象存储
├─ cms/             分类、文章、FAQ、视频（第 8 阶段）
├─ catalog/         非流量独立商品（第 9 阶段）
├─ ai/              RAG 与模型网关（第 10 阶段）
├─ themes/          主题、营销和调度（第 11 阶段）
├─ plugins/         第三方代码与审计（第 11 阶段）
└─ outbound-links/  Xboard 普通跳转 URL 配置；不得发起网络请求

apps/web/src
├─ app/             路由、启动、全局状态
├─ renderer/        JSON 页面渲染器
├─ editor/          拖拽编辑器
├─ components/      注册组件
├─ admin/           APPGOG 管理后台页面
├─ site/            官网壳和公开页面
└─ shared/          API 客户端、类型和安全工具
```

现有文件将在对应功能阶段按以上目标目录逐步归位；第 2 阶段不提前重写业务模块。

## 5. 数据流

### 页面访问

```text
浏览器 GET /some-page
→ Vue 路由读取 slug
→ GET api.domain.com/api/v1/public/pages/:slug
→ API 查询 APPGOG PostgreSQL
→ 返回已发布 JSON 组件树
→ 注册表校验组件
→ Vue 递归渲染
```

### Xboard 跳转

```text
后台配置 panel.domain.com 的普通页面 URL
→ API 作为公开设置返回
→ 前台渲染 <a target="_blank" rel="noopener noreferrer">
→ 用户点击后浏览器访问 Xboard
```

APPGOG 服务器不对该 URL 发起请求。

### AI

```text
浏览器问题
→ APPGOG API
→ APPGOG CMS 向量库
→ 配置的大模型供应商
→ 有引用的答案
```

AI 上下文不得包含 Xboard 用户、套餐、订单、流量、节点或工单数据。

## 6. 配置分类

### 服务端私密配置

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `OPENAI_API_KEY`
- AI 模型与服务地址

### 公开或业务配置

- APPGOG 前台和管理后台 Origin
- Xboard 基础站点 URL 及登录、注册、购买、面板、工单路径
- Logo、备案、社交和联系方式

Xboard 配置只能被用于拼装或校验普通跳转链接。

明确不存在：

- `XBOARD_DATABASE_URL`
- `XBOARD_API_KEY`
- `XBOARD_SSO_SECRET`
- `XBOARD_SESSION_SECRET`
- Xboard 用户 Token

## 7. 仓库骨架

```text
APPGOGCMS/
├─ apps/
│  ├─ api/                 APPGOG 3000 端口后端
│  └─ web/                 APPGOG Vue 前台和管理后台
├─ packages/
│  └─ contracts/           无运行时依赖的共享 API/边界类型
├─ docs/
│  ├─ 01-REQUIREMENTS-BASELINE.md
│  └─ 02-SYSTEM-ARCHITECTURE.md
├─ scripts/
│  └─ check-boundaries.mjs 自动越界检查
├─ deploy/
│  └─ nginx.conf
├─ docker-compose.yml      本地开发依赖与应用
├─ Dockerfile.api
├─ Dockerfile.web
└─ .env.example
```

## 8. 架构守卫

每次构建和持续集成都必须执行：

```text
pnpm verify
```

该命令按固定顺序执行 Prisma 客户端生成、隔离边界检查、TypeScript/Vue 类型检查、生产构建和测试。

边界检查至少拒绝：

- SSO 和 Xboard 用户映射字段
- Xboard 密钥、Token 或数据库配置
- 浏览器端 Xboard API 调用
- Xboard SDK 或数据库客户端依赖
- 被删除的活动中心模块

## 9. 部署原则

- API 容器固定监听 `0.0.0.0:3000`。
- PostgreSQL 和 Redis 只加入 APPGOG 私有容器网络。
- 生产数据库和 Redis 不公开映射至互联网。
- Nginx 只把 `/api/` 代理至 APPGOG API。
- Nginx 不代理 `panel.domain.com`，也不代理任何 Xboard API。
- Xboard 部署、数据库和备份不纳入本仓库。

## 10. 第 2 阶段验收标准

| ID | 验收项 | 标准 |
|---|---|---|
| ARCH-001 | 架构文档 | 双系统、端口、信任区、数据流和目录职责完整。 |
| ARCH-002 | 环境模板 | 不存在 SSO、Xboard API 或数据库密钥。 |
| ARCH-003 | 代码骨架 | Web、API 和共享 contracts 包职责明确。 |
| ARCH-004 | 自动守卫 | 边界检查脚本能够阻止已排除功能重新进入代码。 |
| ARCH-005 | 越界清理 | 旧 SSO 端点、回调、映射字段和文档全部移除。 |
| ARCH-006 | 构建 | Prisma 生成、TypeScript 和前后端生产构建通过。 |
| ARCH-007 | Xboard 行为 | 代码中只保留可配置普通 URL，不存在服务器端 Xboard 请求。 |

第 2 阶段通过后才能开始第 3 阶段数据库设计与迁移。
