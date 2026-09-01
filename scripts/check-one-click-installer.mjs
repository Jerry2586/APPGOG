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
required(installer, /install_directory=\$\{APPGOG_DIR:-\/opt\/APPGOG\}/, '一键脚本缺少安全的默认安装目录');
required(installer, /目标目录非空且不是 Git 仓库/, '一键脚本没有保护非 Git 的非空目录');
required(installer, /\[ ! -e "\$install_directory\/\.env" \]/, '一键脚本未禁止仓库携带 .env');
required(installer, /download\.docker\.com\/linux\//, 'Docker 未使用官方软件源');
required(installer, /docker compose version[\s\S]*docker info/, '一键脚本未验证 Compose v2 和 Docker daemon');
required(installer, /git clone --depth 1 --branch "\$repository_ref" --single-branch/, '一键脚本未固定分支执行浅克隆');
required(installer, /git -C "\$install_directory" status --porcelain[\s\S]*pull --ff-only origin/, '一键脚本不能安全续用并快进更新官方干净仓库');
required(installer, /openssl rand -hex 30[\s\S]*openssl rand -hex 48[\s\S]*openssl rand -hex 18/, '一键脚本没有生成数据库、JWT 和管理员随机密钥');
required(installer, /mktemp "\$install_directory\/\.env\.tmp\.[X]+"[\s\S]*chmod 600[\s\S]*mv "\$environment_tmp" "\$install_directory\/\.env"/, '一键脚本没有原子写入受保护的生产环境配置');
required(installer, /docker compose config --quiet[\s\S]*docker compose build --pull[\s\S]*docker compose up -d --wait --wait-timeout 300/, '一键脚本没有直接验证、构建并启动 Compose 服务');
required(installer, /api\/v1\/health\/ready[\s\S]*"status": "completed"/, '一键脚本没有完成健康检查或写入完成状态');
required(installer, /后台地址：[\s\S]*管理员账号：[\s\S]*初始密码：/, '一键脚本成功后没有显示后台地址和管理员凭据');
required(starter, /APPGOG_NODE_BIN:-\/opt\/appgog-runtime\/current\/bin\/node/, '向导启动脚本不能复用一键安装的隔离 Node.js 运行时');
required(guide + readme, /install-one-click\.sh[\s\S]*Jerry2586\/APPGOG/, '文档缺少 GitHub 一键安装入口');
forbidden(installer, /curl[^\n]*\|\s*(?:sh|bash)|\beval\b|docker compose down -v/, '一键脚本包含管道执行远程脚本、eval 或删除数据卷');
forbidden(installer, /start-installer\.sh|127\.0\.0\.1:3099|nodejs\.org/, '服务器一键脚本仍依赖 Web 向导、3099 或宿主机 Node.js');

if (failures.length) {
  console.error('APPGOG 一键安装检查失败：\n' + failures.map(item => `- ${item}`).join('\n'));
  process.exit(1);
}
console.log('APPGOG 服务器一键安装检查通过：官方仓库、非覆盖安装、密钥生成、Compose 直装、健康检查与凭据输出完整。');
