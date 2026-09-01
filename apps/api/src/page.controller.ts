import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard } from './auth.guard';
import type { AdminPrincipal } from './auth.types';
import { ChangePageStatusDto, CreatePageDto, InstallSiteStarterDto, PublishPageDto, RestorePageVersionDto, SavePageDraftDto } from './page.dto';
import { PageService } from './page.service';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

@Controller('admin/pages')
@UseGuards(AdminGuard, RolesGuard)
@Roles('VIEWER', 'EDITOR', 'ADMIN', 'SUPER_ADMIN')
export class PageController {
  constructor(private pages: PageService) {}

  private actor(request: Request) {
    return (request as Request & { user: AdminPrincipal }).user;
  }

  private metadata(request: Request) {
    return { ip: request.ip, userAgent: request.get('user-agent') };
  }

  @Get()
  list() { return this.pages.list(); }

  @Post()
  @Roles('EDITOR', 'ADMIN', 'SUPER_ADMIN')
  create(@Body() dto: CreatePageDto, @Req() request: Request) {
    return this.pages.create(dto, this.actor(request), this.metadata(request));
  }

  @Get('site-starter')
  siteStarter() { return this.pages.siteStarter(); }

  @Post('site-starter')
  @Roles('ADMIN', 'SUPER_ADMIN')
  installSiteStarter(@Body() _dto: InstallSiteStarterDto, @Req() request: Request) {
    return this.pages.installSiteStarter(this.actor(request), this.metadata(request));
  }

  @Get(':id')
  get(@Param('id') id: string) { return this.pages.get(id); }

  @Patch(':id/draft')
  @Roles('EDITOR', 'ADMIN', 'SUPER_ADMIN')
  saveDraft(@Param('id') id: string, @Body() dto: SavePageDraftDto, @Req() request: Request) {
    return this.pages.saveDraft(id, dto, this.actor(request), this.metadata(request));
  }

  @Post(':id/publish')
  @Roles('EDITOR', 'ADMIN', 'SUPER_ADMIN')
  publish(@Param('id') id: string, @Body() dto: PublishPageDto, @Req() request: Request) {
    return this.pages.publish(id, dto.draftVersionId, this.actor(request), this.metadata(request));
  }

  @Post(':id/status')
  @Roles('EDITOR', 'ADMIN', 'SUPER_ADMIN')
  status(@Param('id') id: string, @Body() dto: ChangePageStatusDto, @Req() request: Request) {
    return this.pages.changeStatus(id, dto.status, this.actor(request), this.metadata(request));
  }

  @Get(':id/versions')
  versions(@Param('id') id: string) { return this.pages.versions(id); }

  @Get(':id/versions/:versionId')
  version(@Param('id') id: string, @Param('versionId') versionId: string) {
    return this.pages.version(id, versionId);
  }

  @Get(':id/preview')
  preview(@Param('id') id: string) { return this.pages.preview(id); }

  @Post(':id/restore')
  @Roles('EDITOR', 'ADMIN', 'SUPER_ADMIN')
  restore(@Param('id') id: string, @Body() dto: RestorePageVersionDto, @Req() request: Request) {
    return this.pages.restore(id, dto, this.actor(request), this.metadata(request));
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() request: Request) {
    return this.pages.remove(id, this.actor(request), this.metadata(request));
  }
}
