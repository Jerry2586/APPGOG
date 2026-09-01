import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const fromRoot = path => new URL(`../${path}`, import.meta.url);
const themeRoot = 'integrations/xboard-theme/APPGOG';
const requiredFiles = [
  `${themeRoot}/config.json`,
  `${themeRoot}/dashboard.blade.php`,
  `${themeRoot}/assets/umi.js`,
  `${themeRoot}/assets/appgog.css`,
  `${themeRoot}/assets/appgog-shell.js`,
  `${themeRoot}/assets/images/background.svg`
];
const failures = [];
const requireMatch = (text, pattern, message) => { if (!pattern.test(text)) failures.push(message); };
const read = path => readFileSync(fromRoot(path));
const readText = path => read(path).toString('utf8');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();

for (const path of requiredFiles) if (!existsSync(fromRoot(path))) failures.push(`主题缺少 ${path}`);

if (!failures.length) {
  const config = JSON.parse(readText(`${themeRoot}/config.json`));
  const blade = readText(`${themeRoot}/dashboard.blade.php`);
  const shell = readText(`${themeRoot}/assets/appgog-shell.js`);
  const css = readText(`${themeRoot}/assets/appgog.css`);
  const themeUmi = read(`${themeRoot}/assets/umi.js`);
  const expectedUmiHash = '69FF1E68DD44B84F803E631367B6FC9DFD52E79D049067FA52CFA859031F20DC';

  if (config.name !== 'APPGOG') failures.push('主题名称必须为 APPGOG');
  if (!/^\d+\.\d+\.\d+$/.test(config.version)) failures.push('主题版本必须使用语义化版本');
  if (!Array.isArray(config.configs) || config.configs.length !== 2 || config.configs.some(item => item.field_type !== 'select')) {
    failures.push('主题配置必须只包含受控下拉字段，禁止任意 HTML/脚本配置');
  }
  if (sha256(themeUmi) !== expectedUmiHash) failures.push('APPGOG 主题原生业务资产已变化，必须重新执行兼容审查');

  for (const label of ['仪表盘', '使用文档', '流量商店', '我的套餐', '我的订单', '我的邀请', '个人中心', '我的工单', '流量明细']) {
    requireMatch(shell, new RegExp(`label: '${label}'`), `主导航缺少“${label}”`);
  }
  for (const route of ['/dashboard', '/knowledge', '/plan', '/order', '/invite', '/profile', '/ticket', '/traffic', '/node']) {
    requireMatch(shell, new RegExp(`path: '${route.replace('/', '\\/')}`), `主题缺少原生路由入口 ${route}`);
  }
  for (const originalRoute of ['/dashboard', '/knowledge', '/plan', '/order', '/invite', '/profile', '/ticket', '/traffic', '/node']) {
    if (!themeUmi.includes(Buffer.from(originalRoute))) failures.push(`主题原生业务资产缺少预期路由 ${originalRoute}`);
  }

  requireMatch(blade, /Illuminate\\Support\\Js::from/, 'Blade 配置值没有使用安全 JSON 序列化');
  requireMatch(blade, /window\.settings[\s\S]*assets_path[\s\S]*theme[\s\S]*version[\s\S]*background_url[\s\S]*description[\s\S]*i18n[\s\S]*logo/, '主题未保持默认前端所需 window.settings 契约');
  requireMatch(shell, /MutationObserver/, '主题缺少对 Vue 路由重绘的兼容处理');
  requireMatch(shell, /会话与业务数据由 Xboard 原生机制管理/, '登录后缺少简洁且真实的会话状态说明');
  requireMatch(css, /@media \(max-width: 760px\)/, '主题缺少手机响应式规则');
  requireMatch(css, /prefers-reduced-motion: reduce/, '主题缺少减少动画规则');
  requireMatch(css, /focus-visible/, '主题缺少键盘焦点样式');

  const authored = `${blade}\n${shell}\n${css}`;
  const forbidden = [
    [/fetch\s*\(|XMLHttpRequest|WebSocket|EventSource/, '主题增强层不得新增网络请求'],
    [/localStorage|sessionStorage|document\.cookie/, '主题增强层不得新增身份或会话存储'],
    [/APPGOG_(?:API|DB|DATABASE|TOKEN|SECRET)|xboardUserId|\/xboard\/(?:sso|callback)/i, '主题出现跨系统身份/API/数据库连接'],
    [/\{!!|custom_html/, '主题不得执行任意后台 HTML/脚本配置'],
    [/(?:签到|盲盒|抽奖|活动中心|99\.99|10Gbps|军事级|零日志无手令|在线用户|实时节点)/i, '主题包含已排除功能或未经确认的业务事实'],
    [/https?:\/\//i, '主题增强层不得写死外部地址']
  ];
  for (const [pattern, message] of forbidden) if (pattern.test(authored)) failures.push(message);
}

if (failures.length) {
  console.error('APPGOG Xboard 独立主题检查失败：\n' + failures.map(item => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log('APPGOG Xboard 独立主题检查通过：原生业务资产同哈希、9 项核心导航与节点入口完整，未新增跨系统请求或会话共享。');
