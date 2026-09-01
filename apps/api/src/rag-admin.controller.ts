import {BadRequestException,Body,ConflictException,Controller,Get,NotFoundException,Param,Patch,Post,Query,Req,UseGuards} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {AdminGuard} from './auth.guard';
import {RolesGuard} from './roles.guard';
import {Roles} from './roles.decorator';
import type {AdminPrincipal} from './auth.types';
import {PrismaService} from './prisma.service';
import {KnowledgeService} from './knowledge.service';
import {AiGatewayService} from './ai-gateway.service';
import {AiPolicyService} from './ai-policy.service';
import {AiDocumentQueryDto,AiEmptyDto,AiFeedDto,AiJobQueryDto,AiReindexDto,AiSettingsDto} from './ai.dto';
import {cmsSnapshot} from './cms-content';

@Controller('admin/rag')
@UseGuards(AdminGuard,RolesGuard)
@Roles('VIEWER','EDITOR','ADMIN','SUPER_ADMIN')
export class RagAdminController {
  constructor(private db:PrismaService,private knowledge:KnowledgeService,private gateway:AiGatewayService,private policy:AiPolicyService){}
  @Get('status') async status(){
    const [settings,usage,eligible,chunks,pending,running,failed]=await Promise.all([this.policy.settings(),this.policy.usage(),
      this.db.content.count({where:{ragEnabled:true,status:'PUBLISHED',publishedSlug:{not:null}}}),this.db.knowledgeChunk.count({}),
      this.db.knowledgeIndexJob.count({where:{status:'PENDING'}}),this.db.knowledgeIndexJob.count({where:{status:'RUNNING'}}),this.db.knowledgeIndexJob.count({where:{status:'FAILED'}})]);
    return {settings,provider:this.gateway.status(),usage,eligibleDocuments:eligible,chunks,jobs:{pending,running,failed},workerEnabled:process.env.AI_WORKER_ENABLED!=='false'};
  }
  @Patch('settings') @Roles('SUPER_ADMIN')
  settings(@Body() dto:AiSettingsDto,@Req() req:{user:AdminPrincipal}){return this.policy.save(dto,req.user)}
  @Get('jobs') async jobs(@Query() query:AiJobQueryDto){
    const where={status:query.status,contentId:query.contentId};
    const [rows,total]=await this.db.$transaction([this.db.knowledgeIndexJob.findMany({where,orderBy:[{createdAt:'desc'},{id:'asc'}],skip:(query.page-1)*query.limit,take:query.limit}),this.db.knowledgeIndexJob.count({where})]);
    return {items:rows.map(({leaseToken,activeKey,...row})=>row),total,page:query.page,limit:query.limit};
  }
  @Get('documents') async documents(@Query() query:AiDocumentQueryDto){
    const where=query.contentId?{id:query.contentId}:{};
    const [rows,total]=await this.db.$transaction([this.db.content.findMany({where,orderBy:[{updatedAt:'desc'},{id:'asc'}],skip:(query.page-1)*query.limit,take:query.limit}),this.db.content.count({where})]);
    return {items:rows.map(row=>({id:row.id,title:row.title,status:row.status,revision:row.revision,ragEnabled:row.ragEnabled,ragIndexedAt:row.ragIndexedAt,publishedTitle:row.publishedSnapshot?cmsSnapshot(row.publishedSnapshot).snapshot.title:null})),total,page:query.page,limit:query.limit};
  }
  @Post('documents/:id/feed') @Roles('EDITOR','ADMIN','SUPER_ADMIN')
  async feed(@Param('id') id:string,@Body() dto:AiFeedDto,@Req() req:{user:AdminPrincipal}){
    try{return await this.db.$transaction(async tx=>{
      const doc=await tx.content.findUnique({where:{id}});if(!doc)throw new NotFoundException('文档不存在');if(doc.revision!==dto.baseRevision)throw new ConflictException('文档已变更，请刷新');
      const row=await tx.content.update({where:{id},data:{ragEnabled:dto.enabled,revision:{increment:1},...(!dto.enabled?{ragIndexedAt:null}:{})}});
      if(!dto.enabled){await this.knowledge.cancel(tx,id);await tx.knowledgeChunk.deleteMany({where:{contentId:id}})}else await this.knowledge.enqueue(tx,id,false,false);
      await tx.auditLog.create({data:{adminUserId:req.user.id,action:'AI_FEED_CHANGED',resource:'CONTENT',resourceId:id,detail:{enabled:dto.enabled,revision:row.revision}}});
      return {id,revision:row.revision,ragEnabled:row.ragEnabled};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}catch(error){if(['P2002','P2034'].includes((error as any)?.code))throw new ConflictException('并发修改，请刷新重试');throw error}
  }
  @Post('reindex') @Roles('ADMIN','SUPER_ADMIN')
  async reindex(@Body() dto:AiReindexDto,@Req() req:{user:AdminPrincipal}){
    await this.db.auditLog.create({data:{adminUserId:req.user.id,action:'AI_REINDEX_BATCH_REQUESTED',resource:'AI',detail:{afterId:dto.afterId||null}}});
    return this.knowledge.reindexAll(dto.afterId);
  }
  @Post('jobs/:id/retry') @Roles('EDITOR','ADMIN','SUPER_ADMIN')
  async retry(@Param('id') id:string,@Body() _dto:AiEmptyDto,@Req() req:{user:AdminPrincipal}){
    try{return await this.db.$transaction(async tx=>{
      const job=await tx.knowledgeIndexJob.findUnique({where:{id}});if(!job)throw new NotFoundException('任务不存在');if(job.status!=='FAILED')throw new BadRequestException('仅失败任务可重试');
      const result=await this.knowledge.enqueue(tx,job.contentId,true,false);if(result.status==='SKIPPED')throw new BadRequestException('来源未发布或投喂已关闭');
      await tx.auditLog.create({data:{adminUserId:req.user.id,action:'AI_INDEX_RETRY',resource:'CONTENT',resourceId:job.contentId,detail:{previousJobId:id}}});return result;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}catch(error){if(['P2002','P2034'].includes((error as any)?.code))throw new ConflictException('并发修改，请刷新重试');throw error}
  }
}
