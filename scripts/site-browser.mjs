// Stage12 loopback-only acceptance fixture. No real database, Xboard or vendors.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
const apiRequire = createRequire(new URL('../apps/api/package.json', import.meta.url)), webRequire = createRequire(new URL('../apps/web/package.json', import.meta.url));
apiRequire('reflect-metadata');
const load = name => apiRequire(`./dist/src/${name}.js`);
const { Test } = apiRequire('@nestjs/testing'), { ValidationPipe } = apiRequire('@nestjs/common'), { JwtModule, JwtService } = apiRequire('@nestjs/jwt');
const { PageController } = load('page.controller'), { PageService } = load('page.service'), { PublicController } = load('public.controller');
const { CmsController, CategoryController, PublicCmsController } = load('cms.controller'), { CmsService } = load('cms.service'), { KnowledgeService } = load('knowledge.service');
const { PublicCatalogController } = load('catalog.controller'), { CatalogService } = load('catalog.service');
const { ComponentController } = load('component.controller'), { PrismaService } = load('prisma.service'), { pageDatabaseFixture } = load('page-test-fixture');
const { JWT_ISSUER, JWT_AUDIENCE } = load('security.config'), { siteStarterPages } = load('site-starter'), { CmsWriteDto, CategoryWriteDto } = load('cms.dto');
const db = pageDatabaseFixture();
const module = await Test.createTestingModule({ imports: [JwtModule.register({ secret: randomUUID(), signOptions: { issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: '1h' } })],
  controllers: [PageController, PublicController, ComponentController, CmsController, CategoryController, PublicCmsController, PublicCatalogController],
  providers: [PageService, CmsService, KnowledgeService, CatalogService, { provide: PrismaService, useValue: db }] }).compile();
const app = module.createNestApplication({ logger: false }); app.setGlobalPrefix('api/v1'); app.useBodyParser('json', { limit: '512kb' });
app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
app.use(async (req, res, next) => { try {
  if (req.path === '/api/v1/auth/admin/login') {
    const input = req.body.email?.split('@')[0], role = ['SUPER_ADMIN', 'ADMIN', 'EDITOR', 'VIEWER'].includes(input) ? input : 'VIEWER';
    return res.json({ accessToken: await module.get(JwtService).signAsync({ sub: role, sid: role, role, type: 'access' }), expiresIn: 3600, user: { id: role, role, name: '隔离测试账号', email: `${role}@example.invalid` } });
  }
  if (req.path === '/api/v1/ai/config') return res.json({ enabled: false, globalAssistantEnabled: false });
  if (req.path === '/api/v1/ai/ask') return res.json({ answer: '本机验收未启用模型。请使用下方文档搜索。', citations: [], degraded: true });
  next();
} catch (error) { next(error); } });
const pages = module.get(PageService), actor = { id: 'ADMIN', sessionId: 'ADMIN', role: 'ADMIN', email: 'ADMIN@example.invalid', displayName: '隔离测试' };
await pages.installSiteStarter(actor, {});
const clear = blocks => blocks.map(b => ({ ...b, props: Object.fromEntries(Object.entries(b.props).filter(([key]) => key !== 'publicationRequirement')), children: clear(b.children) }));
for (const recipe of siteStarterPages()) {
  const row = db.rows('page').find(p => p.slug === recipe.slug);
  const data = { ...recipe, routeType: 'PAGE', schemaVersion: 1, layout: clear(recipe.layout), baseVersionId: row.draftVersionId };
  // Fixture-only review bypass: public snapshots explicitly labelled as test data in the UI.
  const reviewed = await pages.saveDraft(row.id, data, actor, {});
  await pages.publish(row.id, reviewed.draftVersionId, actor, {});
  await pages.saveDraft(row.id, { ...data, layout: recipe.layout, baseVersionId: reviewed.draftVersionId }, actor, {});
}
const cms = module.get(CmsService);
const category = await cms.saveCategory(undefined, Object.assign(new CategoryWriteDto(), { name: '本机验收分类', slug: 'fixture-category', scope: 'CONTENT' }), actor);
for (const [type, slug, title] of [['ARTICLE', 'fixture-install', '本机测试：设备安装指南'], ['FAQ', 'fixture-faq', '本机测试：如何找到帮助']]) {
  const row = await cms.save(undefined, Object.assign(new CmsWriteDto(), { type, slug, title, categoryId: category.id, summary: '仅用于第十二阶段组件绑定验收，不是正式运营内容。', body: '# 测试内容\n\n查看帮助中心与下载入口。', format: 'MARKDOWN', ragEnabled: false, ...(type === 'FAQ' ? { faqQuestion: '如何查找文档？', faqAnswer: '在帮助中心搜索关键词。' } : {}) }), actor);
  await cms.publish(row.id, row.revision, actor);
}
await app.listen(0, '127.0.0.1');
const { createServer } = await import(pathToFileURL(webRequire.resolve('vite')).href);
const server = await createServer({ root: fileURLToPath(new URL('../apps/web', import.meta.url)), server: { host: '127.0.0.1', port: 5179, strictPort: true, proxy: { '/api': await app.getUrl() } },
  plugins: [{ name: 'stage12-isolated-fixture', transformIndexHtml(html) { return html.replace('/src/main.ts', '/tests/site-browser.ts'); } }] });
await server.listen(); console.log('Stage12 isolated fixture: http://127.0.0.1:5179/ and /admin');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); await app.close(); process.exit(0); });
