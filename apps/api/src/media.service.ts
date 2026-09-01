import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, type MediaAsset } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import type { AdminPrincipal } from './auth.types';
import { inspectImage, validateImage, normalizeAltText, normalizeMediaFolder, safeOriginalName } from './media-file';
import { MediaStorageService } from './media-storage.service';
import { PrismaService } from './prisma.service';
import type { MediaListQueryDto, UpdateMediaDto } from './media.dto';

export type UploadedImage = { buffer: Buffer; originalname: string; mimetype: string; size: number };
type RequestMetadata = { ip?: string; userAgent?: string; requestId?: string };

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private decoding = 0;
  constructor(private db: PrismaService, private storage: MediaStorageService) {}

  private view(asset: MediaAsset & { createdBy?: { displayName: string } | null }) {
    const { storageKey: _privateKey, ...publicFields } = asset;
    return { ...publicFields, publicUrl: `/api/v1/public/media/${asset.id}` };
  }

  async list(query: MediaListQueryDto) {
    const where: any = {
      archivedAt: query.state === 'all' ? undefined : query.state === 'archived' ? { not: null } : null,
      folder: query.folder || undefined
    };
    if (query.search?.trim()) where.OR = [
      { originalName: { contains: query.search.trim(), mode: 'insensitive' } },
      { altText: { contains: query.search.trim(), mode: 'insensitive' } }
    ];
    const [items, total] = await this.db.$transaction([
      this.db.mediaAsset.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit, include: { createdBy: { select: { displayName: true } } } }),
      this.db.mediaAsset.count({ where })
    ]);
    return { items: items.map(item => this.view(item)), total, page: query.page, limit: query.limit };
  }

  async upload(file: UploadedImage | undefined, body: { altText?: string; folder?: string }, actor: AdminPrincipal, metadata: RequestMetadata) {
    if (!file?.buffer?.length) throw new BadRequestException('请选择需要上传的图片');
    const inspected = inspectImage(file.buffer);
    if (file.size !== file.buffer.length) throw new BadRequestException('上传文件大小不一致');
    if (file.mimetype !== inspected.mimeType) throw new BadRequestException('声明的文件类型与实际图片内容不一致');
    const altText = normalizeAltText(body.altText), folder = normalizeMediaFolder(body.folder);
    if (this.decoding >= 2) throw new ServiceUnavailableException('图片验证繁忙，请稍后重试');
    this.decoding += 1;
    try { Object.assign(inspected, await validateImage(file.buffer)); }
    finally { this.decoding -= 1; }
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const storageKey = `${sha256.slice(0, 2)}/${randomUUID()}.${inspected.extension}`;
    await this.storage.write(storageKey, file.buffer);
    try {
      const asset = await this.db.$transaction(async tx => {
        const created = await tx.mediaAsset.create({ data: {
          storageKey,
          originalName: safeOriginalName(file.originalname),
          mimeType: inspected.mimeType,
          extension: inspected.extension,
          byteSize: file.buffer.length,
          sha256,
          width: inspected.width,
          height: inspected.height,
          altText,
          folder,
          createdById: actor.id
        } });
        await tx.auditLog.create({ data: { adminUserId: actor.id, action: 'MEDIA_UPLOADED', resource: 'MEDIA_ASSET', resourceId: created.id, detail: { mimeType: created.mimeType, byteSize: created.byteSize, sha256: created.sha256 }, ...metadata } });
        return created;
      });
      return this.view(asset);
    } catch (error) {
      // A transport failure can arrive AFTER a successful commit. Never delete
      // bytes until an independent read confirms there is no metadata reference.
      try {
        const committed = await this.db.mediaAsset.findUnique({ where: { storageKey } });
        if (committed) return this.view(committed);
        if (!committed) await this.storage.remove(storageKey);
      } catch {
        this.logger.error(`媒体事务状态不确定，保留文件等待对账；未执行盲目删除：${storageKey}`);
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateMediaDto, actor: AdminPrincipal, metadata: RequestMetadata) {
    const data: Record<string, unknown> = {};
    if (dto.altText !== undefined) data.altText = normalizeAltText(dto.altText);
    if (dto.folder !== undefined) data.folder = normalizeMediaFolder(dto.folder);
    if (!Object.keys(data).length) throw new BadRequestException('没有可更新的媒体属性');
    const asset = await this.mutate(async tx => {
      const before = await tx.mediaAsset.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('媒体资源不存在');
      const updated = await tx.mediaAsset.update({ where: { id }, data });
      await tx.auditLog.create({ data: { adminUserId: actor.id, action: 'MEDIA_UPDATED', resource: 'MEDIA_ASSET', resourceId: id, before: { altText: before.altText, folder: before.folder }, after: { altText: updated.altText, folder: updated.folder }, ...metadata } });
      return updated;
    });
    return this.view(asset);
  }

  async archive(id: string, actor: AdminPrincipal, metadata: RequestMetadata) {
    const asset = await this.mutate(async tx => {
      const before = await tx.mediaAsset.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('媒体资源不存在');
      if (before.archivedAt) return before;
      const archived = await tx.mediaAsset.update({ where: { id }, data: { archivedAt: new Date() } });
      await tx.auditLog.create({ data: { adminUserId: actor.id, action: 'MEDIA_ARCHIVED', resource: 'MEDIA_ASSET', resourceId: id, detail: { storageRetained: true }, ...metadata } });
      return archived;
    });
    return this.view(asset);
  }

  async restore(id: string, actor: AdminPrincipal, metadata: RequestMetadata) {
    const asset = await this.mutate(async tx => {
      const before = await tx.mediaAsset.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('媒体资源不存在');
      if (!before.archivedAt) return before;
      const restored = await tx.mediaAsset.update({ where: { id }, data: { archivedAt: null } });
      await tx.auditLog.create({ data: { adminUserId: actor.id, action: 'MEDIA_RESTORED', resource: 'MEDIA_ASSET', resourceId: id, ...metadata } });
      return restored;
    });
    return this.view(asset);
  }

  async publicAsset(id: string) {
    const asset = await this.db.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('媒体资源不存在');
    try {
      const bytes = await this.storage.read(asset.storageKey, asset.byteSize);
      if (bytes.length !== asset.byteSize || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) {
        throw new ServiceUnavailableException('媒体文件完整性校验失败');
      }
      return { asset, bytes };
    }
    catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new NotFoundException('媒体文件不存在');
      throw new ServiceUnavailableException('媒体存储暂时不可用');
    }
  }

  private async mutate<T>(action: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try { return await this.db.$transaction(action, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) {
      if ((error as { code?: string }).code === 'P2034') throw new ConflictException('媒体信息被并发修改，请刷新后重试');
      throw error;
    }
  }
}
