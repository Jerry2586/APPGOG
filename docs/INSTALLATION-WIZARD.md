# APPGOG 跨面板部署与安装向导

> 文档版本：1.0  
> 最后核对：2026-09-01  
> 适用项目：APPGOG 生产部署  
> 支持入口：宝塔面板、1Panel、aaPanel、标准 Docker Compose、纯 SSH Linux

## 1. 部署结论与边界

五种入口最终都运行仓库根目录的同一份 `docker-compose.yml`，不会产生五套不同的应用。安装完成后包含：

| 服务 | 容器内部端口 | 主机端口 | 用途 |
| --- | ---: | ---: | --- |
| Web | 80 | `APPGOG_WEB_PORT`，默认 8080 | 官网、后台及 `/api` 反向代理入口 |
| API | 3000 | 3000 | APPGOG 独立 API；不得向公网放行 |
| PostgreSQL | 5432 | 不映射 | APPGOG 独立数据库 |
| Redis | 6379 | 不映射 | APPGOG 独立缓存和任务状态 |
| 安装向导 | 无容器 | 3099 | 一次性安装入口；安装后必须关闭 |

PostgreSQL 和 Redis 只加入 Docker 内部网络 `appgog_private`。APPGOG 不加入 Xboard 网络，不复用 Xboard 的数据库、Redis、`.env`、密钥、账号、Cookie 或 Token。

“安装 Token”只用于保护一次性安装接口。它不是 Xboard Token、登录 Token、API Key 或共享身份凭据。安装器不会提供或接受 Xboard Token、Xboard API 或 Xboard 数据库字段。Xboard 仅可配置普通页面跳转地址。

## 2. 上线前准备清单

### 2.1 服务器与权限

- Linux 服务器，建议至少 2 GiB 内存、8 GiB 可用磁盘；生产媒体较多时应扩大磁盘并设置容量告警。
- 一个可使用 Docker 的运维账号。若不是 `root`，该账号必须能运行 `docker compose`。
- Node.js 22 或更高版本。Node 只用于运行安装向导，业务本身运行在容器中。
- Docker Engine 和 Docker Compose v2；必须使用空格形式的 `docker compose`，不是旧版 `docker-compose`。
- APPGOG 源码的独立目录，例如 `/opt/appgog` 或 `/www/wwwroot/appgog`。
- 已解析到服务器公网 IP 的正式域名，以及该域名的 HTTPS 证书。

执行以下命令确认基础环境：

```sh
node -v
docker --version
docker compose version
docker info
free -h
df -h
```

`node -v` 的主版本必须不小于 22；`docker info` 必须成功，不能只安装客户端。Docker 的发行版安装方式以 [Docker Engine 官方文档](https://docs.docker.com/engine/install/) 和 [Compose 插件官方文档](https://docs.docker.com/compose/install/linux/) 为准。

### 2.2 域名、端口与防火墙

1. 给正式域名添加 `A`/`AAAA` 记录并等待解析生效。
2. 云安全组和主机防火墙只按需放行 `22`、`80`、`443`。
3. 不向公网放行 `3000`、`3099`、`5432`、`6379`。
4. Web 端口（默认 `8080`）只供同机反向代理访问；若面板防火墙无法限制为本机，也不要在云安全组放行它。
5. 安装向导优先通过 SSH 隧道访问，不为 3099 设置长期公网入口。

可先检查端口占用：

```sh
ss -lntp | grep -E ':(3000|3099|5432|6379|8080)\b' || true
```

如果 8080 已占用，在向导中选择另一个 `1024–65535` 端口；不能选择 3000、5432 或 6379。

### 2.3 源码与目录

推荐目录：

- 宝塔/aaPanel：`/www/wwwroot/appgog`
- 1Panel：`/opt/appgog`
- 标准 Docker/纯 SSH：`/opt/appgog`

禁止把 APPGOG 放入 Xboard 项目目录。上传完成后进入项目根目录并检查关键文件：

```sh
cd /你的/APPGOG目录
test -f package.json
test -f docker-compose.yml
test -f Dockerfile.api
test -f Dockerfile.web
test -f deploy/start-installer.sh
```

项目目录必须允许当前安装账号写入，但不要设置 `777`。示例：

```sh
chmod 750 /你的/APPGOG目录
chmod 750 deploy/start-installer.sh deploy/backup.sh deploy/restore.sh deploy/backup-restore-drill.sh
```

不要提前创建空 `.env`。安装器检测到已有 `.env` 或 `.appgog-install-state.json` 时会拒绝覆盖，这是防止误装到现有生产环境的保护机制。

## 3. 推荐安装流程（所有面板通用）

### 3.0 GitHub 服务器一键直装（推荐）

目标仓库为 `https://github.com/Jerry2586/APPGOG`。在全新 Linux 服务器命令行下载脚本、检查内容并执行；不需要进入 1Panel，也不需要访问网页安装向导：

```sh
curl -fsSLo /tmp/appgog-install.sh https://raw.githubusercontent.com/Jerry2586/APPGOG/main/deploy/install-one-click.sh
less /tmp/appgog-install.sh
sudo sh /tmp/appgog-install.sh --origin https://你的正式域名 --email 你的管理员邮箱
```

这条入口会完成：

1. 安装 `curl`、`git`、`openssl` 和 CA 证书等基础工具。
2. 已有 Docker Engine 和 Compose v2 时只验证，不修改现有 Docker。
3. 全新 Ubuntu、Debian、CentOS、RHEL 或 Fedora 缺少 Docker 时，从 Docker 官方软件源安装；其他发行版缺少 Docker 时安全停止，要求先通过面板或官方文档安装。
4. 把固定仓库的 `main` 分支浅克隆到 `/opt/APPGOG`；若该目录正好是官方仓库、没有本地修改且尚未安装，则只执行快进更新。
5. 生成数据库密码、JWT 密钥和管理员初始密码，以 `0600` 权限原子写入 `.env`。
6. 直接验证、构建并启动 Docker Compose，自动执行数据库迁移和管理员种子。
7. 检查 API 与 Web 健康状态，写入安装完成状态。
8. 在当前终端显示官网地址、后台地址、管理员账号、初始密码和本机 Web 上游。

脚本只允许首次安装：已有 `.env`、安装状态、非官方仓库或存在真实内容修改时都会拒绝覆盖。旧版脚本曾对 `deploy/*.sh` 执行 `chmod`；新版只会识别并忽略这种纯权限位变化，不会忽略任何内容修改。它不会删除现有 Docker 包、容器或数据卷，也不会自动修改面板网站、证书、防火墙和云安全组。APPGOG 与 Xboard 完全隔离，一键脚本不接收 Xboard 数据库、API、Token、Cookie 或账号配置。

如果一键安装曾在已知的第 3 阶段迁移缺陷处失败，新版脚本只在同时确认 `.env` 由安装器管理、尚无完成状态、失败迁移名称完全匹配、没有后续成功迁移且所有业务表均为空时，重建 APPGOG 自己的空 `public` schema 后继续。任一条件不满足都会停止，不删除数据卷，也不会接触其他数据库。

如需改变安装目录或分支：

```sh
sudo APPGOG_DIR=/data/APPGOG APPGOG_REF=main sh /tmp/appgog-install.sh --origin https://你的正式域名 --email 你的管理员邮箱
```

生产安装不要直接把远程脚本通过管道交给 Shell；应先下载并核对。该脚本在服务器终端内完成部署，不启动 Node.js 安装服务、不监听 3099，也不需要 SSH 隧道。安装成功后，可用 Nginx、Caddy 或任意面板把正式 HTTPS 域名反向代理到终端显示的 `http://127.0.0.1:端口`；这只是域名入口配置，不是安装步骤。

### 3.1 可选：启动 Web 安装向导

在服务器项目根目录运行：

```sh
cd /你的/APPGOG目录
sh deploy/start-installer.sh
```

未指定 Token 时，安装器会生成随机安装 Token，并只在当前终端显示。保持这个终端运行，不要把 Token 发到聊天群、工单或截图中。

如企业流程要求自行指定 Token，至少使用 20 位随机值，并通过环境变量传入。为避免写入 Shell 历史，可使用：

```sh
read -rsp '输入一次性 APPGOG 安装 Token：' APPGOG_INSTALL_TOKEN
printf '\n'
export APPGOG_INSTALL_TOKEN
sh deploy/start-installer.sh
```

不要把生产 Token 写进脚本、面板计划任务或项目文件。安装结束后执行：

```sh
unset APPGOG_INSTALL_TOKEN
```

### 3.2 从本机建立 SSH 隧道

在管理员自己的电脑执行，而不是在服务器执行：

```sh
ssh -N -L 3099:127.0.0.1:3099 root@服务器IP
```

如果使用非 root 账号或自定义 SSH 端口：

```sh
ssh -N -p SSH端口 -L 3099:127.0.0.1:3099 运维账号@服务器IP
```

保持隧道窗口运行，然后在本机浏览器打开：

```text
http://127.0.0.1:3099/install/
```

浏览器地址中不能出现 Token。Token 只粘贴到安装页的 Token 输入框，并仅保存在当前标签页的 `sessionStorage` 中。

### 3.3 无法使用 SSH 隧道时的临时远程模式

只有确实无法建立 SSH 隧道时才使用：

```sh
APPGOG_INSTALL_REMOTE=true sh deploy/start-installer.sh
```

该模式监听 `0.0.0.0:3099`，必须同时满足：

1. 面板为安装向导建立临时 HTTPS 反向代理。
2. 云安全组或防火墙将访问源限制为管理员固定 IP。
3. 禁止直接访问 `http://服务器IP:3099`，禁止用明文 HTTP 发送 Token。
4. 安装完成立即停止向导、删除临时代理并关闭 3099。

### 3.4 五步向导填写说明

#### 第一步：安装 Token

粘贴终端显示或自行设置的安装 Token。Token 错误时安装器不会返回预检和配置接口。

#### 第二步：面板与环境预检

选择实际使用的入口：宝塔、1Panel、aaPanel、Docker 或 SSH。七项预检必须全部通过：

- 项目结构完整；
- 项目目录可写；
- Node.js 22+；
- Docker Engine 可用；
- Docker Compose v2 可用；
- 内存至少 2 GiB；
- 可用磁盘至少 8 GiB。

不要通过修改前端绕过失败项；应在服务器修复对应依赖后重新预检。

#### 第三步：站点配置

| 字段 | 填写要求 |
| --- | --- |
| 正式站点 Origin | 只填 `https://你的域名`，不能带路径、账号、查询参数或 `#` |
| Web 端口 | 默认 8080；冲突时改为未占用端口 |
| 管理员邮箱 | APPGOG 独立管理员，不要求等于 Xboard 邮箱 |
| 管理员显示名 | 后台显示名称 |
| 初始管理员密码 | 至少 16 位、至少三类字符，不能包含邮箱账号部分 |
| Xboard 跳转地址 | 可留空；只允许登录、注册、购买、面板、工单、联盟等普通页面 URL |
| 外部 AI | 默认关闭；启用时服务地址必须为 HTTPS，Key 只保存在服务器 `.env` |

Xboard 地址不能包含 URL 凭据、查询参数、片段，也不能指向 `/api`、`/oauth`、`/sso` 或 `/callback`。

#### 第四步：复核与写入配置

确认域名、Web 端口、管理员邮箱和跳转链接，并勾选完全隔离声明。安装器会在服务端生成独立数据库密码和 JWT 密钥，以权限受限方式写入 `.env`；这些密钥不会返回浏览器。

#### 第五步：部署

安装器固定执行：

1. `docker compose config --quiet`
2. `docker compose build --pull`
3. `docker compose up -d`
4. 容器内访问 `/api/v1/health/ready`
5. `docker compose ps`

任一步失败都会停止后续步骤并显示脱敏日志。成功后写入完成锁，安装向导不能再次修改生产配置。

## 4. 宝塔面板详细安装

宝塔不同版本的文字可能略有差异；反向代理入口以[宝塔官方反向代理文档](https://docs.bt.cn/user-guide/site/php/site-config/reverse-proxy)为准。

### 4.1 安装运行环境

1. 登录宝塔面板。
2. 打开“软件商店”，安装 Docker 管理器/容器管理能力。
3. 安装 Nginx；正式域名由宝塔 Nginx 提供 HTTPS 和反向代理。
4. 安装 Node.js 22+。若面板中的 Node 版本管理器只对 Node 项目生效，必须进入“终端”运行 `node -v` 再确认。
5. 在“终端”运行 `docker --version`、`docker compose version`、`docker info`。

### 4.2 上传源码

1. 打开“文件”。
2. 新建 `/www/wwwroot/appgog`，不要使用 Xboard 的目录。
3. 上传完整源码压缩包并解压，确认 `docker-compose.yml` 位于该目录第一层，而不是多套一层同名文件夹。
4. 在“终端”执行：

```sh
cd /www/wwwroot/appgog
test -f docker-compose.yml && test -f deploy/start-installer.sh
chmod 750 deploy/*.sh
```

### 4.3 运行向导

1. 在宝塔“终端”中进入项目目录。
2. 执行 `sh deploy/start-installer.sh`。
3. 推荐从本机建立 SSH 隧道并打开安装页。
4. 向导的面板类型选择“宝塔面板”，完成五步安装。
5. 保留终端直到部署完成；完成后按 `Ctrl+C` 关闭向导。

### 4.4 配置正式网站和 HTTPS

1. 打开“网站”，添加一个纯静态或空站点，绑定正式域名。
2. 点击该站点域名进入设置，打开“SSL”，申请或导入证书。
3. 开启强制 HTTPS。
4. 打开“反向代理”→“添加反向代理”。
5. 代理名称填写 `APPGOG`，代理目录为 `/`，目标 URL 填写 `http://127.0.0.1:8080`；如果向导选择了其他 Web 端口，同步替换。
6. 发送域名保持请求域名，不做内容替换，不开启会缓存后台/API 响应的代理缓存。
7. 保存后访问 `https://正式域名/` 和 `https://正式域名/admin`。

不需要再给 `/api` 建第二条代理。APPGOG Web 容器已经把 `/api` 转发到独立 API；把 `/api` 指向 Xboard 会破坏完全隔离要求。

### 4.5 宝塔防火墙检查

- 只放行 80、443 和受限来源的 SSH 端口。
- 删除对 3000、3099、5432、6379、8080 的公网放行规则。
- 若使用过临时安装域名，删除对应反向代理和证书绑定。

## 5. 1Panel 详细安装

以下路径以 1Panel v2 为基准；创建反向代理站点和 HTTPS 字段可对照[1Panel 官方创建网站文档](https://1panel.cn/docs/v2/user_manual/websites/website_create/)和[网站配置文档](https://1panel.cn/docs/v2/user_manual/websites/website_config_basic/)。

### 5.1 安装运行环境

1. 登录 1Panel，确认主机 Docker 正常；进入主机终端执行 `docker info` 和 `docker compose version`。
2. 在“应用商店”安装 OpenResty，供正式域名反向代理使用。
3. 在主机安装 Node.js 22+，并在 1Panel“终端”执行 `node -v` 验证。
4. 确认项目目录所在磁盘至少有 8 GiB 可用空间。

### 5.2 上传源码并安装

1. 在“文件”中创建 `/opt/appgog`。
2. 上传并解压完整源码，保持 `docker-compose.yml` 在根目录。
3. 打开“终端”，执行：

```sh
cd /opt/appgog
test -f package.json && test -f docker-compose.yml
chmod 750 deploy/*.sh
sh deploy/start-installer.sh
```

4. 从本机建立 SSH 隧道，安装页选择“1Panel”。
5. 完成部署后按 `Ctrl+C` 关闭向导。
6. 不要在“容器”中把 APPGOG Compose 加入 Xboard 的网络；Compose 项目名必须保持 `appgog`。

### 5.3 创建反向代理网站

1. 打开“网站”→“创建网站”。
2. 类型选择“反向代理”。
3. 主域名填写 APPGOG 正式域名。
4. 代理地址填写 `http://127.0.0.1:8080`，或向导选择的 Web 端口。
5. 启用 HTTPS，选择已导入证书或申请新证书。
6. 创建后进入网站“配置”→“HTTPS”，开启 HTTP 跳转 HTTPS。
7. 不额外创建 `/api` 到 Xboard 的代理，不启用可能缓存管理接口的全站代理缓存。
8. 用网站访问日志确认请求只进入 APPGOG Web 端口。

### 5.4 1Panel 防火墙检查

进入“主机”→“防火墙”，确认只对公网开放 80、443 和必要的 SSH/面板管理端口。3000、3099、5432、6379、8080 不应对公网开放；面板管理端口本身应限制来源 IP。

## 6. aaPanel 详细安装

aaPanel 的 Proxy Project 当前要求 Nginx；菜单与字段以[aaPanel 官方 Proxy Project 文档](https://www.aapanel.com/docs/Function/proxy.html)为准。

### 6.1 安装运行环境

1. 登录 aaPanel。
2. 打开 App Store，安装 Nginx 和 Docker Manager。
3. 安装 Node.js 22+，然后在 Terminal 执行 `node -v`。
4. 执行 `docker info` 和 `docker compose version`，确认 Docker daemon 与 Compose v2 都可用。

### 6.2 上传源码并安装

1. 在 Files 中创建 `/www/wwwroot/appgog`。
2. 上传完整源码并解压到该目录。
3. 打开 Terminal，执行：

```sh
cd /www/wwwroot/appgog
test -f package.json && test -f docker-compose.yml
chmod 750 deploy/*.sh
sh deploy/start-installer.sh
```

4. 使用 SSH 隧道访问安装页，面板类型选择“aaPanel”。
5. 完成五步部署后按 `Ctrl+C` 停止安装向导。

### 6.3 创建 Proxy Project 和 SSL

1. 打开 Website → Proxy Project，选择添加代理项目。
2. Domain 填写 APPGOG 正式域名。
3. Proxy Address 填写 `http://127.0.0.1:8080`，或实际 Web 端口。
4. 代理范围选择整个站点 `/`，不要做内容替换。
5. 进入项目配置的 SSL，申请或导入证书并启用强制 HTTPS。
6. 不把 Cookie 改写为 Xboard 域名，不增加 Xboard API 请求头，不配置 `/api` 到其他应用。
7. 从 Response log 检查 502、413 或循环重定向。

### 6.4 aaPanel 防火墙检查

只放行正式站点所需端口。关闭 3099 和 Web 上游端口的公网规则；面板端口和 SSH 端口限制为运维来源 IP。

## 7. 标准 Docker Compose 详细安装

该方式适用于已经管理 Docker Engine、Nginx/Caddy 或云负载均衡的服务器。

### 7.1 安装 Docker 与 Compose

按服务器发行版使用 Docker 官方仓库。Ubuntu/Debian 在已经配置 Docker 官方仓库后，可安装：

```sh
sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world
```

RPM 系发行版应使用 Docker 对应发行版的官方安装页，不要直接套用 Ubuntu 命令。安装后确认：

```sh
docker --version
docker compose version
docker info
```

### 7.2 上传并安装 APPGOG

```sh
sudo mkdir -p /opt/appgog
sudo chown "$(id -u):$(id -g)" /opt/appgog
```

通过受信任的发布包、SCP 或 SFTP 把源码放入 `/opt/appgog`。不要从不明镜像或第三方脚本安装。然后运行：

```sh
cd /opt/appgog
chmod 750 deploy/*.sh
sh deploy/start-installer.sh
```

通过 SSH 隧道打开向导，类型选择“标准 Docker”，完成部署。

### 7.3 主机 Nginx 反向代理示例

以下示例假定 Web 端口为 8080，证书由主机 Nginx 或上游证书工具管理：

```nginx
server {
    listen 443 ssl http2;
    server_name app.example.com;

    ssl_certificate     /实际证书路径/fullchain.pem;
    ssl_certificate_key /实际证书路径/privkey.pem;
    client_max_body_size 11m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

另建 80 端口站点并做 301 跳转到 HTTPS。不要把示例证书路径原样用于生产；保存配置后运行 `nginx -t` 再平滑重载。

### 7.4 云负载均衡或 CDN

- 上游回源填写服务器 Web 端口，不回源到 API 3000。
- 客户端到边缘、边缘到源站都应使用 HTTPS。
- `/admin`、`/api` 和登录响应不得缓存。
- 媒体上传最大 10 MiB，代理请求体上限至少设置为 11 MiB。
- 真实客户端 IP 只有在明确可信代理地址后才能配置；不要信任任意来源的 `X-Forwarded-For`。

## 8. 纯 SSH Linux 详细安装

纯 SSH 指没有网站面板，但仍使用 Docker Compose 运行 APPGOG。

### 8.1 上传源码

在本机执行：

```sh
scp -P SSH端口 APPGOG发布包.tar.gz 运维账号@服务器IP:/tmp/
```

在服务器执行：

```sh
sudo mkdir -p /opt/appgog
sudo chown "$(id -u):$(id -g)" /opt/appgog
tar -xzf /tmp/APPGOG发布包.tar.gz -C /opt/appgog --strip-components=1
cd /opt/appgog
test -f docker-compose.yml
chmod 750 deploy/*.sh
```

仅对来源可信、内容已检查的发布包执行解压。若发布包根目录没有额外目录，移除 `--strip-components=1`。

### 8.2 运行向导

```sh
cd /opt/appgog
sh deploy/start-installer.sh
```

从本机另开终端建立 SSH 隧道，安装页选择“纯 SSH”。完成部署后回到服务器终端按 `Ctrl+C`。

### 8.3 配置正式入口

可使用主机 Nginx、Caddy 或云负载均衡。Nginx 可采用第 7.3 节配置；Caddy 的最小站点配置为：

```caddyfile
app.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

替换为正式域名和实际 Web 端口。证书签发前确保 DNS、80 和 443 正确。

## 9. 安装完成后的强制验收

在项目根目录执行：

```sh
docker compose config --quiet
docker compose ps
docker compose exec -T api wget --no-verbose --tries=3 --spider http://127.0.0.1:3000/api/v1/health/ready
docker compose logs --tail=100 api
docker compose logs --tail=100 web
```

然后从外部浏览器逐项确认：

1. `https://正式域名/` 可以打开，HTTP 自动跳转 HTTPS。
2. `https://正式域名/admin` 可以登录。
3. 使用安装时填写的管理员账号登录后，在后台安全管理中修改密码并重新登录。
4. 上传一张小于 10 MiB 的测试图片，确认媒体读写正常。
5. 访问公开内容、商城和知识库页面，确认没有 404/502。
6. 检查浏览器网络请求，不得出现 Xboard API、数据库、Cookie、Token 或身份交换。
7. Xboard 普通跳转如已配置，只能打开对应公开页面。
8. 从公网探测 3000、3099、5432、6379 和 Web 上游端口，必须不可访问。

确认安装器已经停止：

```sh
ss -lntp | grep ':3099\b' && echo '错误：安装向导仍在监听' || echo '安装向导已关闭'
```

## 10. 备份与恢复

### 10.1 数据库备份

```sh
cd /你的/APPGOG目录
sh deploy/backup.sh
```

脚本会生成自定义格式的 PostgreSQL dump 和对应 `.sha256` 校验文件，默认放入 `backups/`。必须把备份复制到服务器以外的加密存储；只留在同一块磁盘不算备份。

### 10.2 非破坏性恢复演练

首次上线和每次重大升级后执行：

```sh
sh deploy/backup-restore-drill.sh
```

该脚本会创建临时数据库验证备份，不覆盖生产数据库。只有输出“非破坏性备份恢复演练通过”才算完成。

### 10.3 正式数据库恢复

正式恢复会覆盖当前 APPGOG 数据库。先确认备份文件和校验文件已复制到项目目录，并安排维护窗口：

```sh
APPGOG_RESTORE_CONFIRM=APPGOG_RESTORE sh deploy/restore.sh backups/你的备份.dump
```

恢复脚本会先创建恢复前快照、停止 API、恢复数据库、重新运行迁移/种子并检查健康状态。不得把 Xboard 的数据库备份传给该脚本。

### 10.4 媒体与配置

- 数据库脚本不包含 `appgog_media` 卷；必须为媒体卷配置面板快照、存储快照或独立文件级备份。
- `.env` 包含密钥，必须加密备份并限制权限，不能提交 Git。
- `.appgog-install-state.json` 是安装完成锁；备份它用于判断部署状态，但不要把它当作业务数据备份。
- 记录 `docker volume ls --filter label=com.docker.compose.project=appgog` 输出，确认只备份 APPGOG 卷，不操作 Xboard 卷。

## 11. 升级、回滚与停止服务

### 11.1 升级前

1. 阅读新版本迁移说明并安排维护窗口。
2. 执行 `sh deploy/backup.sh` 和 `sh deploy/backup-restore-drill.sh`。
3. 完成媒体卷快照。
4. 备份 `.env`、当前源码版本号和镜像信息。
5. 不删除 `.appgog-install-state.json`，升级不通过安装向导执行。

### 11.2 升级应用

保留 `.env`、安装状态、`backups/` 和 Docker 卷，更新其余源码后执行：

```sh
docker compose config --quiet
docker compose build --pull
docker compose up -d
docker compose ps
docker compose exec -T api wget --no-verbose --tries=10 --spider http://127.0.0.1:3000/api/v1/health/ready
```

`init` 服务会执行正式迁移。升级完成后再次跑第 9 节验收。

### 11.3 回滚

- 仅应用镜像或静态资源异常且数据库未发生不兼容迁移时，可恢复上一版源码并重新 `build`、`up -d`。
- 数据库已经执行不兼容迁移时，必须使用升级前备份按第 10.3 节恢复，不能只回退镜像。
- 媒体发生不兼容变化时同步恢复媒体卷快照。
- 回滚后重新执行健康检查和外部页面验收。

### 11.4 安全停止

临时停止业务但保留数据：

```sh
docker compose stop
```

恢复：

```sh
docker compose start
```

不要执行 `docker compose down -v`；`-v` 会删除数据库、Redis 和媒体卷。卸载或销毁属于不可恢复操作，必须另行确认备份、目标目录和卷名称。

## 12. 常见故障排查

| 现象 | 检查命令/位置 | 处理结论 |
| --- | --- | --- |
| 安装页打不开 | `ss -lntp \| grep 3099`、SSH 隧道窗口 | 默认只监听回环；确认向导和隧道都未退出 |
| Token 无效 | 启动向导的终端、浏览器当前标签页 | 使用当前进程输出的 Token；重启向导会生成新 Token |
| 预检提示 Docker 缺失 | `docker info` | 只装面板插件不等于 daemon 可用，修复 Docker 后重试 |
| Compose 命令不存在 | `docker compose version` | 安装 Compose v2 插件，不使用旧 `docker-compose` |
| `.env` 已存在 | `ls -la .env` | 停止安装并确认是否已有环境；不要删除后强行重装 |
| 8080 被占用 | `ss -lntp \| grep ':8080\b'` | 向导中选择其他 Web 端口，并同步修改面板代理目标 |
| 反向代理 502 | `docker compose ps`、Web/API 日志 | 先确认容器健康，再核对代理端口是否等于 `APPGOG_WEB_PORT` |
| 上传返回 413 | 面板/Nginx/负载均衡配置 | 请求体上限至少 11 MiB；应用仍会执行 10 MiB 文件上限 |
| 登录后 CORS/Cookie 异常 | `.env` 中 `APP_ORIGIN`、`ADMIN_ORIGIN` | 必须精确等于浏览器 HTTPS Origin，不带路径或尾随配置 |
| API 不健康 | `docker compose logs --tail=200 init api postgres redis` | 先处理迁移、数据库或 Redis 错误，不反复删除卷重装 |
| 证书循环跳转 | 面板代理协议和 `X-Forwarded-Proto` | 外部 Origin 用 HTTPS，代理正确传递原始协议 |
| Xboard 跳转被拒绝 | 检查 URL | 移除凭据、查询参数、片段和 API/SSO/回调路径 |
| 磁盘持续增长 | `docker system df`、媒体卷、日志 | 先确认可清理对象，不执行会删除在用卷的批量清理命令 |

日志中可能包含业务标识，不要把完整 `.env`、Token、管理员密码或 AI Key 粘贴到工单。向外提供日志前先脱敏。

## 13. 最终签收表

| 项目 | 必须结果 |
| --- | --- |
| 七项安装器预检 | 全部通过 |
| Compose 服务 | `api` healthy，`web`、`postgres`、`redis` 正常 |
| 正式域名 | HTTPS 正常，HTTP 自动跳转 |
| 官网与后台 | `/`、`/admin` 可用 |
| 管理员 | 独立账号可登录，初始密码已修改 |
| 媒体 | 上传与读取通过 |
| 数据库恢复演练 | 脚本明确输出通过 |
| 防火墙 | 3000、3099、5432、6379、Web 上游端口不对公网开放 |
| 安装向导 | 已停止，临时代理和规则已删除 |
| Xboard 隔离 | 无 API、数据库、账号、Cookie、身份或 Token 交换 |
| 备份 | 数据库、媒体、配置均有服务器外副本 |

以上项目未全部通过时，只能记录为“已部署待验”，不能宣称生产上线完成。
