import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { KnowledgeService } from './knowledge.service';
import { cmsSlug, cmsSnapshot, descendantIds, normalizeCms, validateCategoryParent } from './cms-content';
import type { CategoryWriteDto, CmsQueryDto, CmsWriteDto } from './cms.dto';
import type { AdminPrincipal } from './auth.types';

@Injectable()
export class CmsService {
  constructor(private db: PrismaService, private knowledge: KnowledgeService) {}
  private async transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
    try { return await this.db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) {
      const code = (error as any)?.code;
      if (code === 'P2002') throw new ConflictException('标识或已发布路由已被占用');
      if (code === 'P2034') throw new ConflictException('发生并发变更，请刷新后重试');
      if (code === 'P2003') throw new ConflictException('记录仍被引用，不能删除或移动');
      throw error;
    }
  }
  private revision(row: { revision: number }, value?: number) {
    if (value === undefined) throw new BadRequestException('必须提供 baseRevision');
    if (row.revision !== value) throw new ConflictException('版本已变化，请刷新后重试');
  }
  private audit(tx: Prisma.TransactionClient, actor: AdminPrincipal, action: string, resource: string, id: string, detail: any = {}) {
    return tx.auditLog.create({ data: { adminUserId: actor.id, action, resource, resourceId: id, detail } });
  }
  async get(id: string) {
    const doc = await this.db.content.findUnique({ where: { id }, include: { indexJobs: { orderBy: { createdAt: 'desc' }, take: 5 } } });
    if (!doc) throw new NotFoundException('内容不存在');
    return {...doc,indexJobs:doc.indexJobs.map(({leaseToken,activeKey,...job})=>job)};
  }
  async list(query: CmsQueryDto, published = false) {
    const where: Prisma.ContentWhereInput = published ? { status: 'PUBLISHED', publishedSlug: { not: null } } : { status: query.status };
    const and: Prisma.ContentWhereInput[] = [];
    if (query.type) and.push(published ? { publishedSnapshot: { path: ['type'], equals: query.type } } : { type: query.type });
    if (query.categoryId) {
      const nodes = await this.db.category.findMany({ where: { scope: 'CONTENT' } });
      const ids = nodes.some(row => row.id === query.categoryId) ? descendantIds(nodes, query.categoryId) : [];
      and.push(published ? { OR: ids.map(id => ({ publishedSnapshot: { path: ['categoryId'], equals: id } })) } : { categoryId: { in: ids } });
    }
    if (query.search?.trim()) {
      const contains = { contains: query.search.trim(), mode: 'insensitive' as const };
      const categories = await this.db.category.findMany({ where: { scope: 'CONTENT', name: contains }, select: { id: true } });
      and.push({ OR: published ? [{ publishedSearchText: contains }, ...categories.map(row => ({ publishedSnapshot: { path: ['categoryId'], equals: row.id } }))]
        : [{ title: contains }, { summary: contains }, { body: contains }, { faqQuestion: contains }, { faqAnswer: contains }, { categoryId: { in: categories.map(row => row.id) } }] });
    }
    where.AND = and;
    const orderBy: Prisma.ContentOrderByWithRelationInput[] = query.sort === 'viewsDesc' ? [{ viewCount: 'desc' }, { id: 'asc' }]
      : [{ [published ? 'publishedAt' : 'updatedAt']: query.sort === 'oldest' ? 'asc' : 'desc' }, { id: 'asc' }];
    const [items, total] = await this.db.$transaction([
      this.db.content.findMany({ where, orderBy, skip: (query.page - 1) * query.limit, take: query.limit }), this.db.content.count({ where })
    ]);
    return { items: published ? items.map(row => this.publicView(row)) : items, total, page: query.page, limit: query.limit };
  }
  private publicView(doc: any) {
    const source = doc.publishedSnapshot; if (!source) throw new NotFoundException('内容尚未发布');
    const result = cmsSnapshot(source);
    return { ...result.snapshot, body: result.snapshot.format === 'RICH_TEXT' ? result.html : result.snapshot.body,
      faqAnswer: result.snapshot.format === 'RICH_TEXT' ? result.faqHtml : result.snapshot.faqAnswer,
      html: result.html, faqHtml: result.faqHtml, id: doc.id, slug: doc.publishedSlug, publishedAt: doc.publishedAt, viewCount: doc.viewCount };
  }
  async publicContent(slug: string) {
    const doc = await this.db.content.findFirst({ where: { publishedSlug: slug, status: 'PUBLISHED' } });
    if (!doc) throw new NotFoundException('内容不存在或未发布');
    const item = this.publicView(doc), nodes = await this.db.category.findMany({ where: { scope: 'CONTENT' } });
    const map = new Map(nodes.map(row => [row.id, row])), breadcrumb = [], seen = new Set<string>(); let id = item.categoryId;
    while (id && !seen.has(id)) { seen.add(id); const category = map.get(id); if (!category) break; breadcrumb.unshift({ id: category.id, name: category.name, slug: category.slug }); id = category.parentId; }
    await this.db.content.updateMany({ where: { id: doc.id, status: 'PUBLISHED', publishedSlug: slug }, data: { viewCount: { increment: 1 } } });
    return { ...item, breadcrumb, category: breadcrumb[breadcrumb.length - 1] || null };
  }
  private async checkCategory(tx: Prisma.TransactionClient, id: string | null) {
    if (id && !(await tx.category.findFirst({ where: { id, scope: 'CONTENT' } }))) throw new BadRequestException('内容分类不存在或不是内容分类');
  }
  async save(id: string | undefined, input: CmsWriteDto, actor: AdminPrincipal) {
    const data = normalizeCms(input);
    const doc = await this.transaction(async tx => {
      await this.checkCategory(tx, data.categoryId);
      const before = id ? await tx.content.findUnique({ where: { id } }) : null;
      if (id && !before) throw new NotFoundException('内容不存在');
      if (before) { this.revision(before, input.baseRevision); if (before.type !== data.type) throw new BadRequestException('已有内容不能变更类型，请新建对应类型'); }
      const row = before ? await tx.content.update({ where: { id }, data: { ...data, revision: { increment: 1 } } }) : await tx.content.create({ data });
      if (!row.ragEnabled) {
        await this.knowledge.cancel(tx, row.id);
        await tx.knowledgeChunk.deleteMany({ where: { contentId: row.id } });
        await tx.content.update({ where: { id: row.id }, data: { ragIndexedAt: null } });
      } else if (row.status === 'PUBLISHED') await this.knowledge.enqueue(tx, row.id);
      await this.audit(tx, actor, before ? 'CMS_DRAFT_SAVED' : 'CMS_CREATED', 'CONTENT', row.id, { revision: row.revision, ragEnabled: row.ragEnabled });
      return row;
    });
    return this.get(doc.id);
  }
  async publish(id: string, baseRevision: number, actor: AdminPrincipal) {
    const doc = await this.transaction(async tx => {
      const before = await tx.content.findUnique({ where: { id } }); if (!before) throw new NotFoundException('内容不存在');
      this.revision(before, baseRevision); await this.checkCategory(tx, before.categoryId);
      if (before.status === 'ARCHIVED') throw new BadRequestException('归档内容需管理员先恢复为草稿');
      const { snapshot, searchText, hash } = cmsSnapshot(before, true);
      const row = await tx.content.update({ where: { id }, data: { status: 'PUBLISHED', publishedSlug: before.slug,
        publishedSnapshot: snapshot, publishedSearchText: searchText, publishedHash: hash,
        publishedAt: new Date(), revision: { increment: 1 }, ragIndexedAt: null } });
      await tx.knowledgeChunk.deleteMany({ where: { contentId: id } });
      await this.knowledge.cancel(tx, id);
      if (row.ragEnabled) await this.knowledge.enqueue(tx, id);
      await this.audit(tx, actor, 'CMS_PUBLISHED', 'CONTENT', id, { revision: row.revision, hash }); return row;
    });
    return this.get(id);
  }
  async setStatus(id: string, status: 'DRAFT' | 'OFFLINE' | 'ARCHIVED', baseRevision: number, actor: AdminPrincipal) {
    await this.transaction(async tx => {
      const doc = await tx.content.findUnique({ where: { id } }); if (!doc) throw new NotFoundException('内容不存在'); this.revision(doc, baseRevision);
      if ((status === 'ARCHIVED' || doc.status === 'ARCHIVED') && !['ADMIN', 'SUPER_ADMIN'].includes(actor.role)) throw new ForbiddenException('仅管理员可归档或恢复内容');
      await tx.content.update({ where: { id }, data: { status, revision: { increment: 1 }, publishedSlug: null, ragIndexedAt: null } });
      await tx.knowledgeChunk.deleteMany({ where: { contentId: id } });
      await this.knowledge.cancel(tx, id);
      await this.audit(tx, actor, 'CMS_STATUS_CHANGED', 'CONTENT', id, { from: doc.status, to: status });
    }); return this.get(id);
  }
  async reindex(id: string, baseRevision: number, actor: AdminPrincipal) {
    await this.transaction(async tx => {
      const doc = await tx.content.findUnique({ where: { id } }); if (!doc) throw new NotFoundException('内容不存在'); this.revision(doc, baseRevision);
      if (!doc.ragEnabled || doc.status !== 'PUBLISHED') throw new BadRequestException('仅已发布且开启投喂的内容可重新索引');
      await this.knowledge.enqueue(tx, id, true, false);
      await this.audit(tx, actor, 'CMS_REINDEX_REQUESTED', 'CONTENT', id);
    });
    return this.get(id);
  }
  categories(scope?: 'CONTENT' | 'PRODUCT') { return this.db.category.findMany({ where: { scope }, orderBy: [{ sort: 'asc' }, { id: 'asc' }] }); }
  async category(id: string) { const row = await this.db.category.findUnique({ where: { id } }); if (!row) throw new NotFoundException('分类不存在'); return row; }
  async saveCategory(id: string | undefined, input: CategoryWriteDto, actor: AdminPrincipal) {
    const name = input.name.trim(); if (!name) throw new BadRequestException('分类名称不能为空');
    return this.transaction(async tx => {
      const nodes = await tx.category.findMany(); const before = nodes.find(row => row.id === id);
      if (id && !before) throw new NotFoundException('分类不存在');
      if (before) { this.revision(before, input.baseRevision); if (before.scope !== input.scope) throw new BadRequestException('不能更改已有分类的数据域'); }
      const parentId = input.parentId || null; validateCategoryParent(nodes, id, parentId, input.scope);
      const data = { name, slug: cmsSlug(input.slug), scope: input.scope, parentId, sort: input.sort, description: input.description.trim() || null };
      const row = id ? await tx.category.update({ where: { id }, data: { ...data, revision: { increment: 1 } } }) : await tx.category.create({ data });
      await this.audit(tx, actor, id ? 'CATEGORY_UPDATED' : 'CATEGORY_CREATED', 'CATEGORY', row.id, { parentId, sort: row.sort }); return row;
    });
  }
  async removeCategory(id: string, baseRevision: number, actor: AdminPrincipal) {
    return this.transaction(async tx => {
      const row = await tx.category.findUnique({ where: { id } }); if (!row) throw new NotFoundException('分类不存在'); this.revision(row, baseRevision);
      const [children, contents, products] = await Promise.all([
        tx.category.count({ where: { parentId: id } }), tx.content.count({ where: { OR: [{ categoryId: id }, { publishedSnapshot: { path: ['categoryId'], equals: id } }] } }), tx.product.count({ where: { OR: [{ categoryId: id }, { publishedSnapshot: { path: ['categoryId'], equals: id } }] } })
      ]);
      if (children || contents || products) throw new ConflictException('分类仍有子分类或内容引用，请先移动或解除引用');
      await tx.category.delete({ where: { id } }); await this.audit(tx, actor, 'CATEGORY_DELETED', 'CATEGORY', id, { name: row.name }); return { id, deleted: true };
    });
  }
}
