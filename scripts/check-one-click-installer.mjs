import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const installer = read('deploy/install-one-click.sh');
const starter = read('deploy/start-installer.sh');
const guide = read('docs/INSTALLATION-WIZARD.md');
const readme = read('README.md');
const failures = [];
const required = (text, pattern, message) => { if (!pattern.test(text)) failures.push(message); };
const forbidden = (text, pattern, message) => { if (pattern.test(text)) failures.push(message); };

required(installer, /repository_url='https:\/\/github\.com\/Jerry2586\/APPGOG\.git'/, '一键脚本没有固定官方仓库地址');
required(installer, /installer_revision='[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]+'[\s\S]*服务器一键安装脚本版本/, '一键脚本没有可核验的版本输出');
required(installer, /install_directory=\$\{APPGOG_DIR:-\/opt\/APPGOG\}/, '一键脚本缺少安全的默认安装目录');
required(installer, /目标目录非空且不是 Git 仓库/, '一键脚本没有保护非 Git 的非空目录');
required(installer, /检测到非一键脚本管理的 \.env，拒绝覆盖[\s\S]*root 拥有且权限为 0600/, '一键脚本未拒绝非安装器管理或权限不安全的 .env');
required(installer, /download\.docker\.com\/linux\//, 'Docker 未使用官方软件源');
required(installer, /docker compose version[\s\S]*docker info/, '一键脚本未验证 Compose v2 和 Docker daemon');
required(installer, /git clone --depth 1 --branch "\$repository_ref" --single-branch/, '一键脚本未固定分支执行浅克隆');
required(installer, /git -C "\$install_directory" status --porcelain[\s\S]*core\.fileMode=false[\s\S]*内容修改[\s\S]*pull --ff-only origin/, '一键脚本不能区分旧脚本的纯权限变化与真实内容修改');
required(installer, /openssl rand -hex 30[\s\S]*openssl rand -hex 48[\s\S]*openssl rand -hex 18/, '一键脚本没有生成数据库、JWT 和管理员随机密钥');
required(installer, /mktemp "\$install_directory\/\.env\.tmp\.[X]+"[\s\S]*chmod 600[\s\S]*mv "\$environment_tmp" "\$install_directory\/\.env"/, '一键脚本没有原子写入受保护的生产环境配置');
required(installer, /docker compose config --quiet[\s\S]*docker compose build --pull[\s\S]*docker compose up -d --wait --wait-timeout 300/, '一键脚本没有直接验证、构建并启动 Compose 服务');
required(installer, /api\/v1\/health\/ready[\s\S]*"status": "completed"/, '一键脚本没有完成健康检查或写入完成状态');
required(installer, /后台地址：[\s\S]*管理员账号：[\s\S]*初始密码：/, '一键脚本成功后没有显示后台地址和管理员凭据');
for (const pattern of [/APPGOG_DOMAIN=/, /COMPOSE_PROFILES=gateway/, /--resolve "\$origin_host:443:127\.0\.0\.1"/, /HTTPS 网关/]) required(installer, pattern, '服务器一键脚本没有自动启用并验证 HTTPS 网关');
required(installer, /APPGOG_INSTALL_MANAGED=true[\s\S]*root 拥有且权限为 0600[\s\S]*recover_known_empty_stage3_failure/, '一键脚本不能安全恢复自己创建的未完成安装');
required(installer, /20260829030000_stage3_data_model[\s\S]*business_data[\s\S]*DROP SCHEMA public CASCADE/, '一键脚本缺少已知空库迁移失败的受限恢复流程');
required(installer, /resume_install" != true \]; then return 0[\s\S]*migration_state" != recoverable \]; then[\s\S]*return 0/, '一键脚本的无需恢复分支可能在 set -e 下错误退出');
required(starter, /APPGOG_NODE_BIN:-\/opt\/appgog-runtime\/current\/bin\/node/, '向导启动脚本不能复用一键安装的隔离 Node.js 运行时');
required(guide + readme, /install-one-click\.sh[\s\S]*Jerry2586\/APPGOG/, '文档缺少 GitHub 一键安装入口');
forbidden(installer, /curl[^\n]*\|\s*(?:sh|bash)|\beval\b|docker compose down -v/, '一键脚本包含管道执行远程脚本、eval 或删除数据卷');
forbidden(installer, /start-installer\.sh|127\.0\.0\.1:3099|nodejs\.org/, '服务器一键脚本仍依赖 Web 向导、3099 或宿主机 Node.js');
forbidden(installer, /chmod\s+750[^\n]*deploy\/\*\.sh/, '服务器一键脚本不应再次制造 Git 文件权限变化');

if (failures.length) {
  console.error('APPGOG 一键安装检查失败：\n' + failures.map(item => `- ${item}`).join('\n'));
  process.exit(1);
}
console.log('APPGOG 服务器一键安装检查通过：官方仓库、非覆盖安装、密钥生成、Compose 直装、健康检查与凭据输出完整。');
