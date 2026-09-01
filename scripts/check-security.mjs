import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const authService = read('apps/api/src/auth.service.ts');
const authController = read('apps/api/src/auth.controller.ts');
const authGuard = read('apps/api/src/auth.guard.ts');
const permissionGuard = read('apps/api/src/admin-permission.guard.ts');
const originGuard = read('apps/api/src/admin-origin.guard.ts');
const securityConfig = read('apps/api/src/security.config.ts');
const main = read('apps/api/src/main.ts');
const webApi = read('apps/web/src/api.ts');
const webLogin = read('apps/web/src/views/Login.vue');
const schema = read('apps/api/prisma/schema.prisma');
const migration = read('apps/api/prisma/migrations/20260829040000_stage4_admin_security/migration.sql');

const failures = [];
const required = (text, pattern, message) => {
  if (!pattern.test(text)) failures.push(message);
};

required(schema, /model\s+AdminSession\s*\{[\s\S]*?tokenHash\s+String\s+@unique/, '缺少服务端哈希会话');
required(schema, /model\s+AdminLoginAttempt\s*\{/, '缺少数据库登录限流模型');
required(migration, /AdminLoginAttempt_failure_count_check/, '登录限流迁移缺少失败次数约束');
required(authService, /MAX_LOGIN_FAILURES\s*=\s*5/, '登录失败阈值不是 5 次');
required(authService, /ADMIN_REFRESH_REUSE_DETECTED/, '缺少刷新令牌重放检测');
required(authService, /randomBytes\(48\)/, '刷新令牌随机强度不足');
required(authService, /timingSafeEqual/, '刷新令牌哈希未使用常量时间比较');
required(authGuard, /adminSession\.findUnique/, '访问令牌未绑定数据库会话');
required(authGuard, /session\.revokedAt/, '守卫未检查会话撤销状态');
required(securityConfig, /expiresIn:\s*'15m'/, '访问令牌不是 15 分钟短时效');
required(securityConfig, /secret\.length\s*<\s*32/, 'JWT 密钥未强制至少 32 位');
required(authController, /httpOnly:\s*true/, '刷新 Cookie 未设置 HttpOnly');
required(authController, /sameSite:\s*'strict'/, '刷新 Cookie 未设置 SameSite=Strict');
required(authController, /secure:\s*this\.config\.get.*NODE_ENV.*production/, '生产刷新 Cookie 未设置 Secure');
required(originGuard, /configuredAdminOrigins/, '认证接口缺少 Origin 白名单');
required(permissionGuard, /sensitiveResources\s*=\s*\['globalSetting',\s*'pluginSnippet'\]/, '敏感资源未单独授权');
required(permissionGuard, /user\.role\s*!==\s*'SUPER_ADMIN'/, '敏感资源未限制超级管理员');
required(main, /helmet\(\)/, 'API 未启用完整 Helmet 安全头');
required(main, /forbidNonWhitelisted:\s*true/, 'DTO 未拒绝白名单外字段');
required(webApi, /withCredentials:\s*true/, 'Web 未启用 HttpOnly Cookie 凭据');
required(webApi, /let accessToken:\s*string\s*\|\s*null\s*=\s*null/, 'Web 访问令牌不是仅存内存');

const browserAuth = webApi + webLogin;
if (/localStorage\.(?:getItem|setItem)\([^\n]*(?:token|auth)/i.test(browserAuth)) {
  failures.push('管理令牌仍写入 LocalStorage');
}
if (/Xboard|xboard/i.test(authService + authController + authGuard + permissionGuard + schema.match(/model AdminUser[\s\S]*?\n\}/)?.[0])) {
  failures.push('APPGOG 管理认证出现 Xboard 身份依赖');
}

if (failures.length) {
  console.error('APPGOG 管理安全检查失败：\n' + failures.map(item => `- ${item}`).join('\n'));
  process.exit(1);
}
console.log('APPGOG 管理安全检查通过：会话、轮换、限流、Cookie、Origin、RBAC 和浏览器存储边界完整。');
