import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PageController } from './page.controller';
import { PublicController } from './public.controller';
import { PageService } from './page.service';
import { PrismaService } from './prisma.service';
import { pageDatabaseFixture } from './page-test-fixture';
import { ADMIN_ROLES, type AdminRoleName } from './auth.types';
import { JWT_AUDIENCE, JWT_ISSUER } from './security.config';

describe('stage12 real HTTP / JWT / page service with isolated persistence fixture', () => {
  const db = pageDatabaseFixture(), tokens: Partial<Record<AdminRoleName, string>> = {};
  let app: NestExpressApplication, base: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: randomUUID(), signOptions: { issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: '15m' } })],
      controllers: [PageController, PublicController], providers: [PageService, { provide: PrismaService, useValue: db }]
    }).compile();
    app = module.createNestApplication<NestExpressApplication>({ logger: false }); app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1'); base = `${await app.getUrl()}/api/v1`;
    for (const role of ADMIN_ROLES) tokens[role] = await module.get(JwtService).signAsync({ sub: role, sid: role, role, type: 'access' });
  });
  afterAll(async () => { await app?.close(); }); beforeEach(() => db.reset());
  const req = (path: string, role?: AdminRoleName, method = 'GET', body?: any) => fetch(base + path, { method,
    headers: { ...(role ? { authorization: `Bearer ${tokens[role]}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const install = () => req('/admin/pages/site-starter', 'ADMIN', 'POST', { version: 1 });
  const clear = (blocks: any[]) => { for (const b of blocks) { delete b.props.publicationRequirement; clear(b.children); } return blocks; };
  const draft = (page: any, layout = page.draftLayout) => ({ name: page.name, slug: page.slug, routeType: page.routeType, schemaVersion: 1, layout, seoTitle: page.seoTitle, seoDescription: page.seoDescription, baseVersionId: page.draftVersionId });
  it('manifest requires authentication and is not shadowed by generic page lookup', async () => {
    expect((await req('/admin/pages/site-starter')).status).toBe(401);
    const response = await req('/admin/pages/site-starter', 'VIEWER'); expect(response.status).toBe(200);
    const manifest = await response.json(); expect(manifest.pages).toHaveLength(21); expect(manifest.pages.every((p: any) => p.existingPageId === null)).toBe(true);
  });
  it.each(['VIEWER', 'EDITOR'] as const)('%s cannot initialize the whole website', async role => {
    expect((await req('/admin/pages/site-starter', role, 'POST', { version: 1 })).status).toBe(403); expect(db.rows('page')).toHaveLength(0);
  });
  it.each([{}, { version: 2 }, { version: 1, publish: true }])('validates the install contract %j', async body => {
    expect((await req('/admin/pages/site-starter', 'ADMIN', 'POST', body)).status).toBe(400);
  });
  it('initializes all draft versions atomically, audits every creation, and is idempotent', async () => {
    const first = await install(); expect(first.status).toBe(201); expect((await first.json()).created).toHaveLength(21);
    expect(db.rows('page').every((p: any) => p.status === 'DRAFT' && !p.publishedVersionId)).toBe(true);
    expect(db.rows('pageVersion')).toHaveLength(21); expect(db.rows('publishedPageRoute')).toHaveLength(0);
    expect(db.rows('auditLog')).toHaveLength(21); expect(db.rows('auditLog')[0].adminUserId).toBe('ADMIN');
    const second = await (await install()).json(); expect(second.created).toHaveLength(0); expect(second.skipped).toHaveLength(21);
    expect(db.rows('pageVersion')).toHaveLength(21);
  });
  it('never falls back to built-in recipes on an uncreated or draft public route', async () => {
    expect((await req('/public/pages/home')).status).toBe(404); await install();
    for (const slug of ['home', 'nodes/detail', 'shop', 'login']) expect((await req('/public/pages/' + slug)).status).toBe(404);
  });
  it('preserves occupied draft and published routes including renamed drafts', async () => {
    await db.page.create({ data: { id: 'existing', slug: 'home', name: '用户已有首页', status: 'DRAFT' } });
    await db.page.create({ data: { id: 'renamed', slug: 'private-new-slug', name: '重命名草稿', status: 'PUBLISHED' } });
    await db.publishedPageRoute.create({ data: { slug: 'help', pageId: 'renamed', pageVersionId: 'kept-version' } });
    const result = await (await install()).json(); expect(result.created).toHaveLength(19); expect(result.skipped).toEqual(['home', 'help']);
    expect(db.rows('page').find((p: any) => p.id === 'existing').name).toBe('用户已有首页');
    expect(db.rows('publishedPageRoute')[0].pageVersionId).toBe('kept-version');
  });
  it('rolls back the full batch if audit storage fails', async () => {
    db.failAudit = true; expect((await install()).status).toBe(500);
    expect(db.rows('page')).toHaveLength(0); expect(db.rows('pageVersion')).toHaveLength(0);
  });
  it('rejects publication with nested pending checks, regardless of UI', async () => {
    await install(); const row = db.rows('page').find((p: any) => p.slug === 'downloads');
    const response = await req(`/admin/pages/${row.id}/publish`, 'EDITOR', 'POST', { draftVersionId: row.draftVersionId });
    expect(response.status).toBe(400); const failure = await response.json(); expect(failure).toHaveProperty('requirements'); expect(failure.requirements.length).toBeGreaterThanOrEqual(6);
    expect(db.rows('publishedPageRoute')).toHaveLength(0);
  });
  it('publishes reviewed JSON through nested routes; later drafts and offline state remain isolated', async () => {
    await install(); const id = db.rows('page').find((p: any) => p.slug === 'nodes/detail').id;
    let page = await (await req(`/admin/pages/${id}`, 'EDITOR')).json();
    let response = await req(`/admin/pages/${id}/draft`, 'EDITOR', 'PATCH', draft(page, clear(page.draftLayout))); const saved = await response.json(); expect({ status: response.status, error: response.ok ? null : saved }).toEqual({ status: 200, error: null }); page = saved;
    response = await req(`/admin/pages/${id}/publish`, 'EDITOR', 'POST', { draftVersionId: page.draftVersionId }); expect(response.status).toBe(201);
    const live = await (await req('/public/pages/nodes/detail')).json(); expect(live.slug).toBe('nodes/detail'); expect(live.seoTitle).toBe(page.seoTitle);
    const modified = draft(page); modified.name = '未发布修改'; modified.layout[2].props.title = '仅草稿标题';
    expect((await req(`/admin/pages/${id}/draft`, 'EDITOR', 'PATCH', modified)).status).toBe(200);
    expect((await (await req('/public/pages/nodes/detail')).json()).layout[2].props.title).toBe(live.layout[2].props.title);
    expect((await req(`/admin/pages/${id}/status`, 'EDITOR', 'POST', { status: 'OFFLINE' })).status).toBe(201);
    expect((await req('/public/pages/nodes/detail')).status).toBe(404);
  });
  it('rejects identity-bearing external destinations in generated page buttons', async () => {
    await install(); const row = db.rows('page').find((p: any) => p.slug === 'login');
    const page = await (await req(`/admin/pages/${row.id}`, 'EDITOR')).json();
    page.draftLayout[3].props.buttons[0].url = 'https://panel.example.invalid/login?token=secret';
    expect((await req(`/admin/pages/${row.id}/draft`, 'EDITOR', 'PATCH', draft(page))).status).toBe(400);
  });
});
