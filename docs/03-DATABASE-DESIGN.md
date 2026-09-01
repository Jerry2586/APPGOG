# APPGOG 独立数据库设计与迁移基线

版本：1.0  
状态：第 3 阶段已完成，等待产品负责人验收  
依据：`docs/01-REQUIREMENTS-BASELINE.md`、`docs/02-SYSTEM-ARCHITECTURE.md`

## 1. 结论与边界

APPGOG 使用独立 PostgreSQL 16 数据库，启用 pgvector。该数据库只保存 APPGOG 页面、CMS、非流量商品、AI 索引、主题、营销、插件和管理数据。

数据库中明确不存在以下数据：

- Xboard 用户、余额、订单、支付、套餐、订阅和流量；
- Xboard 节点、邀请、佣金和工单；
- Xboard Cookie、Session、Token、用户映射或数据库连接信息；
- 签到、盲盒、抽奖和活动奖励。

`OutboundLink` 只保存浏览器可访问的普通 HTTP/HTTPS 页面 URL。它禁止查询参数和 URL 片段，不承载令牌、用户 ID 或任何业务数据。

## 2. 技术约束

| 项目 | 决定 |
|---|---|
| 数据库 | PostgreSQL 16 |
| ORM | Prisma 6 |
| 向量 | pgvector，当前固定 1536 维 |
| 时间 | 全部业务时间使用 `TIMESTAMPTZ(3)`，服务端按 UTC 存储 |
| 主键 | 应用生成 CUID；迁移保留数据时使用带前缀 UUID 文本 |
| JSON | 页面组件树、主题变量和组件配置使用 JSONB |
| 全文检索 | CMS 生成 `tsvector`，使用 GIN 索引 |
| 迁移 | Prisma 顺序迁移；禁止上线后修改已执行迁移 |

数据库运行账户必须能在首次部署时创建 `vector`、`pgcrypto` 和 `btree_gist` 扩展；生产环境也可以由 DBA 预先创建扩展后再使用低权限应用账户。

## 3. 领域关系

```text
AdminUser ──< AdminSession
     │
     ├──< PageVersion >── Page ── draftVersion / publishedVersion
     ├──< PluginSnippetVersion >── PluginSnippet
     └──< AuditLog

Category(CONTENT) ──< Content ──< KnowledgeChunk
                              └──< KnowledgeIndexJob

Category(PRODUCT) ──< Product

Theme ──< ThemeSchedule
MarketingCampaign
GlobalSetting
OutboundLink
```

`AdminUser` 仅代表 APPGOG 后台管理员。Xboard 用户不进入该关系图。

## 4. 核心表

| 表 | 作用 | 关键约束 |
|---|---|---|
| `AdminUser` | APPGOG 管理员 | 邮箱大小写不敏感唯一；无普通前台用户角色 |
| `AdminSession` | 后台可撤销会话 | 只存 Token 哈希；必须有过期时间 |
| `Page` | 路由、状态和 SEO | slug 唯一；重定向必须是 HTTP/HTTPS |
| `PageVersion` | 不可覆盖的 JSON 组件树版本 | `(pageId, version)` 唯一；布局必须是数组 |
| `MediaAsset` | APPGOG 自有图片元数据 | 存储键、MIME、大小和 SHA-256 受约束；归档不删除字节 |
| `Category` | 无限级内容/商品分类 | 业务域与 slug 联合唯一；触发器阻止自引用和循环 |
| `Content` | 文章、视频和 FAQ | FAQ 问答结构化；发布视频要求 HTTP/HTTPS 地址 |
| `KnowledgeChunk` | RAG 文档分块 | `(contentId, chunkIndex)` 唯一；向量 1536 维 |
| `KnowledgeIndexJob` | 重建索引任务记录 | 状态、重试次数和错误可追踪 |
| `Product` | 非流量独立商品 | 价格/库存非负；发布快照与草稿隔离；发布外购 URL 必须 HTTP/HTTPS |
| `Theme` | CSS 变量和动效 | 数据库保证最多一个活动主题 |
| `ThemeSchedule` | 主题时间调度 | 结束晚于开始；启用时间段不得重叠 |
| `MarketingCampaign` | 弹窗、倒计时和横幅 | 时间窗有效；类型使用枚举 |
| `GlobalSetting` | APPGOG 全局 JSON 设置 | 明确区分公开与私密配置 |
| `PluginSnippet` | 延迟加载的插件代码 | 延迟不得低于 3000ms；位置使用枚举 |
| `PluginSnippetVersion` | 插件代码历史版本 | 可审计、比较和回退 |
| `OutboundLink` | Xboard/外部普通页面跳转 | 种类唯一；禁止查询参数和片段 |
| `AuditLog` | 管理行为审计 | 数据库触发器禁止更新和删除 |

## 5. 页面草稿与发布

页面正文不直接覆盖保存在 `Page` 中：

1. 每次保存草稿新增一条 `PageVersion`，版本号在单页内递增。
2. `Page.draftVersionId` 指向最新草稿。
3. 发布时只把 `publishedVersionId` 指向已确认的草稿版本。
4. 后续编辑只改变草稿引用，线上发布版本保持不变。
5. 数据库触发器校验草稿和发布版本必须属于同一个页面。

这满足“编辑草稿不影响线上版本”和“可版本回退”的数据前提。

## 6. 生命周期与删除规则

- 页面、内容和商品统一使用 `DRAFT / PUBLISHED / OFFLINE / ARCHIVED`。
- 只有 `PUBLISHED` 且具备发布时间的数据可以公开查询。
- 删除内容会级联删除知识分块和索引任务。
- 删除页面会级联删除页面版本。
- 有子分类时禁止直接删除父分类；必须先移动或删除子分类。
- 删除管理员只会使审计记录的管理员引用变空，不删除审计事实。
- 审计日志为追加写；数据库拒绝 UPDATE 和 DELETE。
- 媒体资源使用可恢复归档；已发布页面仍可读取原 URL，物理清理必须经过单独引用审计。

## 7. 数据完整性守卫

正式迁移包含以下数据库级守卫，而不是只依赖前端表单：

- 页面路由、发布状态、JSON 数组及版本归属校验；
- 分类循环检测；
- FAQ 结构、视频 URL、商品 URL、普通外跳 URL 校验；
- 商品金额、对比价、库存、销量、币种和相册结构校验；
- CMS 全文 GIN 索引和知识分块 HNSW 向量索引；
- 单一活动主题和主题调度时间冲突约束；
- 营销时间窗与插件最短延迟约束；
- 审计日志不可变触发器；
- 管理员邮箱、slug、版本号和业务类型的唯一索引。
- 媒体存储键、MIME 白名单、大小、尺寸、哈希和文件夹格式约束。

## 8. 迁移路径

迁移顺序：

1. `20260829000000_init`：保留现有原型基础表。
2. `20260829030000_stage3_data_model`：无损迁移至正式第 3 阶段结构。
3. `20260829040000_stage4_admin_security`：管理员会话、登录限流及安全约束。
4. `20260829050000_stage5_page_engine`：不可变页面版本、线上路由和并发控制。
5. `20260829070000_stage7_media_library`：媒体资产元数据和数据库级上传约束。
6. `20260831080000_stage8_cms`：内容/分类 revision、独立公开内容快照/路由/搜索文本/哈希、索引任务公开哈希；schemaVersion 更新为 8。
7. `20260831090000_stage9_catalog`：非流量商品 ProductKind、revision、publishedSlug、publishedSnapshot、公开金额/销量排序字段与索引；schemaVersion 更新为 9。
8. `20260831100000_stage10_ai_rag`：AI 专用配置/持久计数、索引配置指纹、唯一活动任务、到期队列与租约字段；schemaVersion 更新为 10。

第十阶段补充：新增单例 AiConfiguration（版本、问答/全局客服/自动入队开关、检索和限流数值边界）与 AiRateBucket（分钟访客 HMAC/全局计数、UTC 每日模型调用额度、到期索引）。不保存问答正文、原始 IP、模型密钥或前台用户身份；过期计数在处理器对账中清理，暂停处理器时过期数据仍保留但不再参与新时间窗计数。

KnowledgeChunk/KnowledgeIndexJob 新增 indexProfile，隔离端点/向量模型/维度不同的向量。KnowledgeIndexJob 使用 activeKey 唯一索引限制每篇一个活动任务，availableAt 排队，leaseToken/leaseUntil 认领；RUNNING 必须有有效租约字段，成功必须有开始/完成时间。发布与队列原子入库，处理器最终提交前重新校验快照哈希/公开状态及租约所有权；失败重试上限 3 次。迁移保留旧分块/任务，把旧版无租约的 PENDING/RUNNING 标记失败，旧开关导入 AiConfiguration。部署前必须停旧处理器，禁止新旧逻辑混跑；不得把内存 fixture 当作真实 SQL、约束或并发验收。详见 10-AI-RAG.md。

第九阶段补充：Product 的 kind 仅允许 ACCOUNT、SERVICE、DEVICE、OTHER；旧商品回填 OTHER，不推断商品类型。已发布旧商品在同一事务中回填全部公开字段及 publishedPrice/publishedSales，不删除旧资料、不自动下架。未发布草稿允许空外购链接，发布快照必须有 HTTP/HTTPS 外链。publishedSlug 独立唯一，公开价格与销量建立复合索引，金额仍为 DECIMAL(12,2)。完整库存、销量、币种、相册数组等原约束保留；服务层另外执行 HTTP/HTTPS URL、金额精度、相册数量/唯一性和 PRODUCT 分类域校验。所有商品变更使用修订号检查及串行化事务，与审计一起提交。修改草稿不改公开字段；下线/归档清除 publishedSlug，保留旧公开快照以便恢复和引用保护。商品删除接口为可恢复归档，不开放物理删除；没有新增订单、支付、预留库存、前台会员或共享账号表。

第八阶段补充：CMS 删除接口现在执行可恢复归档，数据库物理级联规则并不代表开放物理删除接口。分类删除还检查草稿和保留的公开快照引用。原 FAQ/视频约束从草稿字段迁移到公开快照字段，以允许不完整草稿而不影响线上内容。发布路由有独立唯一索引；原草稿全文索引保留，但公开搜索不使用它，避免泄露未发布资料。

新增迁移在事务内回填原已发布内容，不删除旧资料。如果已发布旧 VIDEO 不是 m3u8，预检主动失败，不擅自改地址或下线；须由内容负责人修正地址或确认下线后重试。迁移必须先在真实临时库按下述流程验证，内存 HTTP 测试不能替代 SQL/事务隔离验收。

第 3 阶段数据模型迁移会保留已有 APPGOG 数据：

- 原 `User` 管理员迁入 `AdminUser`，缺少凭证的记录自动禁用；
- 原页面 `layout/draftLayout` 转换为独立 `PageVersion`；
- 原 FAQ 正文迁入结构化问题与答案字段；
- 原知识分块补齐顺序、内容哈希和更新时间；
- 原插件代码保存为第一个 `PluginSnippetVersion`；
- 原审计管理员引用迁移到 `adminUserId`。

生产执行前必须：

1. 对 APPGOG 数据库做可恢复备份；
2. 在同版本 PostgreSQL 的临时库恢复备份；
3. 在临时库运行 `pnpm db:deploy`；
4. 运行 `pnpm verify` 和 API 冒烟测试；
5. 验证通过后才允许生产执行。

禁止把 Xboard 数据库作为 `DATABASE_URL`，也禁止在迁移脚本中引用 Xboard 表。

## 9. 安全初始化

### 第十一阶段增量迁移

`20260831110000_stage11_operations` 为 Theme、ThemeSchedule、MarketingCampaign、PluginSnippet 增加正整数 revision；调度与营销增加 timezone。时间字段继续使用 TIMESTAMPTZ(3)，IANA 时区作为运营输入/显示元数据，不重复计算偏移。

新增单例 ThemeState（id 固定 main，defaultThemeId 可空并外键引用 Theme、删除 RESTRICT，revision 用于默认主题并发保护）。迁移将原 active 主题保存为默认值。Theme.active 仍受原唯一部分索引约束；调度仍使用原 GiST 排斥约束，全局拒绝已启用的重叠 `[start,end)`。

PluginSnippet.revision 从最大历史版本初始化。迁移保留全部旧代码与历史，但对原已启用插件追加迁移审计、递增 revision 并创建不可变停用版本，再关闭执行，等待超级管理员复核后重新启用。不得将迁移前的未经审查代码自动带入新加载器。此行为尚未在真实数据库执行；先备份并在副本演练。

运营接口的保存、删除、主题选择、插件版本追加、回退、停用与审计都在 Serializable 事务中完成；审计失败时回滚。公开主题实时按时间窗计算，后台每15秒和启动时把 active 标记对齐，只在实际切换时记录系统审计。默认主题及任何调度引用的主题不可删除；插件不提供删除接口，以保留版本历史。种子 schemaVersion 更新为11。

种子脚本不再提供默认弱口令。首次执行必须提供至少 16 位的 `ADMIN_INITIAL_PASSWORD`。外跳地址按独立环境变量提供，未配置就不写入占位数据，也不会凭空猜测正式地址。

## 10. 第 3 阶段验收标准

| ID | 验收项 | 标准 |
|---|---|---|
| DB-001 | 完全隔离 | Schema 和迁移不存在 Xboard 核心业务表、连接或身份映射 |
| DB-002 | 页面版本 | 草稿、发布和历史版本独立，具备数据库归属校验 |
| DB-003 | CMS | 文章、富文本/Markdown、FAQ、视频、SEO 和全文索引字段完整 |
| DB-004 | 分类 | 内容/商品域明确，无限树具备防循环约束 |
| DB-005 | AI | 分块、向量、模型、哈希和索引任务可追踪 |
| DB-006 | 独立商品 | 商品资料、库存、销量、相册和外购 URL 完整且有约束 |
| DB-007 | 主题营销插件 | 唯一主题、调度冲突、时间窗、延迟和版本回退结构完整 |
| DB-008 | 管理与审计 | 独立管理员、可撤销会话和不可变审计结构完整 |
| DB-009 | 迁移 | 原型数据有明确转换路径，Prisma Schema 可验证和生成 |
| DB-010 | 自动检查 | `pnpm verify:database` 和全项目 `pnpm verify` 通过 |

第 3 阶段通过后才能进入第 4 阶段 APPGOG 管理认证、安全和权限系统开发。
