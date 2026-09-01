import { Controller, Get, Header, Param } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { PageService } from './page.service';
import { AiPolicyService } from './ai-policy.service';
import { OperationsService } from './operations.service';

@Controller('public')
export class PublicController {
  constructor(private db: PrismaService, private pages: PageService) {}
  @Get('bootstrap') @Header('Cache-Control', 'no-store') async bootstrap() {
    const [operations, settings, outboundLinks] = await Promise.all([
      new OperationsService(this.db).publicData(),
      this.db.globalSetting.findMany({ where: { public: true } }),
      this.db.outboundLink.findMany({ where: { enabled: true } })
    ]);
    const ai=await new AiPolicyService(this.db).publicConfig();
    return { ...operations, ai, settings: {...Object.fromEntries(settings.map(x => [x.key, x.value])), 'ai.globalAssistant.enabled':ai.globalAssistantEnabled}, outboundLinks };
  }
  @Get('pages/:slug') page(@Param('slug') slug: string) { return this.pages.publicPage(slug); }
  @Get('pages/*slug') nestedPage(@Param('slug') slug: string | string[]) {
    return this.pages.publicPage(Array.isArray(slug) ? slug.join('/') : slug);
  }
}
