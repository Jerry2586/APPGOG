# APPGOG

十四个开发阶段的代码交付和本机全量验收已经执行：独立 APPGOG 后台、页面/CMS/商城/AI/主题营销系统、21 个可编辑官网草稿方案，以及与 APPGOG 门户完全隔离的 Xboard 登录后主题均已纳入统一门禁。正式 Docker/PostgreSQL、Safari HLS、媒体卷恢复和正式运营资料仍是环境条件验收，未执行前不得宣称生产上线完成。完整结论见 [第十四阶段全量签收](docs/14-DEPLOYMENT-AND-ACCEPTANCE.md)。

APPGOG 是与 Xboard 业务解耦的可视化扩展运营平台。它提供 JSON 驱动的拖拽页面、CMS/影视教程、独立外链商城、AI 知识库、主题与营销调度、第三方客服及全局代码扩展。

## 架构边界

- 浏览器只调用 APPGOG API（默认 3000 端口）。
- APPGOG 使用独立 PostgreSQL，禁止连接 Xboard 数据库。
- APPGOG 与 Xboard 完全隔离，不共享身份、Cookie、API 或数据库；登录、注册和核心业务使用普通 URL 跳转。
- Xboard 登录、注册、套餐购买、面板与工单全部是普通 URL 跳转。
- 增值商品购买在新窗口打开外部支付/发卡链接，APPGOG 不承接结算。

## 本地启动

1. 复制 `.env.example` 为 `.env`，填写数据库密码、密钥和域名；`APPGOG_DB_PASSWORD` 必须与 `DATABASE_URL` 中密码一致。
2. 启动依赖：`docker compose up -d postgres redis`。
3. 安装依赖：`pnpm install`。
4. 初始化：`pnpm db:generate && pnpm db:migrate && pnpm db:seed`。
5. 启动：`pnpm dev`。

生产部署应复制 `.env.docker.example` 为 `.env` 并填写全部必填密钥，然后执行 `docker compose config && docker compose build --pull && docker compose up -d`。Web 默认映射到 8080，API 固定映射到 3000；`init` 服务会先完成迁移和幂等种子，API 通过数据库就绪探针后才对 Web 提供服务。详细部署、备份和恢复步骤见 `docs/14-DEPLOYMENT-AND-ACCEPTANCE.md`。

## 服务器一键安装

在全新 Linux 服务器的命令行下载、检查并执行脚本；它直接完成 Docker 检查/安装、源码获取、随机密钥与管理员密码生成、数据库迁移、镜像构建、服务启动和健康检查，不进入 1Panel，也不启动 3099 网页向导：

```sh
curl -fsSLo /tmp/appgog-install.sh https://raw.githubusercontent.com/Jerry2586/APPGOG/main/deploy/install-one-click.sh
less /tmp/appgog-install.sh
sudo sh /tmp/appgog-install.sh --origin https://你的正式域名 --email 你的管理员邮箱
```

脚本固定从 `https://github.com/Jerry2586/APPGOG.git` 获取 `main`。已有 Docker 时只验证；缺少 Docker 时使用官方软件源安装。成功后终端直接显示官网地址、后台地址、管理员账号、初始密码和本机 Web 上游。脚本不覆盖已有 `.env`、完成状态、非官方仓库或有本地改动的源码目录，也不删除容器或数据卷。

服务器一键安装会启用可选的 Caddy gateway profile，自动签发/续期 HTTPS 证书并开放 80/443；API 与 Web 上游只绑定本机。使用服务器已有的 Nginx、Caddy 或面板代理时，不启用该 profile 即可，APPGOG 仍不要求进入任何面板安装。默认 Web 上游为 `http://127.0.0.1:8080`；不要向公网开放 3000、8080、5432、6379。

## 可选 Web 安装向导

APPGOG 提供独立的五步 Web 安装向导，支持宝塔、1Panel、aaPanel、标准 Docker 和纯 SSH Linux。它会完成安装 Token 校验、服务器预检、独立配置、隔离边界复核、固定 Compose 部署和 API 健康检查。默认只监听回环地址：

```sh
sh deploy/start-installer.sh
```

Token 只保护一次性安装过程，不是 Xboard Token；安装器不接受 Xboard Token、API 或数据库配置。详细的 SSH 转发、各面板反向代理、安全远程模式和安装后检查见 [跨面板安装向导](docs/INSTALLATION-WIZARD.md)。

前台：http://localhost:5173/（首页数据路由为 `home`）  
后台：http://localhost:5173/admin  
接口契约：`docs/API-CONTRACT.md`

初始管理员邮箱由 `ADMIN_EMAIL` 指定，默认仅为本地邮箱 `admin@appgog.local`。种子脚本没有默认密码；首次初始化必须显式提供至少 16 位的 `ADMIN_INITIAL_PASSWORD`。

管理认证使用 15 分钟内存访问令牌、可撤销数据库会话和旋转 HttpOnly 刷新 Cookie。密码至少 16 位并需要至少三类字符；生产环境必须配置不少于 32 位的随机 `JWT_SECRET`以及精确的 `APP_ORIGIN` / `ADMIN_ORIGIN`。详细见 `docs/04-ADMIN-SECURITY.md`。

## 零代码页面引擎

页面由有版本的 JSON 树驱动，支持多层路由、外部纯跳转、独立 SEO、1–4 列递归网格、跨容器拖放、撤销/恢复、桌面/平板/手机预览、并发冲突检测、显式发布、下线/归档和历史版本回退。草稿与线上路由/布局/SEO 完全分离，前台只读取 `PublishedPageRoute` 指向的不可变版本。当前注册 18 类页面组件，编辑器与公开页共用同一渲染注册表。

## 媒体资源库

APPGOG 提供独立安全图片库，支持 JPEG、静态 PNG、GIF、WebP，单文件最多 10 MiB（包含上限）。上传会进行真实内容嗅探、完整像素/动画解码、尺寸/累计像素限制、SHA-256 完整性校验和随机存储键处理；SVG、HTML、APNG、伪图片及路径穿越会被拒绝。开发默认存储在 `MEDIA_STORAGE_DIR=data/media`，Docker 使用独立持久卷。媒体库与选图器提供分页、搜索、错误重试；页面 Hero、轮播和 SEO 分享图可直接从媒体库选择，支持 API/Web 分域部署。

第七阶段范围、测试证据及尚需真实数据库/容器环境执行的部署验收见 `docs/07-MEDIA-LIBRARY.md`。独立界面测试可运行 `node scripts/media-browser.mjs`，打开终端显示的本机地址；这是内存模拟接口，不连接正式数据库，不进入生产构建。

## 文档 CMS、FAQ 与视频（第八阶段）

后台提供 Markdown/真实 Quill 富文本、媒体选图、无限分类新增/移动/排序、独立文章/FAQ/视频编辑、SEO、草稿预览、显式发布/下线/归档和每篇 AI 投喂开关。公开组件支持分类及关键字搜索、分页、结构化 FAQ；多层内容详情只读取发布快照。HLS 播放器优先原生支持，否则按需加载 Hls.js，并处理换源、失败重试与卸载清理。

范围、逐项证据及待验条件见 `docs/08-CMS.md`。本机浏览器验收可先执行 `pnpm --filter @appgog/api build`，再运行 `node scripts/cms-browser.mjs`。该工具仅监听回环地址，运行真实 CMS 服务/JWT 与前端，数据库为隔离内存测试数据，**不是正式部署**；不要对外发布测试服务。用户现已明确授权第九阶段；第八阶段的真实数据库、容器、Safari/实机及外部向量服务待验项仍保留，不因进入下一阶段自动视为通过。

## 独立非流量商品（第九阶段）

专用商品后台支持商品资料、PRODUCT 分类树、价格/库存/销量、Markdown 详情、封面/相册媒体选图与排序、SEO、草稿预览、显式发布、下架和可恢复归档。公开价格/库存/分类等与草稿隔离。已有 products/cart 组件读取真实商品接口，支持分类、销量/价格/时间排序、分页、详情相册以及同页/跨页共享的独立购物车，没有新增硬编码商城首页。

购买逐项在新窗口打开外部 HTTP/HTTPS 地址。购物车只持久保存商品 ID，重读公开数据后展示参考金额及可购状态；按币种分别汇总，不合并支付、不预留/扣库存、不自动累计销量。APPGOG 不创建订单或接收支付回调，与 Xboard 仍完全隔离。

逐项验收与真实环境待验清单见 `docs/09-INDEPENDENT-CATALOG.md`。执行 API build 后运行 `node scripts/catalog-browser.mjs` 可启动本机隔离浏览器验收，包含 360/768px 独立 iframe 测试视口；真实商品/CMS API 连接内存 fixture，测试登录、媒体和页面不进入生产服务。不要对外发布，也不能代替真实 PostgreSQL/容器验收。用户已授权第十阶段；前八/九阶段的真实环境待验项继续保留。

## AI 知识库与客服（第十阶段）

后台“文档投喂 / AI 客服”管理公开知识投喂、服务/全局客服/自动入队开关、检索与限流设置、状态和失败重试。CMS 发布在同一事务入队，后台持久任务分块并生成向量，支持租约恢复、陈旧任务丢弃和最多 3 次自动尝试；手动重建每批最多 100 篇，可继续下一批。

既有 ai 拖拽组件与全局右下角客服共享匿名提问、真实 CMS 引用、停止等待/清空、错误提示与普通 Xboard 工单链接；全局入口覆盖公开装修页及 CMS 详情，不进入后台。模型启用时使用 1536 维向量与关键词混合检索；未启用或模型失败明确退回文档结果，不伪称语义问答已验证。

外部模型默认 AI_EXTERNAL_ENABLED=false，服务端配置密钥并明确启用后才发送模型请求。每天默认 200 次模型请求额度，和访客/全站分钟限流一起持久化；次数不是金额预算。无 Xboard API、数据库、账号或工单工具，不共享身份。上线前必须部署第十阶段迁移并在批准的真实模型与 PostgreSQL 环境验收，详见 [第十阶段交付与待验清单](docs/10-AI-RAG.md)。

隔离浏览器验收：API build 后运行 node scripts/ai-browser.mjs，仅监听回环地址；真实 AI/CMS 服务连接内存数据库和确定性模型替身，绝不调用付费模型，不得对公网发布。用户已授权第十一阶段，第十阶段真实环境待验项继续保留。

## 主题、营销与全局插件（第十一阶段）

后台节日皮肤库支持品牌色/背景/文字/圆角/阴影实时预览、LIGHT/DARK/AUTO 策略、粒子启停和一键默认主题；访客明暗偏好可持久保存。主题调度使用明确时区和 `[开始,结束)` 时间窗，禁止已启用任务重叠，允许首尾相接；任务到期恢复默认主题，应用重启也会重新对齐。

营销活动提供弹窗、倒计时与横幅数据源。仍通过已有拖拽组件绑定 campaignId，不增加写死的营销页面。公开端按启停、时间和页面规则展示，弹窗以 LocalStorage 持久限频；未开始或已过期活动不输出，绑定倒计时到期隐藏。页面预览不触发真实弹窗或记录访客频率。

客服、统计与自定义 HTML/JS 仅超级管理员可管理，支持 HEAD/BODY_END、至少3000ms延迟、版本审计、回退和紧急停用。公开路由不重复执行插件；停用或替换已执行代码后，公开页在下一次配置刷新时重新加载文档。插件历史保留，回退先保持关闭，需审核再启用。公开页与管理入口跨界使用整页导航，但任意受信任代码仍具有同源权限，**不是恶意代码沙箱**，不得放密钥或访问 Xboard 业务。

上线前必须部署第十一阶段迁移，先备份并演练。迁移保留旧代码和历史，但追加停用版本，旧已启用插件需要重新审核启用。每类运营记录最多1000条，同时启用插件最多16个、UTF-8代码总量≤512KiB。详细范围、边界与待验项见 [第十一阶段报告](docs/11-THEME-MARKETING-PLUGINS.md)。

本机隔离验收：API build 后运行 `node scripts/operations-browser.mjs`，仅监听 `127.0.0.1:5178`；真实运营控制器/服务/JWT连接内存 fixture，插件仅为无外联本地探针。测试登录、计时和停用按钮不进入生产应用，禁止对公网发布。第十一阶段交付后停止，等待用户指令，**不进入第十二阶段**。

## 验收

运行 `pnpm verify`，依次执行 Prisma 生成、隔离边界、数据库/安全/页面/组件/媒体/CMS/商品/AI/主题营销插件/官网/Xboard 独立主题、Docker/恢复配置、115 项需求签收、类型检查、生产构建、首屏性能预算和全部测试。数据库模型、约束和迁移路径见 `docs/03-DATABASE-DESIGN.md`，第四阶段安全验收见 `docs/04-ADMIN-SECURITY.md`，最终条件验收见 `docs/14-DEPLOYMENT-AND-ACCEPTANCE.md`。静态守卫和内存 fixture 不替代正式 Docker、数据库、Safari、模型和运营数据验收。
