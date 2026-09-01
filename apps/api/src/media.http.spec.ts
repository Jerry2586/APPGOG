import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import helmet from 'helmet';
import sharp = require('sharp');
import { ADMIN_ROLES, type AdminRoleName } from './auth.types';
import { MediaController, PublicMediaController } from './media.controller';
import { MediaService } from './media.service';
import { MediaStorageService } from './media-storage.service';
import { MAX_MEDIA_BYTES } from './media-file';
import { PrismaService } from './prisma.service';
import { JWT_AUDIENCE, JWT_ISSUER } from './security.config';

// Real HTTP, JWT/RBAC, multipart, decoding and disk I/O. Only Prisma is an
// isolated in-memory fixture: these tests do NOT certify PostgreSQL migrations.
function databaseFixture() {
  let assets: any[] = [], audits: any[] = [];
  const sessions = new Map(ADMIN_ROLES.map(role => [role, {
    id: role, adminUserId: role, expiresAt: new Date(Date.now() + 3600000), revokedAt: null,
    adminUser: { id: role, role, enabled: true, displayName: role, email: `${role}@example.invalid` }
  }]));
  function matches(row: any, where: any) {
    if (where.archivedAt === null && row.archivedAt !== null) return false;
    if (where.archivedAt?.not === null && row.archivedAt === null) return false;
    if (where.folder && where.folder !== row.folder) return false;
    return !where.OR || where.OR.some((condition: any) => Object.entries(condition).some(([key, value]: any) =>
      String(row[key] || '').toLowerCase().includes(value.contains.toLowerCase())));
  }
  const db: any = {
    failAudit: false,
    adminSession: {
      findUnique: async ({ where }: any) => sessions.get(where.id),
      update: async ({ where, data }: any) => Object.assign(sessions.get(where.id)!, data)
    },
    mediaAsset: {
      create: async ({ data }: any) => {
        const asset = { id: randomUUID(), ...data, archivedAt: null, createdAt: new Date(), updatedAt: new Date() };
        assets.push(asset); return { ...asset };
      },
      findUnique: async ({ where }: any) => assets.find(row => where.id ? row.id === where.id : row.storageKey === where.storageKey) || null,
      findMany: async ({ where, skip, take }: any) => assets.filter(row => matches(row, where))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
        .slice(skip, skip + take).map(row => ({ ...row, createdBy: { displayName: row.createdById } })),
      count: async ({ where }: any) => assets.filter(row => matches(row, where)).length,
      update: async ({ where, data }: any) => {
        const asset = assets.find(row => row.id === where.id);
        Object.assign(asset, data, { updatedAt: new Date() }); return { ...asset };
      }
    },
    auditLog: { create: async ({ data }: any) => {
      if (db.failAudit) throw new Error('injected audit failure');
      audits.push(data); return data;
    } },
    $transaction: async (action: any) => {
      if (Array.isArray(action)) return Promise.all(action);
      const snapshot = structuredClone({ assets, audits });
      try { return await action(db); }
      catch (error) { assets = snapshot.assets; audits = snapshot.audits; throw error; }
    },
    assets: () => assets,
    audits: () => audits,
    reset: () => { assets = []; audits = []; db.failAudit = false; }
  };
  return db;
}

describe('stage 7 media HTTP contract (isolated database fixture)', () => {
  let app: INestApplication, root: string, base: string, png: Buffer;
  const db = databaseFixture(), tokens: Partial<Record<AdminRoleName, string>> = {};

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'appgog-media-http-'));
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: randomUUID(), signOptions: { issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: '15m' } })],
      controllers: [MediaController, PublicMediaController],
      providers: [MediaService, MediaStorageService,
        { provide: PrismaService, useValue: db },
        { provide: ConfigService, useValue: { get: () => root } }]
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1'); app.use(helmet());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1'); base = `${await app.getUrl()}/api/v1`;
    for (const role of ADMIN_ROLES) tokens[role] = await module.get(JwtService).signAsync({ sub: role, sid: role, role, type: 'access' });
    png = await sharp({ create: { width: 16, height: 12, channels: 3, background: '#33aabb' } }).png().toBuffer();
  }, 30000);
  beforeEach(() => db.reset());
  afterAll(async () => {
    await app?.close();
    if (root) await rm(root, { recursive: true, force: true });
  });

  function request(path: string, role?: AdminRoleName, init: RequestInit = {}) {
    return fetch(`${base}${path}`, { ...init, headers: { ...(role ? { Authorization: `Bearer ${tokens[role]}` } : {}), ...init.headers } });
  }
  function form(bytes = png, type = 'image/png') {
    const body = new FormData(); body.append('file', new Blob([new Uint8Array(bytes)], { type }), 'example.png');
    body.append('altText', '首页海报'); body.append('folder', 'hero'); return body;
  }
  async function upload(bytes = png, type = 'image/png') {
    const response = await request('/admin/media', 'EDITOR', { method: 'POST', body: form(bytes, type) });
    const data = await response.json(); expect(response.status).toBe(201); return data;
  }
  const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('enforces real bearer authentication and method-level roles', async () => {
    expect((await request('/admin/media')).status).toBe(401);
    expect((await request('/admin/media', undefined, { headers: { Authorization: 'Bearer fake' } })).status).toBe(401);
    expect((await request('/admin/media', 'VIEWER')).status).toBe(200);
    expect((await request('/admin/media', 'VIEWER', { method: 'POST', body: form() })).status).toBe(403);
    expect((await request('/admin/media/missing', 'EDITOR', { method: 'DELETE' })).status).toBe(403);
    expect((await request('/admin/media/missing/restore', 'EDITOR', json('POST', {}))).status).toBe(403);
    expect((await request('/admin/media/missing', 'VIEWER', json('PATCH', { altText: 'x' }))).status).toBe(403);
    expect(db.assets()).toHaveLength(0); expect(db.audits()).toHaveLength(0);
  });

  it.each(['png', 'jpeg', 'gif', 'webp'] as const)('uploads and serves actual %s bytes with safe cache headers', async format => {
    const bytes = await sharp(png).toFormat(format).toBuffer();
    const asset = await upload(bytes, `image/${format}`);
    expect(asset).toMatchObject({ mimeType: `image/${format}`, altText: '首页海报', folder: 'hero', width: 16, height: 12, byteSize: bytes.length });
    expect(asset.storageKey).toBeUndefined();
    const response = await request(`/public/media/${asset.id}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(`image/${format}`);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(response.headers.get('cache-control')).toContain('immutable');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    const cached = await request(`/public/media/${asset.id}`, undefined, { headers: { 'If-None-Match': `"other", W/${response.headers.get('etag')}` } });
    expect(cached.status).toBe(304); expect(await cached.text()).toBe('');
    expect(db.audits().map((row: any) => row.action)).toEqual(['MEDIA_UPLOADED']);
  });

  it('rejects malformed multipart, extra files, oversize and fake image data before persistence', async () => {
    const extra = form(); extra.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'other.png');
    const unknown = form(); unknown.append('storageKey', '../private');
    const fake = Buffer.alloc(45); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(fake);
    fake.writeUInt32BE(13, 8); fake.write('IHDR', 12); fake.writeUInt32BE(16, 16); fake.writeUInt32BE(12, 20); fake.write('IEND', 37);
    for (const body of [extra, unknown, new FormData(), form(fake), form(Buffer.from('<svg/>'), 'image/svg+xml'), form(png, 'image/jpeg')]) {
      expect((await request('/admin/media', 'EDITOR', { method: 'POST', body })).status).toBe(400);
    }
    expect((await request('/admin/media', 'EDITOR', { method: 'POST', body: form(Buffer.alloc(MAX_MEDIA_BYTES + 1)) })).status).toBe(413);
    expect(db.assets()).toHaveLength(0); expect(db.audits()).toHaveLength(0);
  });

  it('accepts the documented inclusive 10 MiB boundary, not one byte less', async () => {
    const crcTable = Array.from({ length: 256 }, (_, i) => {
      let crc = i; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); return crc >>> 0;
    });
    // Valid private ancillary PNG chunks pad a real image without changing pixels.
    const chunks: Buffer[] = [png.subarray(0, png.length - 12)];
    let remaining = MAX_MEDIA_BYTES - png.length;
    while (remaining > 0) {
      const size = Math.min(262144, remaining - 12), chunk = Buffer.alloc(size + 12);
      chunk.writeUInt32BE(size); chunk.write('npAD', 4);
      let crc = 0xffffffff;
      for (const byte of chunk.subarray(4, chunk.length - 4)) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
      chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
      chunks.push(chunk); remaining -= chunk.length;
    }
    chunks.push(png.subarray(png.length - 12));
    const bytes = Buffer.concat(chunks); expect(bytes.length).toBe(MAX_MEDIA_BYTES);
    expect((await upload(bytes)).byteSize).toBe(MAX_MEDIA_BYTES);
  });

  it('paginates and filters without leaking storage keys and validates query/patch bodies', async () => {
    const first = await upload(); await upload(); await upload();
    const response = await request('/admin/media?page=2&limit=2&folder=hero&search=海报', 'VIEWER');
    expect(response.status).toBe(200);
    const list = await response.json(); expect(list).toMatchObject({ total: 3, page: 2, limit: 2 });
    expect(list.items).toHaveLength(1); expect(list.items[0].storageKey).toBeUndefined();
    for (const query of ['page=0', 'limit=101', 'folder=../private', 'state=deleted', 'undeclared=x']) {
      expect((await request(`/admin/media?${query}`, 'VIEWER')).status).toBe(400);
    }
    for (const body of [{}, { altText: null }, { folder: null }, { storageKey: 'x' }, { altText: 'x'.repeat(301) }]) {
      expect((await request(`/admin/media/${first.id}`, 'EDITOR', json('PATCH', body))).status).toBe(400);
    }
    const updated = await request(`/admin/media/${first.id}`, 'EDITOR', json('PATCH', { altText: '', folder: 'general' }));
    expect(updated.status).toBe(200); expect(await updated.json()).toMatchObject({ altText: null, folder: 'general' });
    expect((await request('/admin/media/missing', 'EDITOR', json('PATCH', { altText: 'x' }))).status).toBe(404);
  });

  it('archives/restores idempotently with audit events and preserves published URLs', async () => {
    const asset = await upload();
    for (let i = 0; i < 2; i++) expect((await request(`/admin/media/${asset.id}`, 'ADMIN', { method: 'DELETE' })).status).toBe(200);
    expect((await (await request('/admin/media', 'VIEWER')).json()).total).toBe(0);
    expect((await (await request('/admin/media?state=archived', 'VIEWER')).json()).total).toBe(1);
    expect((await request(`/public/media/${asset.id}`)).status).toBe(200);
    expect((await request(`/admin/media/${asset.id}/restore`, 'ADMIN', json('POST', { restore: false }))).status).toBe(400);
    for (let i = 0; i < 2; i++) expect((await request(`/admin/media/${asset.id}/restore`, 'ADMIN', json('POST', {}))).status).toBe(201);
    expect((await (await request('/admin/media', 'VIEWER')).json()).total).toBe(1);
    expect(db.audits().map((row: any) => row.action)).toEqual(['MEDIA_UPLOADED', 'MEDIA_ARCHIVED', 'MEDIA_RESTORED']);
  });

  it('rolls back metadata and removes confirmed-unreferenced bytes when audit fails', async () => {
    const before = await readdir(root, { recursive: true }); db.failAudit = true;
    expect((await request('/admin/media', 'EDITOR', { method: 'POST', body: form() })).status).toBe(500);
    expect(db.assets()).toHaveLength(0); expect(db.audits()).toHaveLength(0);
    const after = await readdir(root, { recursive: true });
    expect(after.filter(name => /\.(png|jpg|gif|webp)$/.test(name))).toEqual(before.filter(name => /\.(png|jpg|gif|webp)$/.test(name)));
  });

  it('does not commit updates, archives or restores without their audit event', async () => {
    const asset = await upload(); db.failAudit = true;
    expect((await request(`/admin/media/${asset.id}`, 'EDITOR', json('PATCH', { altText: 'not committed' }))).status).toBe(500);
    expect(db.assets()[0].altText).toBe('首页海报');
    expect((await request(`/admin/media/${asset.id}`, 'ADMIN', { method: 'DELETE' })).status).toBe(500);
    expect(db.assets()[0].archivedAt).toBeNull();
    db.failAudit = false;
    expect((await request(`/admin/media/${asset.id}`, 'ADMIN', { method: 'DELETE' })).status).toBe(200);
    db.failAudit = true;
    expect((await request(`/admin/media/${asset.id}/restore`, 'ADMIN', json('POST', {}))).status).toBe(500);
    expect(db.assets()[0].archivedAt).not.toBeNull();
    expect(db.audits().map((row: any) => row.action)).toEqual(['MEDIA_UPLOADED', 'MEDIA_ARCHIVED']);
  });

  it('rejects changed disk bytes even for a matching conditional ETag', async () => {
    const asset = await upload(), stored = db.assets()[0];
    const damaged = Buffer.from(png); damaged[damaged.length - 1] ^= 1;
    await writeFile(join(root, stored.storageKey), damaged);
    const response = await request(`/public/media/${asset.id}`, undefined, { headers: { 'If-None-Match': `"${asset.sha256}"` } });
    expect(response.status).toBe(503); expect(response.headers.get('cache-control') || '').not.toContain('immutable');
    expect((await request('/public/media/missing')).status).toBe(404);
  });
});
