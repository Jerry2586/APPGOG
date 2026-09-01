import { ConflictException } from '@nestjs/common';
import { PageService } from './page.service';

const actor = {
  id: 'admin-1', sessionId: 'session-1', email: 'admin@appgog.local',
  displayName: '编辑', role: 'EDITOR' as const
};

const version = {
  id: 'version-1', pageId: 'page-1', version: 1, schemaVersion: 1, layout: [],
  name: '已发布名称', slug: 'published/path', routeType: 'PAGE', redirectUrl: null,
  seoTitle: '已发布 SEO', seoDescription: null, seoKeywords: null, ogImage: null,
  changeNote: null, createdById: actor.id, restoredFromId: null, createdAt: new Date()
};

const pageView = {
  id: 'page-1', name: '草稿名称', slug: 'draft/path', routeType: 'PAGE', redirectUrl: null,
  status: 'PUBLISHED', draftVersionId: version.id, publishedVersionId: version.id,
  nextVersion: 2, seoTitle: null, seoDescription: null, seoKeywords: null, ogImage: null,
  publishedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
  draftVersion: version, publishedVersion: version,
  publishedRoute: { slug: version.slug, pageId: 'page-1', pageVersionId: version.id, createdAt: new Date(), updatedAt: new Date() }
};

describe('PageService', () => {
  it('serves only the immutable published route/version snapshot', async () => {
    const db: any = {
      publishedPageRoute: {
        findUnique: jest.fn().mockResolvedValue({
          slug: version.slug,
          page: { ...pageView, name: '未发布草稿名', status: 'PUBLISHED' },
          pageVersion: version
        })
      }
    };
    const service = new PageService(db);

    const result = await service.publicPage('Published/Path');

    expect(result.name).toBe('已发布名称');
    expect(result.slug).toBe('published/path');
    expect(db.publishedPageRoute.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { slug: 'published/path' } }));
  });

  it('rejects stale draft saves before reserving a version number', async () => {
    const tx: any = {
      page: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'page-1', status: 'DRAFT', draftVersionId: 'newer-version', draftVersion: version
        }),
        update: jest.fn()
      }
    };
    const db: any = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    const service = new PageService(db);

    await expect(service.saveDraft('page-1', {
      name: '草稿', slug: 'draft', routeType: 'PAGE', layout: [], schemaVersion: 1,
      baseVersionId: 'stale-version'
    } as any, actor, {})).rejects.toBeInstanceOf(ConflictException);
    expect(tx.page.update).not.toHaveBeenCalled();
  });

  it('publishes the exact current draft through the unique live-route index', async () => {
    const tx: any = {
      page: {
        findUnique: jest.fn().mockResolvedValue({ ...pageView, publishedVersionId: null, status: 'DRAFT' }),
        update: jest.fn().mockResolvedValue({})
      },
      publishedPageRoute: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }), create: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) }
    };
    const db: any = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
      page: { findUnique: jest.fn().mockResolvedValue(pageView) }
    };
    const service = new PageService(db);

    await service.publish('page-1', version.id, actor, {});

    expect(tx.publishedPageRoute.create).toHaveBeenCalledWith({
      data: { slug: version.slug, pageId: 'page-1', pageVersionId: version.id }
    });
    expect(tx.page.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ publishedVersionId: version.id, status: 'PUBLISHED' })
    }));
  });
});
