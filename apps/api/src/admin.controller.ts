import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from './auth.guard';
import { AdminPermissionGuard } from './admin-permission.guard';
import { PrismaService } from './prisma.service';

// Pages, CMS, catalog, themes, marketing and plugins have dedicated audited APIs.
// They must never be reachable through this generic resource whitelist.
const models = [
  'globalSetting', 'outboundLink'
] as const;

@Controller('admin')
@UseGuards(AdminGuard, AdminPermissionGuard)
export class AdminController {
  constructor(private db: PrismaService) {}

  private model(name: string): any {
    if (!(models as readonly string[]).includes(name)) throw new NotFoundException('未知资源');
    return (this.db as any)[name];
  }

  private assertHttpUrl(value: unknown, label: string) {
    if (!value) return;
    try {
      const url = new URL(String(value));
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    } catch {
      throw new BadRequestException(`${label}必须是 HTTP/HTTPS URL`);
    }
  }

  private assertPlainHttpUrl(value: unknown, label: string) {
    this.assertHttpUrl(value, label);
    const url = new URL(String(value));
    if (url.search || url.hash) throw new BadRequestException(`${label}不能包含查询参数或片段`);
  }

  private prepare(name: string, data: Record<string, any>) {
    const out = { ...data };
    if (out.slug !== undefined && !/^[a-z0-9][a-z0-9/_-]*$/i.test(out.slug)) {
      throw new BadRequestException('路由标识只能包含字母、数字、/、_ 和 -');
    }
    for (const key of ['parentId', 'categoryId', 'compareAtPrice', 'coverUrl', 'videoUrl']) {
      if (out[key] === '') out[key] = null;
    }
    if (name === 'outboundLink') this.assertPlainHttpUrl(out.destinationUrl, 'Xboard 外跳链接');
    return out;
  }

  @Get(':model')
  list(@Param('model') name: string) {
    return this.model(name).findMany({ orderBy: { createdAt: 'desc' } }).catch(() => this.model(name).findMany());
  }

  @Get(':model/:id')
  get(@Param('model') name: string, @Param('id') id: string) {
    return this.model(name).findUnique({ where: name === 'globalSetting' ? { key: id } : { id } });
  }

  @Post(':model')
  async create(@Param('model') name: string, @Body() body: Record<string, any>) {
    const data = this.prepare(name, body);
    const row = await this.model(name).create({ data });
    return row;
  }

  @Patch(':model/:id')
  async update(@Param('model') name: string, @Param('id') id: string, @Body() body: Record<string, any>) {
    const data = this.prepare(name, body);
    const row = await this.model(name).update({ where: name === 'globalSetting' ? { key: id } : { id }, data });
    return row;
  }

  @Delete(':model/:id')
  remove(@Param('model') name: string, @Param('id') id: string) {
    return this.model(name).delete({ where: name === 'globalSetting' ? { key: id } : { id } });
  }
}
