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
required(installer, /目标目录非空，拒绝覆盖/, '一键脚本可能覆盖现有目录');
required(installer, /\[ ! -e "\$install_directory\/\.env" \]/, '一键脚本未禁止仓库携带 .env');
required(installer, /download\.docker\.com\/linux\//, 'Docker 未使用官方软件源');
required(installer, /nodejs\.org\/dist\/latest-v22\.x[\s\S]*SHASUMS256\.txt[\s\S]*sha256sum/, 'Node.js 22 未从官方源下载或未校验 SHA-256');
required(installer, /docker compose version[\s\S]*docker info/, '一键脚本未验证 Compose v2 和 Docker daemon');
required(installer, /git clone --depth 1 --branch "\$repository_ref" --single-branch/, '一键脚本未固定分支执行浅克隆');
required(installer, /exec sh deploy\/start-installer\.sh/, '一键脚本没有进入受 Token 保护的向导');
required(starter, /APPGOG_NODE_BIN:-\/opt\/appgog-runtime\/current\/bin\/node/, '向导启动脚本不能复用一键安装的隔离 Node.js 运行时');
required(guide + readme, /install-one-click\.sh[\s\S]*Jerry2586\/APPGOG/, '文档缺少 GitHub 一键安装入口');
forbidden(installer, /curl[^\n]*\|\s*(?:sh|bash)|\beval\b|docker compose down -v/, '一键脚本包含管道执行远程脚本、eval 或删除数据卷');

if (failures.length) {
  console.error('APPGOG 一键安装检查失败：\n' + failures.map(item => `- ${item}`).join('\n'));
  process.exit(1);
}
console.log('APPGOG 一键安装检查通过：官方仓库、官方依赖源、SHA-256、非覆盖安装与 Token 向导入口完整。');
