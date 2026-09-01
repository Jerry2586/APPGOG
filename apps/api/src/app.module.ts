import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from './prisma.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AdminController } from './admin.controller';
import { PublicController } from './public.controller';
import { AiController } from './ai.controller';
import { ThemeSchedulerService } from './theme-scheduler.service';
import { AdminGuard } from './auth.guard';
import { KnowledgeService } from './knowledge.service';
import { RagAdminController } from './rag-admin.controller';
import { HealthController } from './health.controller';
import { AdminOriginGuard } from './admin-origin.guard';
import { AdminPermissionGuard } from './admin-permission.guard';
import { AdminSecurityController } from './admin-security.controller';
import { AdminSecurityService } from './admin-security.service';
import { RolesGuard } from './roles.guard';
import { createJwtOptions } from './security.config';
import { PageController } from './page.controller';
import { PageService } from './page.service';
import { ComponentController } from './component.controller';
import { MediaController, PublicMediaController } from './media.controller';
import { MediaService } from './media.service';
import { MediaStorageService } from './media-storage.service';
import { CmsService } from './cms.service';
import { CmsController, CategoryController, PublicCmsController } from './cms.controller';
import { CatalogController, PublicCatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { AiService } from './ai.service';
import { AiPolicyService } from './ai-policy.service';
import { AiGatewayService } from './ai-gateway.service';
import { KnowledgeWorkerService } from './knowledge-worker.service';
import { OperationsService } from './operations.service';
import { OperationsController } from './operations.controller';
import { HealthService } from './health.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    ScheduleModule.forRoot(),
    JwtModule.registerAsync({ global: true, inject: [ConfigService], useFactory: createJwtOptions })
  ],
  controllers: [AuthController, AdminSecurityController, ComponentController, MediaController, PublicMediaController, PageController, CmsController, CategoryController, PublicCmsController, CatalogController, PublicCatalogController, RagAdminController, OperationsController, AdminController, PublicController, AiController, HealthController],
  providers: [
    PrismaService,
    AuthService,
    AdminSecurityService,
    KnowledgeService,
    AiService,
    AiPolicyService,
    AiGatewayService,
    KnowledgeWorkerService,
    ThemeSchedulerService,
    OperationsService,
    AdminGuard,
    AdminOriginGuard,
    AdminPermissionGuard,
    RolesGuard,
    PageService,
    MediaStorageService,
    MediaService,
    CmsService,
    CatalogService,
    HealthService
  ]
})
export class AppModule {}
