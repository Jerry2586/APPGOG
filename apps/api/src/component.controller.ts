import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminGuard } from './auth.guard';
import { COMPONENT_REGISTRY, COMPONENT_SCHEMA_VERSION } from './component-registry';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

@Controller('admin/components')
@UseGuards(AdminGuard, RolesGuard)
@Roles('VIEWER', 'EDITOR', 'ADMIN', 'SUPER_ADMIN')
export class ComponentController {
  @Get()
  manifest() {
    return { schemaVersion: COMPONENT_SCHEMA_VERSION, components: COMPONENT_REGISTRY };
  }
}
