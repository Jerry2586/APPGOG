import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import type { AdminPrincipal } from './auth.types';
import { OperationsService } from './operations.service';
import { OperationListDto, OperationRevisionDto, OperationSaveDto, PluginRestoreDto, ThemeActivateDto } from './operations.dto';
type ActorRequest = { user: AdminPrincipal };
@Controller('admin')
@UseGuards(AdminGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
export class OperationsController {
  constructor(private operations: OperationsService) {}
  @Get('theme-state') status() { return this.operations.status(); }
  @Post('theme/:id/activate') activate(@Param('id') id: string, @Body() dto: ThemeActivateDto, @Req() req: ActorRequest) { return this.operations.activate(id, dto, req.user); }
  @Get('pluginSnippet/:id/versions') @Roles('SUPER_ADMIN') versions(@Param('id') id: string, @Query() query: OperationListDto) { return this.operations.versions(id, query); }
  @Post('pluginSnippet/:id/disable') @Roles('SUPER_ADMIN') disable(@Param('id') id: string, @Body() dto: OperationRevisionDto, @Req() req: ActorRequest) { return this.operations.disable(id, dto.baseRevision, req.user); }
  @Post('pluginSnippet/:id/restore') @Roles('SUPER_ADMIN') restore(@Param('id') id: string, @Body() dto: PluginRestoreDto, @Req() req: ActorRequest) { return this.operations.restore(id, dto, req.user); }
  @Get('theme') themeList(@Query() query: OperationListDto) { return this.operations.list('theme', query); }
  @Get('theme/:id') themeGet(@Param('id') id: string) { return this.operations.get('theme', id); }
  @Post('theme') themeCreate(@Body() dto: OperationSaveDto, @Req() req: ActorRequest) { return this.operations.save('theme', undefined, dto, req.user); }
  @Patch('theme/:id') themeUpdate(@Param('id') id: string, @Body() dto: OperationSaveDto, @Req() req: ActorRequest) { return this.operations.save('theme', id, dto, req.user); }
  @Delete('theme/:id') themeDelete(@Param('id') id: string, @Body() dto: OperationRevisionDto, @Req() req: ActorRequest) { return this.operations.remove('theme', id, dto.baseRevision, req.user); }
  @Get('themeSchedule') themeScheduleList(@Query() query: OperationListDto) { return this.operations.list('themeSchedule', query); }
  @Get('themeSchedule/:id') themeScheduleGet(@Param('id') id: string) { return this.operations.get('themeSchedule', id); }
  @Post('themeSchedule') themeScheduleCreate(@Body() dto: OperationSaveDto, @Req() req: ActorRequest) { return this.operations.save('themeSchedule', undefined, dto, req.user); }
  @Patch('themeSchedule/:id') themeScheduleUpdate(@Param('id') id: string, @Body() dto: OperationSaveDto, @Req() req: ActorRequest) { return this.operations.save('themeSchedule', id, dto, req.user); }
  @Delete('themeSchedule/:id') themeScheduleDelete(@Param('id') id: string, @Body() dto: OperationRevisionDto, @Req() req: ActorRequest) { return this.operations.remove('themeSchedule', id, dto.baseRevision, req.user); }
  @Get('marketingCampaign') marketingCampaignList(@Query() query: OperationListDto) { return this.operations.list('marketingCampaign', query); }
  @Get('marketingCampaign/:id') marketingCampaignGet(@Param('id') id: string) { return this.operations.get('marketingCampaign', id); }
  @Post('marketingCampaign') marketingCampaignCreate(@Body() dto: OperationSaveDto, @Req() req: ActorRequest) { return this.operations.save('marketingCampaign', undefined, dto, req.user); }
  @Patch('marketingCampaign/:id') marketingCampaignUpdate(@Param('id') id: string, @Body() dto: OperationSaveDto, @Req() req: ActorRequest) { return this.operations.save('marketingCampaign', id, dto, req.user); }
  @Delete('marketingCampaign/:id') marketingCampaignDelete(@Param('id') id: string, @Body() dto: OperationRevisionDto, @Req() req: ActorRequest) { return this.operations.remove('marketingCampaign', id, dto.baseRevision, req.user); }
  @Get('pluginSnippet') @Roles('SUPER_ADMIN') pluginSnippetList(@Query() query: OperationListDto) { return this.operations.list('pluginSnippet', query); }
  @Get('pluginSnippet/:id') @Roles('SUPER_ADMIN') pluginSnippetGet(@Param('id') id: string) { return this.operations.get('pluginSnippet', id); }
  @Post('pluginSnippet') @Roles('SUPER_ADMIN') pluginSnippetCreate(@Body() dto: OperationSaveDto, @Req() req: ActorRequest) { return this.operations.save('pluginSnippet', undefined, dto, req.user); }
  @Patch('pluginSnippet/:id') @Roles('SUPER_ADMIN') pluginSnippetUpdate(@Param('id') id: string, @Body() dto: OperationSaveDto, @Req() req: ActorRequest) { return this.operations.save('pluginSnippet', id, dto, req.user); }
  @Delete('pluginSnippet/:id') @Roles('SUPER_ADMIN') pluginSnippetDelete(@Param('id') id: string, @Body() dto: OperationRevisionDto, @Req() req: ActorRequest) { return this.operations.remove('pluginSnippet', id, dto.baseRevision, req.user); }
}
