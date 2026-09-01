import {Body,Controller,Delete,Get,Param,Patch,Post,Query,Req,UseGuards} from '@nestjs/common';
import {AdminGuard} from './auth.guard';import {RolesGuard} from './roles.guard';import {Roles} from './roles.decorator';
import type {AdminPrincipal} from './auth.types';
import {CmsRevisionDto,CmsStatusDto} from './cms.dto';
import {CatalogQueryDto,CatalogResolveDto,CatalogWriteDto} from './catalog.dto';
import {CatalogService} from './catalog.service';
@Controller('admin/product') @UseGuards(AdminGuard,RolesGuard) @Roles('VIEWER','EDITOR','ADMIN','SUPER_ADMIN')
export class CatalogController {
  constructor(private catalog:CatalogService){}
  @Get() async list(@Query() query:CatalogQueryDto){return (await this.catalog.list(query)).items}
  @Get('page') page(@Query() query:CatalogQueryDto){return this.catalog.list(query)}
  @Get(':id') get(@Param('id') id:string){return this.catalog.get(id)}
  @Post() @Roles('EDITOR','ADMIN','SUPER_ADMIN') create(@Body() dto:CatalogWriteDto,@Req() req:{user:AdminPrincipal}){return this.catalog.save(undefined,dto,req.user)}
  @Patch(':id') @Roles('EDITOR','ADMIN','SUPER_ADMIN') save(@Param('id') id:string,@Body() dto:CatalogWriteDto,@Req() req:{user:AdminPrincipal}){return this.catalog.save(id,dto,req.user)}
  @Post(':id/publish') @Roles('EDITOR','ADMIN','SUPER_ADMIN') publish(@Param('id') id:string,@Body() dto:CmsRevisionDto,@Req() req:{user:AdminPrincipal}){return this.catalog.publish(id,dto.baseRevision,req.user)}
  @Post(':id/status') @Roles('EDITOR','ADMIN','SUPER_ADMIN') status(@Param('id') id:string,@Body() dto:CmsStatusDto,@Req() req:{user:AdminPrincipal}){return this.catalog.status(id,dto.status,dto.baseRevision,req.user)}
  @Delete(':id') @Roles('ADMIN','SUPER_ADMIN') archive(@Param('id') id:string,@Body() dto:CmsRevisionDto,@Req() req:{user:AdminPrincipal}){return this.catalog.status(id,'ARCHIVED',dto.baseRevision,req.user)}
}
@Controller('public')
export class PublicCatalogController {
  constructor(private catalog:CatalogService){}
  @Get('products') async list(@Query() query:CatalogQueryDto){return (await this.catalog.list(query,true)).items}
  @Get('product-search') page(@Query() query:CatalogQueryDto){return this.catalog.list(query,true)}
  @Get('products/:id') get(@Param('id') id:string){return this.catalog.publicGet(id)}
  // Read-only resolution of product IDs; never an order, checkout or payment API.
  @Post('products/resolve') resolve(@Body() dto:CatalogResolveDto){return this.catalog.resolve(dto.ids)}
}
