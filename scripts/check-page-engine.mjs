import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const schema = read('apps/api/prisma/schema.prisma');
const migration = read('apps/api/prisma/migrations/20260829050000_stage5_page_engine/migration.sql');
const service = read('apps/api/src/page.service.ts');
const controller = read('apps/api/src/page.controller.ts');
const layout = read('apps/api/src/page-layout.ts');
const componentRegistry = read('apps/api/src/component-registry.ts');
const genericAdmin = read('apps/api/src/admin.controller.ts');
const publicController = read('apps/api/src/public.controller.ts');
const editor = read('apps/web/src/components/PageEditor.vue');
const history = read('apps/web/src/layout-history.ts');

const failures = [];
const required = (text, pattern, message) => { if (!pattern.test(text)) failures.push(message); };

required(schema, /model\s+PublishedPageRoute\s*\{[\s\S]*?slug\s+String\s+@id/, '缺少唯一线上路由索引');
required(schema, /model\s+PageVersion\s*\{[\s\S]*?layout\s+Json[\s\S]*?seoTitle/, '版本未快照页面布局与 SEO');
required(schema, /nextVersion\s+Int\s+@default\(1\)/, '缺少并发安全版本序号');
required(migration, /PublishedPageRoute_validate/, '迁移缺少发布路由归属校验');
required(migration, /Page_next_version_check/, '迁移缺少版本序号约束');

for (const endpoint of ['create', 'saveDraft', 'publish', 'status', 'versions', 'preview', 'restore', 'remove']) {
  required(controller, new RegExp(`\\b${endpoint}\\b`), `缺少页面接口 ${endpoint}`);
}
required(service, /baseVersionId[\s\S]*?ConflictException/, '草稿保存缺少乐观并发控制');
required(service, /TransactionIsolationLevel\.Serializable/, '版本写入未使用串行化事务');
required(service, /publishedPageRoute\.create/, '发布未建立独立线上路由');
required(publicController, /pages\/\*slug/, '公开页面接口不支持嵌套路由');

required(layout, /MAX_PAGE_TREE_DEPTH\s*=\s*10/, '页面树缺少深度上限');
required(layout, /MAX_PAGE_BLOCKS\s*=\s*500/, '页面树缺少组件数上限');
required(layout + componentRegistry, /BLOCK_TYPES[\s\S]*?COMPONENT_TYPES[\s\S]*?type:\s*'header'[\s\S]*?type:\s*'footer'/, '缺少组件注册白名单');
required(layout, /ids\.has\(id\)/, '缺少组件 ID 唯一校验');
required(layout, /type\s*!==\s*'grid'\s*&&\s*children\.length/, '非容器组件仍可非法嵌套');
required(layout, /url\.search\s*\|\|\s*url\.hash/, '组件外跳 URL 缺少纯跳转限制');
required(layout, /assertLockedGlobalBlocks/, 'Header/Footer 缺少服务端锁定保护');

if (/['"]page['"]/.test(genericAdmin.match(/const models[\s\S]*?as const/)?.[0] || '')) {
  failures.push('通用 CRUD 仍可绕过页面专用校验');
}
required(editor, /LayoutHistory/, '编辑器缺少撤销/恢复');
required(editor, /previewDevice/, '编辑器缺少桌面/平板/手机预览');
required(editor, /restoreVersion/, '编辑器缺少版本回退');
required(history, /undo\(\)[\s\S]*?redo\(\)/, '撤销/恢复实现不完整');

if (/XBOARD_(?:API|DB|DATABASE|SSO|SESSION|TOKEN|SECRET)|xboardUserId/i.test(service + controller + layout)) {
  failures.push('页面引擎违反 Xboard 完全隔离边界');
}

if (failures.length) {
  console.error('APPGOG 页面引擎检查失败：\n' + failures.map(item => `- ${item}`).join('\n'));
  process.exit(1);
}
console.log('APPGOG 页面引擎检查通过：路由、草稿、发布、版本、树校验、预览和回退边界完整。');
