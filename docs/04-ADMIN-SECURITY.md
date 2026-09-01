# APPGOG 管理认证、安全与权限

版本：1.0  
状态：第 4 阶段已完成，等待产品负责人验收  
依据：`docs/01-REQUIREMENTS-BASELINE.md`、`docs/02-SYSTEM-ARCHITECTURE.md`、`docs/03-DATABASE-DESIGN.md`

## 1. 阶段结论

第四阶段已建立 APPGOG 独立的管理员身份、短时访问令牌、可撤销会话、刷新令牌旋转、登录限流、密码策略、RBAC、安全审计和后台安全中心。

本认证系统只认证 `AdminUser`，与 Xboard 完全隔离：

- 不读取、不写入、不连接 Xboard 数据库。
- 不调用 Xboard API，不实施 SSO、OAuth、身份映射或共享 Session。
- APPGOG 管理员不是 Xboard 用户，两者账号和密码无任何同步关系。
- 刷新 Cookie 不设置共享 Domain，不可用于 Xboard 域名。

## 2. 认证流程

```text
管理员登录
→ 数据库限流检查
→ bcrypt cost 12 验证密码
→ 建立 AdminSession，数据库只保存刷新秘密 SHA-256 哈希
→ 浏览器内存保存 15 分钟访问令牌
→ host-only HttpOnly Cookie 保存刷新凭据
```

每次后台 API 请求不仅校验 JWT，还会查询 `AdminSession` 和 `AdminUser`，检查会话归属、撤销、过期、账号启用状态和当前角色。修改角色后旧会话立即撤销，不等待 JWT 自然过期。

刷新时使用 48 字节密码学随机数生成新秘密，通过常量时间哈希比较验证，并使用条件更新保证每个旧凭据只能使用一次。检测到重放会撤销整个会话并写入审计。

## 3. Cookie 和前端存储边界

| 项目 | 规则 |
|---|---|
| 访问令牌 | 只保存在 Vue 运行时内存；刷新页面后通过 Cookie 换取；不写 LocalStorage/SessionStorage |
| 刷新凭据 | `appgog_admin_refresh`，HttpOnly，SameSite=Strict，生产 Secure |
| Cookie 范围 | host-only，Path=`/api/v1/auth/admin`，不覆盖 Xboard |
| 访问令牌时效 | 固定 15 分钟 |
| 刷新会话时效 | 默认 7 天，`ADMIN_REFRESH_TTL_DAYS` 允许 1–30 天 |
| 缓存 | 认证响应使用 `Cache-Control: no-store` |

## 4. 登录与密码安全

- 登录失败按“标准化邮箱 + IP”的 SHA-256 键记录，不在限流表保存明文邮箱/IP 组合。
- 15 分钟窗口内失败 5 次后锁定 30 分钟，状态保存在 PostgreSQL，重启进程不会清除。
- 用户存在或不存在均执行 bcrypt 比较，并返回统一的“账号或密码错误”，减少账号枚举信号。
- 密码长度 16–128 位，大小写字母、数字、符号至少命中三类，拒绝常见弱口令片段和包含邮箱账号的密码。
- 密码使用 bcrypt cost 12 存储；修改或重置后撤销该账号全部会话。
- 种子脚本不提供默认密码，初始密码也执行相同强度策略。

## 5. 角色权限

| 能力 | VIEWER | EDITOR | ADMIN | SUPER_ADMIN |
|---|:---:|:---:|:---:|:---:|
| 读取页面/CMS/商品 | ✓ | ✓ | ✓ | ✓ |
| 新增、修改页面/CMS/商品 | — | ✓ | ✓ | ✓ |
| 删除页面/CMS/商品 | — | — | ✓ | ✓ |
| 主题、调度、营销、外跳配置 | — | — | ✓ | ✓ |
| 安全审计 | — | — | ✓ | ✓ |
| 全局私密设置、可执行插件 | — | — | — | ✓ |
| 管理员账号和他人会话 | — | — | — | ✓ |

后端 Guard 是权限的强制边界；前端菜单隐藏只是用户体验，不被当作授权依据。修改管理员角色/启用状态后会撤销旧会话。系统禁止停用自己或修改自己角色，并在串行化事务中保证不会删除最后一个启用的超级管理员。

## 6. 请求边界与审计

- 管理认证的 Cookie 端点执行精确 Origin 白名单；生产环境缺少 Origin 时也拒绝。
- CORS 只允许配置的 APPGOG Origin，并只开放所需方法及 `Content-Type`/`Authorization` 请求头。
- API 启用 Helmet 安全响应头。全局 DTO 校验拒绝未声明字段。
- 记录登录成功/失败、刷新重放、退出、会话撤销、密码变更和管理员账号变更。
- 审计不保存密码、明文刷新凭据或 JWT；登录失败只记录邮箱哈希。

## 7. 数据库变更

迁移 `20260829040000_stage4_admin_security` 执行以下无破坏性变更：

1. `AdminSession` 增加 `lastUsedAt`，用于安全中心展示会话活动时间。
2. 增加 `AdminLoginAttempt`，保存登录窗口、失败次数和锁定截止时间。
3. 增加失败次数和锁定时间数据库约束及查询索引。

生产部署前执行 `pnpm db:deploy`。

## 8. 验收矩阵

| ID | 验收项 | 结果 |
|---|---|---|
| SEC-001 | APPGOG 管理员与 Xboard 身份、Cookie、API、数据库完全隔离 | 通过 |
| SEC-002 | 无默认弱口令，初始/修改/重置密码执行统一策略 | 通过 |
| SEC-003 | 登录统一错误、时序减差和 PostgreSQL 持久限流 | 通过 |
| SEC-004 | 15 分钟 JWT 绑定服务端会话，撤销立即生效 | 通过 |
| SEC-005 | HttpOnly 刷新 Cookie 旋转、条件更新和重放检测 | 通过 |
| SEC-006 | 访问令牌不持久化到 LocalStorage/SessionStorage | 通过 |
| SEC-007 | VIEWER/EDITOR/ADMIN/SUPER_ADMIN 后端 RBAC 强制生效 | 通过 |
| SEC-008 | 全局设置和可执行插件仅 SUPER_ADMIN 可读写 | 通过 |
| SEC-009 | 管理员创建、启停、角色、密码、会话和最后超管保护 | 通过 |
| SEC-010 | Origin、CORS、Helmet、DTO 白名单和安全审计 | 通过 |
| SEC-011 | 后台安全中心可管理本人会话/密码，按角色展示账号/审计 | 通过 |
| SEC-012 | `pnpm verify:security`、类型检查、生产构建和自动测试 | 通过 |

## 9. 验证命令与环境边界

使用 `pnpm verify:security` 执行第四阶段安全静态守卫，使用 `pnpm verify` 执行全仓验证。

当前工作区未提供可连接的 PostgreSQL/Docker 运行时，因此本阶段完成了 Prisma 生成、Schema/迁移静态校验、类型检查、构建与单元测试，未伪造“已在真实 PostgreSQL 执行迁移”的结论。在提供数据库后，部署验收必须再执行 `pnpm db:deploy` 和真实 HTTP 认证流程。

第 4 阶段完成后在此停止；未收到明确指令前不进入第 5 阶段页面引擎开发。
