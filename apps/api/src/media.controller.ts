import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { AdminGuard } from './auth.guard';
import type { AdminPrincipal } from './auth.types';
import { ALLOWED_IMAGE_MIME_TYPES, MAX_MEDIA_BYTES } from './media-file';
import { MediaListQueryDto, MediaUploadDto, RestoreMediaDto, UpdateMediaDto } from './media.dto';
import { MediaService, type UploadedImage } from './media.service';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

@Controller('admin/media')
@UseGuards(AdminGuard, RolesGuard)
@Roles('VIEWER', 'EDITOR', 'ADMIN', 'SUPER_ADMIN')
export class MediaController {
  constructor(private media: MediaService) {}
  private actor(request: Request) { return (request as Request & { user: AdminPrincipal }).user; }
  private metadata(request: Request) { return { ip: request.ip, userAgent: request.get('user-agent')?.slice(0, 2000), requestId: request.get('x-request-id')?.slice(0, 100) }; }

  @Get()
  list(@Query() query: MediaListQueryDto) { return this.media.list(query); }

  @Post()
  @Roles('EDITOR', 'ADMIN', 'SUPER_ADMIN')
  @UseInterceptors(FileInterceptor('file', {
    // Busboy emits LIMIT_FILE_SIZE at equality: permit exactly 10 MiB,
    // reject the first byte above it. The decoder also checks the real length.
    limits: { fileSize: MAX_MEDIA_BYTES + 1, files: 1, fields: 2, parts: 4, fieldSize: 4096 },
    fileFilter: (_request, file, callback) => ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype as any)
      ? callback(null, true) : callback(new BadRequestException('只允许 JPEG、PNG、GIF 或 WebP 图片'), false)
  }))
  upload(@UploadedFile() file: UploadedImage | undefined, @Body() body: MediaUploadDto, @Req() request: Request) {
    return this.media.upload(file, body, this.actor(request), this.metadata(request));
  }

  @Patch(':id')
  @Roles('EDITOR', 'ADMIN', 'SUPER_ADMIN')
  update(@Param('id') id: string, @Body() body: UpdateMediaDto, @Req() request: Request) {
    return this.media.update(id, body, this.actor(request), this.metadata(request));
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  archive(@Param('id') id: string, @Req() request: Request) {
    return this.media.archive(id, this.actor(request), this.metadata(request));
  }

  @Post(':id/restore')
  @Roles('ADMIN', 'SUPER_ADMIN')
  restore(@Param('id') id: string, @Body() _body: RestoreMediaDto, @Req() request: Request) {
    return this.media.restore(id, this.actor(request), this.metadata(request));
  }
}

@Controller('public/media')
export class PublicMediaController {
  constructor(private media: MediaService) {}

  @Get(':id')
  async get(@Param('id') id: string, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const { asset, bytes } = await this.media.publicAsset(id);
    const etag = `"${asset.sha256}"`;
    response.set({
      'Content-Type': asset.mimeType,
      'Content-Length': String(bytes.length),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(asset.originalName)}`,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'ETag': etag,
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'cross-origin'
    });
    if (request.get('if-none-match')?.split(',').some(value => value.trim().replace(/^W\//, '') === etag || value.trim() === '*')) {
      response.removeHeader('Content-Length'); response.status(304); return;
    }
    return new StreamableFile(bytes);
  }
}
