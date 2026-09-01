import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const schemaPath = new URL('../apps/api/prisma/schema.prisma', import.meta.url);
const migrationsPath = new URL('../apps/api/prisma/migrations/', import.meta.url);
const seedPath = new URL('../apps/api/prisma/seed.ts', import.meta.url);
const schema = readFileSync(schemaPath, 'utf8');
const seed = readFileSync(seedPath, 'utf8');
const migrationSql = readdirSync(migrationsPath, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .sort((a, b) => a.name.localeCompare(b.name))
  .map(entry => readFileSync(join(migrationsPath.pathname.replace(/^\/(.:\/)/, '$1'), entry.name, 'migration.sql'), 'utf8'))
  .join('\n');
const stage3Migration = readFileSync(new URL('../apps/api/prisma/migrations/20260829030000_stage3_data_model/migration.sql', import.meta.url), 'utf8');

const failures = [];
const requirePattern = (text, pattern, message) => {
  if (!pattern.test(text)) failures.push(message);
};

for (const model of [
  'AdminUser', 'AdminSession', 'Page', 'PageVersion', 'Category', 'Content',
  'KnowledgeChunk', 'KnowledgeIndexJob', 'Product', 'Theme', 'ThemeSchedule',
  'MarketingCampaign', 'GlobalSetting', 'PluginSnippet', 'PluginSnippetVersion',
  'OutboundLink', 'PublishedPageRoute', 'MediaAsset', 'AuditLog'
]) {
  requirePattern(schema, new RegExp(`\\bmodel\\s+${model}\\s*\\{`), `缺少核心模型 ${model}`);
}

requirePattern(schema, /draftVersionId\s+String\?/, '页面缺少独立草稿版本引用');
requirePattern(schema, /publishedVersionId\s+String\?/, '页面缺少独立发布版本引用');
requirePattern(schema, /faqQuestion\s+String\?/, 'FAQ 缺少结构化问题字段');
requirePattern(schema, /faqAnswer\s+String\?/, 'FAQ 缺少结构化答案字段');
requirePattern(schema, /embedding\s+Unsupported\("vector\(1536\)"\)/, '知识分块缺少向量字段');
requirePattern(schema, /enum\s+CategoryScope[\s\S]*?CONTENT[\s\S]*?PRODUCT/, '分类未隔离内容域和商品域');
requirePattern(schema, /enum\s+PublishStatus[\s\S]*?OFFLINE/, '发布生命周期缺少下线状态');

const forbiddenModels = /\bmodel\s+(?:Xboard\w*|Order|Payment|Subscription|Traffic\w*|Node|Ticket|Balance|Commission|Invite)\s*\{/i;
if (forbiddenModels.test(schema)) failures.push('数据库出现 Xboard 核心业务或镜像模型');
if (/xboardUserId|XBOARD_(?:DB|DATABASE|API|SSO|SESSION|TOKEN|SECRET)/i.test(schema + seed + migrationSql)) {
  failures.push('数据库层出现禁止的 Xboard 连接、身份或密钥字段');
}

for (const [pattern, message] of [
  [/Category_prevent_cycle/, '迁移缺少分类防循环触发器'],
  [/Page_validate_versions/, '迁移缺少页面版本归属校验'],
  [/PageVersion_immutable/, '迁移缺少页面版本不可覆盖约束'],
  [/Content_searchVector_idx/, '迁移缺少 CMS 全文搜索索引'],
  [/KnowledgeChunk_embedding_idx/, '迁移缺少向量近邻索引'],
  [/Theme_single_active_key/, '迁移缺少唯一活动主题约束'],
  [/ThemeSchedule_no_enabled_overlap/, '迁移缺少主题调度冲突约束'],
  [/PluginSnippet_delay_min_check/, '迁移缺少插件最短延迟约束'],
  [/PluginSnippetVersion_immutable/, '迁移缺少插件版本不可覆盖约束'],
  [/OutboundLink_plain_url_check/, '迁移缺少普通外跳 URL 约束'],
  [/AuditLog_append_only/, '迁移缺少审计日志不可变约束'],
  [/MediaAsset_storage_key_check/, '迁移缺少媒体存储键约束'],
  [/MediaAsset_mime_type_check/, '迁移缺少媒体 MIME 白名单']
]) requirePattern(migrationSql, pattern, message);

if (/ChangeMe|ADMIN_INITIAL_PASSWORD\s*\|\|/i.test(seed)) failures.push('种子脚本存在弱口令回退');
requirePattern(seed, /ADMIN_INITIAL_PASSWORD/, '种子脚本未强制首次管理员密码');
requirePattern(stage3Migration, /BEGIN;[\s\S]*ALTER TABLE "Category" DROP CONSTRAINT "Category_slug_key";[\s\S]*COMMIT;/, '第 3 阶段迁移没有在事务内正确删除分类唯一约束');
if (/DROP INDEX "Category_slug_key"/.test(stage3Migration)) failures.push('第 3 阶段迁移错误地删除唯一约束的底层索引');

if (failures.length) {
  console.error('APPGOG 数据库基线检查失败：\n' + failures.map(item => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log('APPGOG 数据库基线检查通过：核心模型、隔离边界、迁移约束和安全种子均完整。');
