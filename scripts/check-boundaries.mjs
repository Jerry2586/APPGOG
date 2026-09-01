import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const root = new URL('../', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1');
const roots = ['apps', 'packages'];
const ignored = new Set(['node_modules', 'dist', 'coverage', '.git']);
const extensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.vue', '.json', '.prisma', '.yaml', '.yml']);
const forbidden = [
  [/XBOARD_(?:SSO|API|DB|DATABASE|SESSION|TOKEN|SECRET)/i, '禁止配置 Xboard 密钥、API、Session 或数据库'],
  [/xboardUserId/i, '禁止建立 Xboard 用户映射'],
  [/xboard\/(?:sso|callback)/i, '禁止实现 Xboard SSO 或回调'],
  [/(?:axios|fetch)\s*\([^\n]*(?:xboard|panel\.)/i, '禁止从 APPGOG 请求 Xboard'],
  [/(?:签到|盲盒|抽奖|Daily Check-in|Lucky Draw)/i, '活动中心已明确排除'],
  [/Xboard-master|theme[\\/]APPGOG/i, 'APPGOG 应用不得导入或依赖独立 Xboard 源码/主题']
];

const violations = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (extensions.has(extname(entry.name))) {
      const text = readFileSync(path, 'utf8');
      for (const [pattern, reason] of forbidden) if (pattern.test(text)) violations.push(`${relative(root, path)}: ${reason}`);
    }
  }
}
for (const item of roots) walk(join(root, item));
if (violations.length) {
  console.error('APPGOG 边界检查失败：\n' + violations.map(x => `- ${x}`).join('\n'));
  process.exit(1);
}
console.log('APPGOG 边界检查通过：未发现 Xboard 越界连接、身份共享或已排除活动模块。');
