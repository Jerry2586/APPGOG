import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PublishStatus, RouteType } from '@prisma/client';
import type { AdminPrincipal } from './auth.types';
import type { CreatePageDto, RestorePageVersionDto, SavePageDraftDto } from './page.dto';
import { PageLayoutValidationError, assertLockedGlobalBlocks, normalizePageSlug, safePageUrl, validatePageLayout } from './page-layout';
import { PrismaService } from './prisma.service';
import { publicationRequirements, siteStarterPages, SITE_STARTER_VERSION } from './site-starter';

type RequestMetadata = { ip?: string; userAgent?: string };
type DraftMetadata = {
  name: string;
  slug: string;
  routeType: RouteType;
  redirectUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  ogImage: string | null;
};

@Injectable()
export class PageService {
  constructor(private db: PrismaService) {}

  private optionalText(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private externalRedirect(value: string | null | undefined) {
    if (!value) throw new BadRequestException('外部重定向页必须配置目标 URL');
    let url: URL;
    try {
      url = new URL(value.trim());
    } catch {
      throw new BadRequestException('重定向目标必须是 HTTP/HTTPS URL');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new BadRequestException('重定向目标必须是不含身份信息、查询参数或片段的 HTTP/HTTPS URL');
    }
    return url.toString();
  }

  private metadata(input: CreatePageDto): DraftMetadata {
    let slug: string;
    try {
      slug = normalizePageSlug(input.slug);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    const name = input.name.trim();
    if (!name) throw new BadRequestException('页面名称不能为空');
    const routeType = input.routeType;
    const redirectUrl = routeType === RouteType.REDIRECT ? this.externalRedirect(input.redirectUrl) : null;
    let ogImage = this.optionalText(input.ogImage);
    if (ogImage) {
      try {
        ogImage = safePageUrl(ogImage, 'SEO 分享图片');
      } catch (error) {
        throw new BadRequestException((error as Error).message);
      }
    }
    return {
      name,
      slug,
      routeType,
      redirectUrl,
      seoTitle: this.optionalText(input.seoTitle),
      seoDescription: this.optionalText(input.seoDescription),
      seoKeywords: this.optionalText(input.seoKeywords),
      ogImage
    };
  }

  private layout(input: unknown, schemaVersion: number) {
    try {
      return validatePageLayout(input, schemaVersion);
    } catch (error) {
      if (error instanceof PageLayoutValidationError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private versionData(metadata: DraftMetadata, layout: unknown, version: number, actor: AdminPrincipal, input: {
    schemaVersion?: number;
    changeNote?: string;
    restoredFromId?: string;
  }) {
    return {
      ...metadata,
      version,
      schemaVersion: input.schemaVersion ?? 1,
      layout: layout as Prisma.InputJsonValue,
      changeNote: this.optionalText(input.changeNote),
      createdById: actor.id,
      restoredFromId: input.restoredFromId
    };
  }

  private audit(actor: AdminPrincipal, metadata: RequestMetadata, action: string, pageId: string, data: {
    before?: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
    detail?: Prisma.InputJsonValue;
  } = {}) {
    return {
      adminUserId: actor.id,
      action,
      resource: 'PAGE',
      resourceId: pageId,
      ip: metadata.ip,
      userAgent: metadata.userAgent?.slice(0, 2000),
      ...data
    };
  }

  private uniqueConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') throw new ConflictException('页面路由已被占用');
      if (error.code === 'P2034') throw new ConflictException('页面被并发修改，请重新加载后重试');
    }
    throw error;
  }

  private async requirePage(id: string) {
    const page = await this.db.page.findUnique({
      where: { id },
      include: { draftVersion: true, publishedVersion: true, publishedRoute: true }
    });
    if (!page) throw new NotFoundException('页面不存在');
    return page;
  }

  private pageView(page: Awaited<ReturnType<PageService['requirePage']>>) {
    const { nextVersion: _nextVersion, ...safe } = page;
    return {
      ...safe,
      draftLayout: page.draftVersion?.layout ?? [],
      layout: page.publishedVersion?.layout ?? [],
      liveSlug: page.publishedRoute?.slug ?? null
    };
  }

  async list() {
    const pages = await this.db.page.findMany({
      include: { draftVersion: true, publishedVersion: true, publishedRoute: true },
      orderBy: { updatedAt: 'desc' }
    });
    return pages.map(page => this.pageView(page as Awaited<ReturnType<PageService['requirePage']>>));
  }

  async get(id: string) {
    return this.pageView(await this.requirePage(id));
  }

  async create(input: CreatePageDto, actor: AdminPrincipal, request: RequestMetadata) {
    const metadata = this.metadata(input);
    const layout = this.layout(input.layout, input.schemaVersion);
    try {
      const id = await this.db.$transaction(async tx => {
        const page = await tx.page.create({ data: { ...metadata, status: PublishStatus.DRAFT, nextVersion: 2 } });
        const version = await tx.pageVersion.create({
          data: { pageId: page.id, ...this.versionData(metadata, layout, 1, actor, input) }
        });
        await tx.page.update({ where: { id: page.id }, data: { draftVersionId: version.id } });
        await tx.auditLog.create({
          data: this.audit(actor, request, 'PAGE_CREATED', page.id, {
            after: { name: metadata.name, slug: metadata.slug, routeType: metadata.routeType, draftVersionId: version.id }
          })
        });
        return page.id;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return this.get(id);
    } catch (error) {
      return this.uniqueConflict(error);
    }
  }

  async siteStarter() {
    const [pages, liveRoutes] = await Promise.all([
      this.db.page.findMany({ select: { id: true, slug: true, status: true } }),
      this.db.publishedPageRoute.findMany({ select: { pageId: true, slug: true } })
    ]);
    return { version: SITE_STARTER_VERSION, pages: siteStarterPages().map(({ layout, ...page }) => ({
      ...page, requirements: publicationRequirements(layout),
      existingPageId: pages.find(item => item.slug === page.slug)?.id || liveRoutes.find(item => item.slug === page.slug)?.pageId || null
    })) };
  }

  async installSiteStarter(actor: AdminPrincipal, request: RequestMetadata) {
    const recipes = siteStarterPages();
    try {
      return await this.db.$transaction(async tx => {
        const [pages, liveRoutes] = await Promise.all([
          tx.page.findMany({ select: { slug: true } }), tx.publishedPageRoute.findMany({ select: { slug: true } })
        ]);
        const occupied = new Set([...pages, ...liveRoutes].map(page => page.slug));
        const created: { id: string; slug: string }[] = [], skipped: string[] = [];
        for (const recipe of recipes) {
          if (occupied.has(recipe.slug)) { skipped.push(recipe.slug); continue; }
          const metadata = this.metadata({ ...recipe, routeType: RouteType.PAGE, schemaVersion: 1 });
          const page = await tx.page.create({ data: { ...metadata, status: PublishStatus.DRAFT, nextVersion: 2 } });
          const version = await tx.pageVersion.create({ data: {
            pageId: page.id, ...this.versionData(metadata, recipe.layout, 1, actor, { changeNote: `官网方案 v${SITE_STARTER_VERSION} · ${recipe.requirement} · 待核实草稿` })
          } });
          await tx.page.update({ where: { id: page.id }, data: { draftVersionId: version.id } });
          await tx.auditLog.create({ data: this.audit(actor, request, 'SITE_DRAFT_CREATED', page.id, {
            after: { slug: recipe.slug, draftVersionId: version.id, starterVersion: SITE_STARTER_VERSION, requirement: recipe.requirement }
          }) });
          created.push({ id: page.id, slug: recipe.slug });
        }
        return { version: SITE_STARTER_VERSION, created, skipped };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
    } catch (error) { return this.uniqueConflict(error); }
  }

  async saveDraft(id: string, input: SavePageDraftDto, actor: AdminPrincipal, request: RequestMetadata) {
    const metadata = this.metadata(input);
    const layout = this.layout(input.layout, input.schemaVersion);
    try {
      await this.db.$transaction(async tx => {
        const current = await tx.page.findUnique({ where: { id }, include: { draftVersion: true } });
        if (!current) throw new NotFoundException('页面不存在');
        if (current.status === PublishStatus.ARCHIVED) throw new BadRequestException('归档页面需要先恢复为草稿状态');
        if (current.draftVersionId !== input.baseVersionId) {
          throw new ConflictException('草稿已被其他管理员修改，请重新加载后合并');
        }
        if (current.draftVersion) {
          try {
            assertLockedGlobalBlocks(current.draftVersion.layout, layout);
          } catch (error) {
            throw new BadRequestException((error as Error).message);
          }
        }
        const reserved = await tx.page.update({
          where: { id }, data: { nextVersion: { increment: 1 } }, select: { nextVersion: true }
        });
        const version = await tx.pageVersion.create({
          data: { pageId: id, ...this.versionData(metadata, layout, reserved.nextVersion - 1, actor, input) }
        });
        await tx.page.update({ where: { id }, data: { ...metadata, draftVersionId: version.id } });
        await tx.auditLog.create({
          data: this.audit(actor, request, 'PAGE_DRAFT_SAVED', id, {
            before: { draftVersionId: current.draftVersionId, slug: current.slug },
            after: { draftVersionId: version.id, slug: metadata.slug, version: version.version }
          })
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return this.get(id);
    } catch (error) {
      return this.uniqueConflict(error);
    }
  }

  async publish(id: string, draftVersionId: string, actor: AdminPrincipal, request: RequestMetadata) {
    try {
      await this.db.$transaction(async tx => {
        const page = await tx.page.findUnique({ where: { id }, include: { draftVersion: true } });
        if (!page) throw new NotFoundException('页面不存在');
        if (!page.draftVersion || page.draftVersionId !== draftVersionId) {
          throw new ConflictException('发布目标不是当前草稿，请重新加载');
        }
        const validated = this.layout(page.draftVersion.layout, page.draftVersion.schemaVersion);
        const requirements = publicationRequirements(validated);
        if (requirements.length) throw new BadRequestException({ message: '页面仍有待核实事项，完成后才能发布', requirements });
        await tx.publishedPageRoute.deleteMany({ where: { pageId: id } });
        await tx.page.update({
          where: { id },
          data: { publishedVersionId: page.draftVersion.id, status: PublishStatus.PUBLISHED, publishedAt: new Date() }
        });
        await tx.publishedPageRoute.create({
          data: { slug: page.draftVersion.slug, pageId: id, pageVersionId: page.draftVersion.id }
        });
        await tx.auditLog.create({
          data: this.audit(actor, request, 'PAGE_PUBLISHED', id, {
            before: { publishedVersionId: page.publishedVersionId, status: page.status },
            after: { publishedVersionId: page.draftVersion.id, slug: page.draftVersion.slug, status: 'PUBLISHED' }
          })
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return this.get(id);
    } catch (error) {
      return this.uniqueConflict(error);
    }
  }

  async changeStatus(id: string, status: 'DRAFT' | 'OFFLINE' | 'ARCHIVED', actor: AdminPrincipal, request: RequestMetadata) {
    await this.db.$transaction(async tx => {
      const page = await tx.page.findUnique({ where: { id }, include: { draftVersion: true } });
      if (!page) throw new NotFoundException('页面不存在');
      await tx.publishedPageRoute.deleteMany({ where: { pageId: id } });
      await tx.page.update({ where: { id }, data: { status } });
      await tx.auditLog.create({
        data: this.audit(actor, request, 'PAGE_STATUS_CHANGED', id, {
          before: { status: page.status }, after: { status }
        })
      });
    });
    return this.get(id);
  }

  async versions(id: string) {
    await this.requirePage(id);
    return this.db.pageVersion.findMany({
      where: { pageId: id },
      select: {
        id: true, version: true, schemaVersion: true, name: true, slug: true, routeType: true,
        changeNote: true, restoredFromId: true, createdAt: true,
        createdBy: { select: { id: true, email: true, displayName: true } }
      },
      orderBy: { version: 'desc' }
    });
  }

  async version(id: string, versionId: string) {
    const version = await this.db.pageVersion.findFirst({ where: { id: versionId, pageId: id } });
    if (!version) throw new NotFoundException('页面版本不存在');
    return version;
  }

  async preview(id: string) {
    const page = await this.requirePage(id);
    if (!page.draftVersion) throw new NotFoundException('页面没有草稿版本');
    const { pageId: _pageId, ...version } = page.draftVersion;
    return { pageId: page.id, status: page.status, ...version };
  }

  async restore(id: string, input: RestorePageVersionDto, actor: AdminPrincipal, request: RequestMetadata) {
    await this.db.$transaction(async tx => {
      const page = await tx.page.findUnique({ where: { id }, include: { draftVersion: true } });
      if (!page) throw new NotFoundException('页面不存在');
      if (page.draftVersionId !== input.baseVersionId) throw new ConflictException('草稿已变更，请重新加载');
      const source = await tx.pageVersion.findFirst({ where: { id: input.versionId, pageId: id } });
      if (!source) throw new NotFoundException('要恢复的版本不存在');
      this.layout(source.layout, source.schemaVersion);
      if (page.draftVersion) {
        try {
          assertLockedGlobalBlocks(page.draftVersion.layout, source.layout);
        } catch (error) {
          throw new BadRequestException((error as Error).message);
        }
      }
      const reserved = await tx.page.update({
        where: { id }, data: { nextVersion: { increment: 1 } }, select: { nextVersion: true }
      });
      const restored = await tx.pageVersion.create({
        data: {
          pageId: id,
          version: reserved.nextVersion - 1,
          schemaVersion: source.schemaVersion,
          layout: source.layout as Prisma.InputJsonValue,
          name: source.name,
          slug: source.slug,
          routeType: source.routeType,
          redirectUrl: source.redirectUrl,
          seoTitle: source.seoTitle,
          seoDescription: source.seoDescription,
          seoKeywords: source.seoKeywords,
          ogImage: source.ogImage,
          changeNote: this.optionalText(input.changeNote) || `恢复至版本 ${source.version}`,
          createdById: actor.id,
          restoredFromId: source.id
        }
      });
      await tx.page.update({
        where: { id },
        data: {
          name: source.name, slug: source.slug, routeType: source.routeType, redirectUrl: source.redirectUrl,
          seoTitle: source.seoTitle, seoDescription: source.seoDescription, seoKeywords: source.seoKeywords,
          ogImage: source.ogImage, draftVersionId: restored.id
        }
      });
      await tx.auditLog.create({
        data: this.audit(actor, request, 'PAGE_VERSION_RESTORED', id, {
          before: { draftVersionId: page.draftVersionId },
          after: { draftVersionId: restored.id, restoredFromId: source.id, version: restored.version }
        })
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return this.get(id);
  }

  async remove(id: string, actor: AdminPrincipal, request: RequestMetadata) {
    await this.db.$transaction(async tx => {
      const page = await tx.page.findUnique({ where: { id } });
      if (!page) throw new NotFoundException('页面不存在');
      await tx.auditLog.create({
        data: this.audit(actor, request, 'PAGE_DELETED', id, {
          before: { name: page.name, slug: page.slug, status: page.status }
        })
      });
      await tx.page.delete({ where: { id } });
    });
  }

  async publicPage(slugInput: string) {
    let slug: string;
    try {
      slug = normalizePageSlug(slugInput);
    } catch {
      throw new NotFoundException('页面不存在');
    }
    const route = await this.db.publishedPageRoute.findUnique({
      where: { slug },
      include: { page: true, pageVersion: true }
    });
    if (!route || route.page.status !== PublishStatus.PUBLISHED) throw new NotFoundException('页面不存在');
    const version = route.pageVersion;
    return {
      id: route.page.id,
      status: route.page.status,
      publishedAt: route.page.publishedAt,
      version: version.version,
      schemaVersion: version.schemaVersion,
      name: version.name,
      slug: version.slug,
      routeType: version.routeType,
      redirectUrl: version.redirectUrl,
      seoTitle: version.seoTitle,
      seoDescription: version.seoDescription,
      seoKeywords: version.seoKeywords,
      ogImage: version.ogImage,
      layout: version.layout
    };
  }
}
