import { PrismaClient, type OutboundLinkKind } from '@prisma/client';
import { hash } from 'bcryptjs';
import { assertStrongPassword } from '../src/password-policy';

const db = new PrismaClient();

const outboundLinks: Array<{ kind: OutboundLinkKind; label: string; env: string }> = [
  { kind: 'LOGIN', label: '登录', env: 'XBOARD_LOGIN_URL' },
  { kind: 'REGISTER', label: '注册', env: 'XBOARD_REGISTER_URL' },
  { kind: 'PURCHASE', label: '购买套餐', env: 'XBOARD_PURCHASE_URL' },
  { kind: 'DASHBOARD', label: '用户面板', env: 'XBOARD_DASHBOARD_URL' },
  { kind: 'TICKET', label: '提交工单', env: 'XBOARD_TICKET_URL' },
  { kind: 'AFFILIATE', label: '联盟营销', env: 'XBOARD_AFFILIATE_URL' }
];

function requireInitialPassword(email: string) {
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  if (!password) throw new Error('首次初始化必须提供 ADMIN_INITIAL_PASSWORD');
  assertStrongPassword(password, email);
  return password;
}

function plainHttpUrl(value: string, envName: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.search || url.hash) {
    throw new Error(`${envName} 必须是不含查询参数和片段的普通 HTTP/HTTPS URL`);
  }
  return url.toString();
}

async function main() {
  const email = (process.env.ADMIN_EMAIL || 'admin@appgog.local').trim().toLowerCase();
  const passwordHash = await hash(requireInitialPassword(email), 12);

  await db.adminUser.upsert({
    where: { email },
    update: {},
    create: {
      email,
      displayName: process.env.ADMIN_DISPLAY_NAME || 'APPGOG 管理员',
      role: 'SUPER_ADMIN',
      passwordHash
    }
  });

  await db.globalSetting.upsert({
    where: { key: 'system.schemaVersion' },
    update: { value: 11 },
    create: { key: 'system.schemaVersion', value: 11, public: false }
  });

  for (const item of outboundLinks) {
    const configuredUrl = process.env[item.env];
    if (!configuredUrl) continue;
    await db.outboundLink.upsert({
      where: { kind: item.kind },
      update: {},
      create: {
        kind: item.kind,
        label: item.label,
        destinationUrl: plainHttpUrl(configuredUrl, item.env)
      }
    });
  }
}

main().finally(() => db.$disconnect());
