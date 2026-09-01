import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const server = read('deploy/installer/server.mjs');
const html = read('deploy/installer/index.html');
const app = read('deploy/installer/app.js');
const css = read('deploy/installer/style.css');
const guide = read('docs/INSTALLATION-WIZARD.md');
const start = read('deploy/start-installer.sh');
const compose = read('docker-compose.yml');
const failures = [];
const required = (text, pattern, message) => { if (!pattern.test(text)) failures.push(message); };
const forbidden = (text, pattern, message) => { if (pattern.test(text)) failures.push(message); };

for (const panel of ['bt', '1panel', 'aapanel', 'docker', 'ssh']) required(server, new RegExp(`['"]${panel}['"]`), `安装服务缺少面板 ${panel}`);
required(server, /host:\s*'127\.0\.0\.1'[\s\S]*--allow-remote/, '安装服务未默认回环监听或远程监听无需显式授权');
required(server, /timingSafeEqual/, '安装 Token 未使用常量时间比较');
required(server, /APPGOG_INSTALL_TOKEN/, '安装服务不支持通过环境变量安全传入 Token');
required(server, /sec-fetch-site[\s\S]*cross-site/, '安装接口缺少跨站请求拒绝');
required(server, /existsSync\(environmentPath\)[\s\S]*拒绝覆盖/, '安装器可能覆盖已有 .env');
required(server, /shell:\s*false/, '部署命令未禁用 Shell');
required(server, /staticFiles\.has\(path\)/, '安装静态服务未使用文件白名单');
required(server, /\['compose', 'config', '--quiet'\][\s\S]*\['compose', 'build', '--pull'\][\s\S]*\['compose', 'up', '-d'\][\s\S]*health\/ready/, '部署流程不是固定的验证、构建、启动和健康检查');
required(server, /status:\s*'completed'/, '安装完成后未写入完成状态');
required(server, /APPGOG 已完成安装，向导已锁定/, '完成状态未拒绝再次安装');
forbidden(server + html + app, /XBOARD_(?:TOKEN|API|DB|DATABASE|SESSION|SECRET)|xboardToken/i, '安装器出现禁止的 Xboard Token/API/数据库配置');
required(html, /安装 Token[\s\S]*宝塔面板[\s\S]*1Panel[\s\S]*aaPanel[\s\S]*Docker[\s\S]*SSH/, '安装界面缺少 Token 或跨面板入口');
required(html, /data-screen="auth"[\s\S]*data-screen="check"[\s\S]*data-screen="config"[\s\S]*data-screen="review"[\s\S]*data-screen="deploy"/, '安装界面不是完整五步流程');
required(app, /sessionStorage\.setItem\('appgog-install-token'/, '安装 Token 未使用标签页级存储');
forbidden(html, /https?:\/\/(?:fonts|cdn|unpkg|jsdelivr)/i, '安装界面依赖外部 CDN，离线面板无法安装');
required(css, /@media\(max-width:600px\)[\s\S]*prefers-reduced-motion/, '安装界面缺少手机响应式或减少动画支持');
required(start, /Node\.js 22[\s\S]*APPGOG_INSTALL_REMOTE[\s\S]*--allow-remote/, '跨面板启动脚本缺少运行时或远程显式授权');
required(compose, /APPGOG_WEB_PORT:-8080/, 'Compose 不支持面板自定义 Web 反向代理端口');
for (const title of ['宝塔面板', '1Panel', 'aaPanel', '标准 Docker', '纯 SSH', '安装 Token']) required(guide, new RegExp(title), `安装文档缺少 ${title}`);

if (failures.length) { console.error('APPGOG 安装向导检查失败：\n' + failures.map(item => `- ${item}`).join('\n')); process.exit(1); }
console.log('APPGOG 安装向导检查通过：五种面板、一次性 Token、固定部署命令、完成锁和响应式离线界面完整。');
