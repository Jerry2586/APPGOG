import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import type { AdminPrincipal } from './auth.types';
import { CmsService } from './cms.service';
import { CategoryQueryDto, CategoryWriteDto, CmsQueryDto, CmsRevisionDto, CmsStatusDto, CmsWriteDto } from './cms.dto';
type AdminRequest = { user: AdminPrincipal };

@Controller('admin/content')
@UseGuards(AdminGuard, RolesGuard)
@Roles('VIEWER', 'EDITOR', 'ADMIN', 'SUPER_ADMIN')
export class CmsController {
  constructor(private cms: CmsService) {}
  @Get() async list(@Query() query: CmsQueryDto) { return (await this.cms.list(query)).items; }
  @Get('page') page(@Query() query: CmsQueryDto) { return this.cms.list(query); }
  @Get(':id') get(@Param('id') id: string) { return this.cms.get(id); }
  @Post() @Roles('EDITOR', 'ADMIN', 'SUPER_ADMIN')
  create(@Body() dto: CmsWriteDto, @Req() req: AdminRequest) { return this.cms.save(undefined, dto, req.user); }
  @Patch(':id') @Roles('EDITOR', 'ADMIN', 'SUPER_ADMIN')
  update(@Param('id') id: string, @Body() dto: CmsWriteDto, @Req() req: AdminRequest) { return this.cms.save(id, dto, req.user); }
  @Post(':id/publish') @Roles('EDITOR', 'ADMIN', 'SUPER_ADMIN')
  publish(@Param('id') id: string, @Body() dto: CmsRevisionDto, @Req() req: AdminRequest) { return this.cms.publish(id, dto.baseRevision, req.user); }
  @Post(':id/status') @Roles('EDITOR', 'ADMIN', 'SUPER_ADMIN')
  status(@Param('id') id: string, @Body() dto: CmsStatusDto, @Req() req: AdminRequest) { return this.cms.setStatus(id, dto.status, dto.baseRevision, req.user); }
  @Delete(':id') @Roles('ADMIN', 'SUPER_ADMIN')
  archive(@Param('id') id: string, @Body() dto: CmsRevisionDto, @Req() req: AdminRequest) { return this.cms.setStatus(id, 'ARCHIVED', dto.baseRevision, req.user); }
  @Post(':id/reindex') @Roles('EDITOR', 'ADMIN', 'SUPER_ADMIN')
  reindex(@Param('id') id: string, @Body() dto: CmsRevisionDto, @Req() req: AdminRequest) { return this.cms.reindex(id, dto.baseRevision, req.user); }
}
@Controller('admin/category')
@UseGuards(AdminGuard, RolesGuard)
@Roles('VIEWER', 'EDITOR', 'ADMIN', 'SUPER_ADMIN')
export class CategoryController {
  constructor(private cms: CmsService) {}
  @Get() list(@Query() query: CategoryQueryDto) { return this.cms.categories(query.scope); }
  @Get(':id') get(@Param('id') id: string) { return this.cms.category(id); }
  @Post() @Roles('EDITOR', 'ADMIN', 'SUPER_ADMIN')
  create(@Body() dto: CategoryWriteDto, @Req() req: AdminRequest) { return this.cms.saveCategory(undefined, dto, req.user); }
  @Patch(':id') @Roles('EDITOR', 'ADMIN', 'SUPER_ADMIN')
  update(@Param('id') id: string, @Body() dto: CategoryWriteDto, @Req() req: AdminRequest) { return this.cms.saveCategory(id, dto, req.user); }
  @Delete(':id') @Roles('ADMIN', 'SUPER_ADMIN')
  remove(@Param('id') id: string, @Body() dto: CmsRevisionDto, @Req() req: AdminRequest) { return this.cms.removeCategory(id, dto.baseRevision, req.user); }
}
@Controller('public')
export class PublicCmsController {
  constructor(private cms: CmsService) {}
  @Get('content-search') search(@Query() query: CmsQueryDto) { return this.cms.list(query, true); }
  @Get('contents') async list(@Query() query: CmsQueryDto) { return (await this.cms.list(query, true)).items; }
  @Get('contents/:slug') get(@Param('slug') slug: string) { return this.cms.publicContent(slug); }
  @Get('contents/*slug') nested(@Param('slug') slug: string | string[]) { return this.cms.publicContent(Array.isArray(slug) ? slug.join('/') : slug); }
  @Get('categories') categories(@Query() query: CategoryQueryDto) { return this.cms.categories(query.scope); }
}
