# APPGOG API 契约 v1

根路径为 `/api/v1`，JSON 编码。后台业务接口使用短时效 `Authorization: Bearer <access-token>`；刷新凭据只存放在服务端设置的 HttpOnly Cookie 中，不作为 JSON 返回。

## 健康与可观测性

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| `GET` | `/health` | 无 | 进程存活检查；返回 `service/status/timestamp/checks.process` |
| `GET` | `/health/ready` | 无 | 数据库就绪检查；PostgreSQL 不可用时返回 503 和 `checks.database=unavailable`，不泄露连接串或内部错误 |

反向代理为每个请求生成或转发最长 100 字符的安全 `X-Request-ID`。API 在响应头和错误 JSON 中返回同一 ID；服务端错误日志只记录请求 ID、方法、无查询参数路径及状态码，不记录请求正文、Cookie 或密钥。

## APPGOG 管理认证

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| `POST` | `/auth/admin/login` | 无 | APPGOG 独立管理员登录；设置刷新 Cookie，返回 15 分钟访问令牌 |
| `POST` | `/auth/admin/refresh` | 刷新 Cookie | 旋转刷新凭据并返回新访问令牌 |
| `POST` | `/auth/admin/logout` | 刷新 Cookie | 撤销当前会话并清除 Cookie |
| `GET` | `/auth/admin/me` | Bearer | 当前 APPGOG 管理员身份 |
| `GET` | `/auth/admin/sessions` | Bearer | 当前管理员的会话列表 |
| `DELETE` | `/auth/admin/sessions/:id` | Bearer | 撤销本人指定会话 |
| `POST` | `/auth/admin/sessions/revoke-all` | Bearer | 撤销本人全部会话 |
| `POST` | `/auth/admin/password` | Bearer | 修改本人密码并撤销全部会话 |

登录、刷新和退出必须通过 `APP_ORIGIN` / `ADMIN_ORIGIN` 来源检查。Cookie 为 host-only，路径限定 `/api/v1/auth/admin`，并使用 `HttpOnly`、`SameSite=Strict`和生产环境 `Secure`。

## 管理安全中心

| 方法 | 路径 | 最低角色 | 说明 |
|---|---|---|---|
| `GET/POST` | `/admin/security/accounts` | `SUPER_ADMIN` | 列出/创建管理员 |
| `PATCH` | `/admin/security/accounts/:id` | `SUPER_ADMIN` | 修改显示名、角色或启用状态 |
| `POST` | `/admin/security/accounts/:id/password` | `SUPER_ADMIN` | 重置密码并撤销目标会话 |
| `GET` | `/admin/security/accounts/:id/sessions` | `SUPER_ADMIN` | 查看目标管理员会话 |
| `DELETE` | `/admin/security/accounts/:accountId/sessions/:sessionId` | `SUPER_ADMIN` | 强制撤销目标会话 |
| `GET` | `/admin/security/audit?limit=100` | `ADMIN` | 查看最近安全审计，最多 200 条 |

系统拒绝管理员停用自己或修改自己的角色，并在串行化事务中确保至少保留一个启用的 `SUPER_ADMIN`。

## RBAC

| 资源/操作 | VIEWER | EDITOR | ADMIN | SUPER_ADMIN |
|---|:---:|:---:|:---:|:---:|
| 读取页面、分类、内容、商品 | ✓ | ✓ | ✓ | ✓ |
| 新增/修改页面、分类、内容、商品 | — | ✓ | ✓ | ✓ |
| 删除页面、分类、内容、商品 | — | — | ✓ | ✓ |
| 主题、调度、营销、外跳链接 | — | — | ✓ | ✓ |
| 全局设置、可执行插件代码 | — | — | — | ✓ |
| 管理员账号与强制会话撤销 | — | — | — | ✓ |
| 读取媒体库 | ✓ | ✓ | ✓ | ✓ |
| 上传/修改媒体 | — | ✓ | ✓ | ✓ |
| 归档/恢复媒体 | — | — | ✓ | ✓ |

## 公开接口

- `GET /public/bootstrap`：公开设置、当前主题、营销活动、延迟插件和普通外跳链接。
- `GET /public/pages/:slug`：从唯一线上路由索引返回已发布的不可变页面快照；支持 `help/windows` 等多层路由；重定向页返回 `routeType=REDIRECT`。
- `GET /public/categories`：分类平面数据，客户端按 `parentId` 构建无限树。
- `GET /public/contents`、`GET /public/contents/:slug`：文章、视频与 FAQ。
- `GET /public/content-search`：CMS 分页搜索，返回 `{items,total,page,limit}`。所有公开内容接口只返回已发布快照，详情支持多层 slug。
- `GET /public/products`：已发布非流量商品数组，仅返回公开快照及外部购买地址。
- `GET /public/product-search`：商品分页搜索；`GET /public/products/:id`：公开商品详情。
- `POST /public/products/resolve`：仅按商品 ID 重新读取公开资料，供独立购物车核验，不创建订单或修改库存。
- `POST /ai/search`：基于已发布且允许 RAG 的文档回答。
- `GET /ai/config`：公开 AI 开关、全局客服开关、输入长度与安全工单 URL；不返回密钥或模型配置。
- `GET /public/media/:id`：读取 APPGOG 自有图片；返回固定 MIME、`nosniff`、跨域图片策略、SHA-256 ETag 和一年不可变缓存。归档不破坏已发布页面中的既有 URL。

## 后台资源接口

### 零代码页面引擎

| 方法 | 路径 | 最低角色 | 说明 |
|---|---|---|---|
| `GET` | `/admin/pages` | `VIEWER` | 列出页面及草稿/线上版本状态 |
| `POST` | `/admin/pages` | `EDITOR` | 创建页面和初始不可变草稿 |
| `GET` | `/admin/pages/:id` | `VIEWER` | 读取页面编辑详情 |
| `PATCH` | `/admin/pages/:id/draft` | `EDITOR` | 基于 `baseVersionId` 保存完整草稿快照 |
| `POST` | `/admin/pages/:id/publish` | `EDITOR` | 仅发布指定且仍为当前的 `draftVersionId` |
| `POST` | `/admin/pages/:id/status` | `EDITOR` | 转为 `DRAFT`、`OFFLINE` 或 `ARCHIVED`，同步移除公开路由 |
| `GET` | `/admin/pages/:id/preview` | `VIEWER` | 返回已保存草稿快照 |
| `GET` | `/admin/pages/:id/versions` | `VIEWER` | 版本列表和创建者 |
| `GET` | `/admin/pages/:id/versions/:versionId` | `VIEWER` | 指定不可变版本详情 |
| `POST` | `/admin/pages/:id/restore` | `EDITOR` | 把历史版本复制为新草稿，不覆盖历史和线上版 |
| `DELETE` | `/admin/pages/:id` | `ADMIN` | 删除页面及其版本，审计记录保留 |

### 组件清单

| 方法 | 路径 | 最低角色 | 说明 |
|---|---|---|---|
| `GET` | `/admin/components` | `VIEWER` | 返回组件 Schema 版本、18 个组件定义、默认 Props、字段控件、枚举/范围和数据依赖 |

该清单是编辑器组件库和属性面板的权威来源。组件清单只描述展示与数据依赖，不返回数据库凭据、Xboard 会话或任何服务端秘密。页面保存仍由页面接口按同一服务端 Schema 重新验证，不能信任浏览器清单。

### 媒体资源库

| 方法 | 路径 | 最低角色 | 说明 |
|---|---|---|---|
| `GET` | `/admin/media` | `VIEWER` | 分页查询，可按文件名/替代文字、文件夹及 active/archived/all 状态筛选 |
| `POST` | `/admin/media` | `EDITOR` | `multipart/form-data` 单图片上传；字段为 `file`、可选 `altText` 和 `folder` |
| `PATCH` | `/admin/media/:id` | `EDITOR` | 更新替代文字和文件夹，不替换不可变文件字节 |
| `DELETE` | `/admin/media/:id` | `ADMIN` | 归档资源；保留文件以避免破坏已发布页面 |
| `POST` | `/admin/media/:id/restore` | `ADMIN` | 恢复归档资源 |

上传限制为单文件 **1–10485760 字节（包含上限）**，仅允许实际内容为 JPEG、静态 PNG、GIF 或 WebP 的图片。服务端不信任文件名、扩展名和请求 MIME；会检查文件签名、结构尾标并完整解码像素。动画仅接受 GIF/WebP，最多 200 帧，所有帧累计最多 4000 万像素；单边最多 30000。APNG、SVG/HTML、仅改扩展名的伪图片、损坏像素和越界路径均拒绝。每个进程同时最多进行 2 个完整解码，像素解码超时为 10 秒；上传后保存 SHA-256，公开读取时重新校验。

查询参数：`page` 默认 1，范围 1–1000000；`limit` 默认 30，范围 1–100；`search` 最多 100 字；`folder` 为 1–50 位小写字母、数字、`_`、`-`（首位必须是字母或数字）；`state` 为 `active`（默认）、`archived` 或 `all`。返回 `{items,total,page,limit}`，按 `createdAt DESC,id DESC` 稳定排序。

资产对象包含 `id,originalName,mimeType,extension,byteSize,sha256,width,height,altText,folder,createdById,createdAt,updatedAt,archivedAt,publicUrl`；列表附加 `createdBy: {displayName} | null`。所有管理响应均移除私有 `storageKey`。`publicUrl` 是 `/api/v1/public/media/:id`，属于 API 域名；跨域部署由前端按 `VITE_API_URL` 的 origin 解析，不应直接当作 Web 域名资源。

`PATCH` 只接受 `altText`（最多 300 字，空串清除）和 `folder`，至少传一个字段，显式 `null` 和未知字段返回 400。恢复接口接受 `{}` 或 `{restore:true}`，拒绝 `false`、`null` 和未知字段。上传/恢复成功返回 201，读取/修改/归档成功返回 200；条件公开读取可返回 304（支持 ETag 列表、弱比较及 `*`）。

错误约定：400 无效格式、字段或文件内容；401 管理会话无效；403 角色不允许；404 资源/文件不存在；409 并发修改冲突；413 超过 10 MiB；503 解码繁忙、文件完整性或存储异常。元数据与审计在同一事务；更新/归档/恢复使用串行化隔离。上传事务响应丢失时独立查询存储键：已提交则返回成功，确认无记录才清理文件；无法确认则保留文件、记录对账日志并返回错误，不盲目删除。

草稿包含名称、slug、路由类型、重定向、SEO、Schema 版本和 JSON 组件树。草稿修改不会改变线上 URL、SEO、重定向或布局。过期 `baseVersionId` / `draftVersionId` 返回 `409 Conflict`。

JSON 树限制：Schema 版本为 1，最多 500 个组件、10 层嵌套、256 KiB；组件 ID 在整页唯一；仅 `grid` 可包含子组件；`header` / `footer` 只能在顶层各出现一次，加入后锁定；未注册组件、未声明字段和非安全 URL 会被拒绝。

### 文档、FAQ 与视频 CMS（第八阶段）

| 方法 | 路径 | 最低角色 | 说明 |
|---|---|---|---|
| GET | `/admin/content` | VIEWER | 查询草稿资料，保持数组响应 |
| GET | `/admin/content/page` | VIEWER | 同一查询的分页对象 `{items,total,page,limit}` |
| GET | `/admin/content/:id` | VIEWER | 草稿、版本号、线上快照及最近 5 条索引任务 |
| POST | `/admin/content` | EDITOR | 创建草稿，不能直接写发布状态 |
| PATCH | `/admin/content/:id` | EDITOR | 完整草稿字段快照，加必需 `baseRevision`；不会更新公开快照 |
| POST | `/admin/content/:id/publish` | EDITOR | `{baseRevision}`；校验后显式发布当前草稿 |
| POST | `/admin/content/:id/status` | EDITOR / ADMIN | `{baseRevision,status}`；DRAFT/OFFLINE 最低 EDITOR，归档及从归档恢复最低 ADMIN |
| DELETE | `/admin/content/:id` | ADMIN | `{baseRevision}`；可恢复归档，不物理删除正文 |
| POST | `/admin/content/:id/reindex` | EDITOR | `{baseRevision}`；仅已发布且 `ragEnabled=true` 的快照 |

创建/保存必需字段为 `type: ARTICLE|FAQ|VIDEO`、`format: MARKDOWN|RICH_TEXT`、`title`（1–200，去首尾空白）、`slug`（1–160，小写字母数字 `_ -`，允许非空 `/` 路径段）。已创建内容不能变更类型。PATCH 使用完整字段快照，省略的可选正文/元数据按默认空值处理，**不是局部合并**。

其余字段：`summary` 最多 1000 字；`body`、`faqAnswer` 各最多 100000 字；`faqQuestion` 最多 1000 字；`coverUrl`、`videoUrl`、`ogImage` 最多 2000 字；`categoryId` 最多 100 字且必须引用 CONTENT 域；`ragEnabled` 必须布尔值（默认 false）；`seoTitle` 最多 200、`seoDescription`/`seoKeywords` 最多 500 字。空字符串清除可选值，读取时可返回 null；不接受显式 null 替代字符串、未知字段、客户端伪造的发布快照或系统字段。JSON 请求体上限 512 KiB，仍需同时满足各字段长度。

图片为无凭据 HTTP/HTTPS 或本站根相对地址；视频为无凭据 HTTP/HTTPS `.m3u8` 路径（允许签名查询参数）。服务器不代理抓取视频。富文本由服务端白名单清理；Markdown 禁止执行原始 HTML，渲染后再清理；前台再做 DOMPurify 防护。

草稿可以暂缺正文、FAQ 问答或视频地址；发布文章必须有可见正文/图片，发布 FAQ 必须有问题和有效答案，发布视频必须有 m3u8 地址。发布使用当前稿的全部公开字段创建快照、占用唯一 `publishedSlug`；修改草稿、分类或 SEO 不会悄然改变线上版。归档内容必须由管理员先恢复为草稿再发布。下线/归档会清除线上路由及知识分块。

查询字段：`page` 默认 1（1–1000000）、`limit` 默认 20（1–100）、`search` 最多 100 字、`categoryId`、`type`、`sort:newest|oldest|viewsDesc`；后台另可 `status:DRAFT|PUBLISHED|OFFLINE|ARCHIVED`。公开接口即便提供 status 也不能读取未发布资料。搜索标题、摘要、正文、FAQ 问答及分类名称（不区分大小写，包含匹配）；分类筛选含全部子级。公开搜索只使用发布快照的搜索文本和分类 ID，不使用草稿 `searchVector`。列表按时间/浏览量及 ID 稳定排序。

公开响应为已发布 `type,format,title,slug,summary,body,faqQuestion,faqAnswer,coverUrl,videoUrl,categoryId,seoTitle,seoDescription,seoKeywords,ogImage`，并附 `id,html,faqHtml,publishedAt,viewCount`；详情另外返回 `breadcrumb:[{id,name,slug}]`、`category`。不返回草稿、revision、索引任务及内部哈希。

内容/分类写入、路由变更与审计使用同一串行化事务；陈旧版本、重复标识和并发写冲突返回 409。401 会话无效、403 越权、400 校验失败、404 不存在/未发布。POST 成功 201，其余成功 200。

第十阶段升级后的索引契约：发布快照与 PENDING 任务在同一事务提交，处理器在事务外分块/向量化，最终提交再次校验公开哈希、投喂状态和租约所有权。保存关闭 ragEnabled 会立即删除分块、清空索引时间、取消活动任务并阻止检索。失败不回滚已成功发布；最多自动尝试 3 次，终态失败可手动重试。未配置模型仅完成本地文本索引并明确提示，不能宣称已经生成向量。CMS 详情返回的 indexJobs 也移除 leaseToken/activeKey。完整队列与运维接口如下。

### AI 知识库与投喂（第十阶段）

| 方法 | 路径 | 最低角色 | 说明 |
|---|---|---|---|
| GET | `/ai/config` | 无 | `{enabled,globalAssistantEnabled,maxQuestionLength:2000,ticketUrl}`；no-store |
| POST | `/ai/search` | 无 | 只接受 `{question:string}`，1～2000 字符；返回下述回答对象，no-store |
| GET | `/admin/rag/status` | VIEWER | 配置、模型配置状态、今日额度、文档/分块计数、任务汇总、处理器环境开关 |
| PATCH | `/admin/rag/settings` | SUPER_ADMIN | 完整配置快照及 baseRevision，原子审计、乐观并发 |
| GET | `/admin/rag/documents` | VIEWER | 分页投喂文档概要，不返回正文或密钥 |
| GET | `/admin/rag/jobs` | VIEWER | 分页任务记录，可按状态/内容 ID 筛选，不返回 leaseToken/activeKey |
| POST | `/admin/rag/documents/:id/feed` | EDITOR | `{baseRevision,enabled:boolean}`；版本检查后切换投喂、入队或取消 |
| POST | `/admin/rag/reindex` | ADMIN | `{afterId?:string}`；最多 100 篇，返回 `{queued,skipped,nextCursor}` |
| POST | `/admin/rag/jobs/:id/retry` | EDITOR | `{}`；仅失败任务，来源仍须发布且允许投喂，返回新/已有活动任务回执 |

问答输入在 NFKC 标准化后再次校验 1～2000 字符，拒绝非法控制字符/未知字段。不能传入 model、baseURL、apiKey、system、sourceIds、userId 或会话记录；服务端自行检索并固定提示词。

回答对象：`{mode,answer,sources,ticketUrl,unresolved,retrievalMode}`。mode 为 answer（已通过引用校验的模型文本）、documents（文档搜索/无法确认/模型失败）、blocked（注入/敏感凭据/私人账号请求）、disabled（服务暂停）；只有 answer 的 unresolved=false。retrievalMode 为 keyword、semantic、hybrid，blocked/disabled 默认为 keyword 占位，不表示执行了检索。sources 最多 topK 条 `{id,title,slug,url,excerpt}`，url 由服务端真实公开 CMS slug 构造，excerpt 最多 240 字。未知引用、截断/非法模型输出、检索后来源更新均不能返回未经确认的模型答案。

ticketUrl 是已启用 TICKET 外跳项中符合 HTTP/HTTPS 且无凭据/查询/片段的 URL，没有有效配置返回空串。前端只能新窗口普通跳转，不能附加问题、身份、令牌或订阅信息。公开 bootstrap 同步返回 ai 配置，并以其值覆盖旧 settings['ai.globalAssistant.enabled']；旧通用设置不再是 AI 开关权威源。

设置 PATCH 必须同时提供 `baseRevision`（≥0；未初始化回退版本为 0）、enabled、autoIndexEnabled、globalAssistantEnabled（布尔）、topK（整数 1～10）、minimumScore（数值 0～1）、perMinute（整数 1～60）、globalPerMinute（整数 1～600）。成功返回新配置含 revision/时间戳；真实迁移会初始化 main 版本 1。保存过期版本返回 409，未知字段/不完整快照返回 400。默认值依次为 true、true、false、6、0.45、8、60。

status 响应：`{settings,provider,usage,eligibleDocuments,chunks,jobs:{pending,running,failed},workerEnabled}`。provider 只包含 externalEnabled、configured、validEndpoint、chatModel、embeddingModel、dimensions，不返回服务地址或密钥；configured 不是连通性检查结果。usage 为 `{modelCallsToday,dailyModelCallLimit,resetsAt}`，按 UTC 日计算；次数并非费用金额。failed 为历史失败/取消任务数，不是当前故障文档数。

documents/jobs 查询共同字段 page 默认 1（1～1000000）、limit 默认 20（1～100）、contentId 可选最多 100 字。仅 jobs 可传 status=PENDING|RUNNING|SUCCEEDED|FAILED；documents 收到 status 等未知字段返回 400。均返回 `{items,total,page,limit}`；文档按 updatedAt DESC,id ASC，任务按 createdAt DESC,id ASC。documents 项为 `{id,title,publishedTitle,status,revision,ragEnabled,ragIndexedAt}`。jobs 项保留任务 id/contentId/status/attemptCount/contentHash/indexProfile/availableAt/leaseUntil/startedAt/finishedAt/createdAt/updatedAt/errorMessage，但不暴露租约令牌或活动键。

单篇投喂与失败重试使用 Serializable 事务及审计；失败重试不改变原失败历史。重建请求先记录审计，再逐篇独立事务入队，部分入队失败时成功任务保留，不声称批次原子完成；重试按活动键去重。有 nextCursor 才继续下一批，空表示扫描到末尾。

错误：400 输入/状态不合法；401 管理认证无效；403 角色不足；404 文档或任务不存在；409 版本/并发冲突；429 访客/全站分钟额度或进程并发不足，JSON 含 message、retryAfterSeconds。模型故障或模型日额度耗尽优先返回 201 documents 降级而非伪装模型成功；数据库整体不可用等无法检索的异常仍为服务错误，前端提供重试/工单。POST 成功 201，其余成功 200。

限流按真实 socket 地址识别访客，仅显式 AI_TRUSTED_PROXY_IPS 白名单中的紧邻代理才能使用 X-Forwarded-For 的最后一项；默认忽略访客伪造头。持久分钟限额跨进程共享，问答进程并发上限 8。全局客服首载/路由切换及每 30 秒复查开关；服务暂停后的新问答由服务器立即拒绝生成，已显示历史文本不是服务端推送撤回。更详细的任务租约、分块/向量指纹、外部请求限制和上线步骤见 10-AI-RAG.md。

### 无限分类（第八阶段）

- `GET /admin/category[?scope=CONTENT|PRODUCT]` 与公开 `/public/categories`：按 sort、id 返回平面数组，无固定层数或分页截断。
- `GET /admin/category/:id`：VIEWER 起可读。
- `POST /admin/category`、`PATCH /admin/category/:id`：EDITOR 起；字段为 `name`（1–100）、`slug`（1–160）、`scope`（默认 CONTENT）、`parentId`（null 为根）、`sort`（整数 -1000000～1000000，默认 0）、`description`（最多 1000，默认空）。修改需 `baseRevision`。
- `DELETE /admin/category/:id`：ADMIN 起，JSON `{baseRevision}`；仅无子分类且无草稿/历史公开快照/商品引用时可删除。删除不可恢复，有引用返回 409。

分类禁止移动到自己或后代、禁止跨 CONTENT/PRODUCT 域及更改既有 scope；分类写入与审计原子提交。第八阶段后台树管理 CONTENT 域，第九阶段新增 PRODUCT 域后台树与商品绑定；商品草稿及保留的公开快照引用都会阻止删除。通用资源接口不能绕过上述校验。

### 独立非流量商品（第九阶段）

| 方法 | 路径 | 最低角色 | 说明 |
|---|---|---|---|
| GET | `/admin/product` | VIEWER | 草稿资料数组，兼容原列表路径 |
| GET | `/admin/product/page` | VIEWER | 分页 `{items,total,page,limit}` |
| GET | `/admin/product/:id` | VIEWER | 当前草稿、revision、状态和已发布快照 |
| POST | `/admin/product` | EDITOR | 创建草稿，不允许直接指定发布状态 |
| PATCH | `/admin/product/:id` | EDITOR | 完整草稿快照，必须带 `baseRevision` |
| POST | `/admin/product/:id/publish` | EDITOR | `{baseRevision}` 显式发布当前稿 |
| POST | `/admin/product/:id/status` | EDITOR / ADMIN | `{baseRevision,status}`；DRAFT/OFFLINE 最低 EDITOR；归档及从归档恢复最低 ADMIN |
| DELETE | `/admin/product/:id` | ADMIN | `{baseRevision}`，可恢复归档，非物理删除 |
| GET | `/public/products` | 无 | 已发布商品数组 |
| GET | `/public/product-search` | 无 | 已发布商品分页对象 |
| GET | `/public/products/:id` | 无 | 按 ID 读取已发布详情，不是按 slug |
| POST | `/public/products/resolve` | 无 | `{ids:string[]}`，返回 `{items,unavailableIds}`；只读 |

写入必需 `name`（去首尾空白后 1–200）、`slug`（1–160，和 CMS 一致的多层小写路径）、`price`。`kind` 只能为 ACCOUNT（非流量账号）、SERVICE、DEVICE、OTHER，默认 OTHER；不能提交 TRAFFIC、Xboard 套餐/用户/订单字段。分类只能引用 PRODUCT 域。

价格接受字符串或数字，建议传十进制字符串；非负，最多 10 位整数、2 位小数，禁止指数形式字符串、额外小数和非数值，范围 0～9999999999.99。`compareAtPrice` 可空串清除，非空时不得低于售价。公开商品 `price` 与非空 `compareAtPrice` 返回两位小数字符串。`currency` 是三位大写字母，默认 USD，不做换汇或汇率推断；未按币种筛选的价格排序仅按金额数值排序。

其他字段：`sku` 最多 100（非空唯一），`summary` 1000，`description` 100000（Markdown）；`stock`/`sales` 为 0～2147483647 整数，默认 0；`categoryId` 100；`coverUrl`/`ogImage`/`externalUrl` 各 2000；`gallery` 最多 30 个不重复图片 URL，每个最多 2000；`seoTitle` 200，`seoDescription`/`seoKeywords` 500。空串清除可选字符串，读取可返回 null。PATCH 是完整快照，省略可选字段使用 DTO 默认值，不是局部合并。拒绝显式 null 替代字符串、未知字段和客户端发布快照/修订号等系统字段。

图片使用安全 HTTP/HTTPS 或本站根相对 URL。外购链接必须是无用户名/密码、无控制字符的完整 HTTP/HTTPS URL，允许供应商自身商品查询参数；不自动附加 APPGOG 身份或交易数据。草稿可暂缺外购地址，发布时必须提供。详情 Markdown 禁止执行原始 HTML，并进行服务端清理和前端二次清理。

保存只修改草稿和 revision；发布才替换 `publishedSnapshot`、`publishedSlug`、`publishedPrice`、`publishedSales` 和 `publishedAt`。公开详情、分类、搜索及排序均使用公开值，不泄露修改中的草稿。下线/归档移除公开访问；归档须先由管理员恢复为 DRAFT 后才能发布。状态变更、商品变更及审计在同一串行化事务中提交。

列表查询：`page` 默认 1（1～1000000），`limit` 默认 20（1～100），`search` 最多 100，`categoryId`（包含所有子级），`currency`，`sort:salesDesc|priceAsc|priceDesc|newest|oldest` 默认 salesDesc；后台可加 `status:DRAFT|PUBLISHED|OFFLINE|ARCHIVED`。公开接口不因 status 参数公开草稿。后台按名称/摘要/SKU 检索，公开按已发布名称/摘要检索，不区分大小写。时间排序后台使用 createdAt、公开使用 publishedAt，同值按 ID 升序稳定排序。

公开项字段为 `id,kind,sku,name,slug,summary,description,descriptionHtml,currency,price,compareAtPrice,stock,sales,coverUrl,gallery,externalUrl,categoryId,seoTitle,seoDescription,seoKeywords,ogImage,publishedAt,available`；不返回 revision、草稿或内部快照。`available` 需有正整数库存且外购地址安全。售罄商品仍可展示详情，但界面不提供购买入口。

购物车 resolve 最多接受 100 个不重复 ID，每个最多 100 字，拒绝客户端价格、购买链接等额外字段。下线/不存在的 ID 放入 unavailableIds；售罄商品仍在 items 中，available=false。购物车仅在浏览器持久保存 ID，不保存或相信缓存价格/外链；重新打开、聚焦、手动刷新以及挂载期间每 60 秒重读公开资料。核验失败或进行中暂停外购入口。每种商品收录一次，按币种分别汇总参考金额；无数量扣减、库存预留、合并支付、订单或回调。外部网站负责最终数量、价格和交付。点击外链不会增加销量或扣减库存，这些是运营手动维护并显式发布的数据。

错误：400 字段/范围/引用域错误；401 会话失效；403 越权；404 商品不存在或未公开；409 修订号、唯一标识或并发冲突。POST 成功 201（包括只读 resolve），其余成功 200。整体 JSON 请求体仍受 512 KiB 限制。全部购买链接统一 `target="_blank" rel="noopener noreferrer"`。

### 其他后台资源

- `GET/POST /admin/:resource`
- `GET/PATCH/DELETE /admin/:resource/:id`

通用 `resource` 白名单仅保留 `globalSetting`、`outboundLink`。主题、调度、营销和插件仍保留原 URL，但由下述专用控制器负责，禁止通用 CRUD 绕过校验。页面、分类、内容、商品同样不在通用白名单内。

`outboundLink` 只接受不含查询参数和 URL 片段的普通 HTTP/HTTPS 页面地址，不能保存 Token、用户 ID 或 Xboard API 地址。

### 主题、营销与全局代码（第十一阶段）

所有路径位于 `/api/v1`。`kind` 仅指以下四个固定路由：`theme`、`themeSchedule`、`marketingCampaign`、`pluginSnippet`，不是任意 Prisma 模型。前三类读写要求 ADMIN/SUPER_ADMIN，插件的读、写、历史、停用和回退全部要求 SUPER_ADMIN。

| 方法 | 路径 | 输入 / 输出 |
|---|---|---|
| GET | `/admin/{kind}` | `page=1,limit=20,search?`；返回 `{items,total,page,limit}`；limit 1–100，search 最多 100 字；调度无名称搜索 |
| GET | `/admin/{kind}/:id` | 当前完整记录和 revision；插件详情才包含 code |
| POST | `/admin/{kind}` | `{baseRevision:0,data:{…}}`，创建 revision=1 |
| PATCH | `/admin/{kind}/:id` | `{baseRevision:N,data:{…}}`，完整可编辑快照，成功 revision+1 |
| DELETE | `/admin/{kind}/:id` | JSON `{baseRevision:N}`；主题被默认配置/任意调度引用时拒绝；插件不允许删除，保留历史 |
| GET | `/admin/theme-state` | `{state:{id,defaultThemeId,revision,…},theme,schedule,serverTime,rule}`；未初始化 state.revision=0 |
| POST | `/admin/theme/:id/activate` | `{baseRevision:N,baseStateRevision:M}`，改变手动默认主题；不覆盖生效中的调度 |
| GET | `/admin/pluginSnippet/:id/versions` | 同样分页；返回不可变代码快照、version、createdById、changeNote、createdAt |
| POST | `/admin/pluginSnippet/:id/disable` | `{baseRevision:N}`；无须重新提交旧代码，停用与新版本、审计原子提交 |
| POST | `/admin/pluginSnippet/:id/restore` | `{baseRevision:N,versionId,changeNote,acknowledgeRisk:false}`；只接受本插件版本，复制为新版本，永远保持停用 |

`data` 按资源严格白名单验证，拒绝额外属性与批量赋值：

- theme：`name`（1–100字）、`mode=LIGHT|DARK|AUTO`、`variables`、`effects`。variables 仅 `primary/accent/bg/surface/text/muted` 六位 HEX、`radius=0–40px`、`shadow=none|0 8px 24px #00000026|0 16px 48px #00000040`；effects 为 `{particles:boolean,density:0..80整数,disabledOnMobile:boolean}`。active 不可直接写入。
- themeSchedule：`themeId,startAt,endAt,timezone,enabled`。时间必填、结束晚于开始；IANA 时区仅用于输入解释和显示，API 时间必须为带 Z/偏移的 ISO（2000–2200年）。已启用时间窗 `[startAt,endAt)` 全局禁止重叠，允许首尾相接。主题必须存在；启用前重新验证主题配置。
- marketingCampaign：`name,kind=POPUP|COUNTDOWN|BANNER,startAt,endAt,timezone,enabled,config`。startAt/endAt 可 null，COUNTDOWN 必须有 endAt。config 为 `{title,text,url,buttonText,frequencyHours,pageRules,expiredText,expiredBehavior,expiredUrl}`。频率整数1–8760小时；页面规则最多30项、总长2000，逗号分隔 `*`、`/路径`、`/前缀*`；标题200字、正文4000字、按钮100字、结束文字200字；expiredBehavior 为 hide/text/link（绑定后台活动到期统一隐藏，不能继续促销）。链接允许安全站内路径或无凭据/查询/片段的 HTTP/S 地址，不发起服务器请求。
- pluginSnippet：`name,position=HEAD|BODY_END,code,delayMs,enabled,changeNote,acknowledgeRisk?`。code 最多100000字符，必须包装为 HTML，JS 使用 script 标签；delayMs 整数3000–60000；changeNote 必填最多500字；enabled=true 必须 acknowledgeRisk=true。最多同时启用16个插件，总 UTF-8 代码≤512KiB；每类运营资源最多1000条。敏感 code 不复制到通用审计，保留在仅 SUPER_ADMIN 可读的版本表；审计记录操作者、版本、启停与变更说明。

`GET /public/bootstrap` 继续提供 theme/campaigns/snippets/settings/outboundLinks/ai，并新增 serverTime，响应 `Cache-Control: no-store`。公开主题按当前时间实时计算，不依赖上一次定时器是否成功；时间窗外或停用的活动不输出。非法旧主题/活动配置不会传给前台。插件仅返回已启用且安全结构有效的 `{id,revision,position,code,delayMs}`，不含历史与管理员信息。公开代码本身不保密，不可放 API Key。

前台每15秒及路由变化时重读配置。sale/popup/countdown 的可选 `campaignId` 属性绑定对应后台活动，未找到/类型不匹配/已停用/时间或页面不匹配时不显示，不回退到伪造内容。未绑定时保留本地组件配置。后台编辑预览不弹真实广告、不记录 LocalStorage。弹窗按活动ID或原组件ID持久限频，同页只开一个；存储不可用时降级到内存频率。

所有 HTML、JS、资源请求均在加载器不少于3000ms的计时结束后才插入；HEAD/BODY_END 枚举前后端一致。非 async 外部脚本先等待加载再执行其后的初始化代码；单个资源等待最多15秒。SPA 公共路由不重复执行同一插件；已执行代码变化/停用后重新加载文档，不能靠删除 script 标签声称已撤销副作用。公开页进入 `/admin` 或反向跨界均进行整页导航；管理界面从不注入代码。

代码属于受信任超级管理员扩展，并非恶意代码沙箱。自动延迟不限制代码自身行为，不能撤销已发生的第三方传输；部署方必须复核供应商代码、隐私授权、CSP/CORS，禁止 Xboard 业务调用。API不执行这些代码，也不代理第三方服务。

400 字段/日期/范围/关联操作不合法；401 未认证；403 越权；404 不存在或版本归属错误；409 重名、修订号、默认主题、调度或数据库并发冲突。POST成功201，其余成功200。所有运营写入、版本与审计在同一 Serializable 事务内；数据库约束仍是最后防线。
# 第十二阶段：官网草稿方案

- `GET /api/v1/admin/pages/site-starter`：VIEWER 及以上查看方案版本、21 个页面/入口、每页待核实事项和路由占用状态。
- `POST /api/v1/admin/pages/site-starter`：仅 ADMIN/SUPER_ADMIN；请求体固定为 `{ "version": 1 }`。仅创建缺失路由的草稿，绝不覆盖已有草稿或线上路由，不自动发布；响应为 `{ version, created, skipped }`。
- `POST /api/v1/admin/pages/:id/publish`：若组件树仍存在非空 `publicationRequirement`，返回 400 和精确的 `{ blockId, message }[]`；线上版本保持不变。
- 公开页仍只通过 `GET /api/v1/public/pages/:slug` 与 `GET /api/v1/public/pages/*slug` 读取不可变已发布版本；内置方案不能作为公开请求的回退。

初始化是本地 APPGOG 数据库写入，使用串行化事务并逐页记入 `SITE_DRAFT_CREATED` 审计。接口不读取 Xboard；登录、注册、套餐、面板和工单入口在逐页核实后配置为无查询参数、无片段、无身份信息的普通 HTTP/HTTPS 链接。
