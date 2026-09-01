import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {PrismaService} from './prisma.service';
import type {AdminPrincipal} from './auth.types';
import type {CatalogQueryDto,CatalogWriteDto} from './catalog.dto';
import {catalogMoney,normalizeProduct,productSnapshot} from './catalog-content';
import {descendantIds} from './cms-content';
@Injectable()
export class CatalogService {
  constructor(private db:PrismaService){}
  private async transaction<T>(work:(tx:Prisma.TransactionClient)=>Promise<T>){try{return await this.db.$transaction(work,{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}catch(error){if(['P2002','P2034','P2003'].includes((error as any)?.code))throw new ConflictException('商品标识被占用、仍被引用或发生并发变更，请刷新重试');throw error}}
  private revision(row:{revision:number},revision?:number){if(revision===undefined)throw new BadRequestException('必须提供 baseRevision');if(row.revision!==revision)throw new ConflictException('商品版本已变化，请刷新后重试')}
  private audit(tx:Prisma.TransactionClient,actor:AdminPrincipal,action:string,id:string,detail:any={}){return tx.auditLog.create({data:{adminUserId:actor.id,action,resource:'PRODUCT',resourceId:id,detail}})}
  private async category(tx:Prisma.TransactionClient,id:string|null){if(id&&!(await tx.category.findFirst({where:{id,scope:'PRODUCT'}})))throw new BadRequestException('必须选择独立商品分类，不能使用内容分类')}
  private adminView(row:any){return {...row,price:catalogMoney(row.price),compareAtPrice:row.compareAtPrice==null?null:catalogMoney(row.compareAtPrice)}}
  async get(id:string){const row=await this.db.product.findUnique({where:{id}});if(!row)throw new NotFoundException('商品不存在');return this.adminView(row)}
  async save(id:string|undefined,input:CatalogWriteDto,actor:AdminPrincipal){const data=normalizeProduct(input);return this.transaction(async tx=>{await this.category(tx,data.categoryId);const before=id?await tx.product.findUnique({where:{id}}):null;if(id&&!before)throw new NotFoundException('商品不存在');if(before)this.revision(before,input.baseRevision);const row=before?await tx.product.update({where:{id},data:{...data,revision:{increment:1}}}):await tx.product.create({data});await this.audit(tx,actor,before?'PRODUCT_DRAFT_SAVED':'PRODUCT_CREATED',row.id,{revision:row.revision,kind:row.kind});return this.adminView(row)})}
  async publish(id:string,baseRevision:number,actor:AdminPrincipal){return this.transaction(async tx=>{const before=await tx.product.findUnique({where:{id}});if(!before)throw new NotFoundException('商品不存在');this.revision(before,baseRevision);if(before.status==='ARCHIVED')throw new BadRequestException('归档商品须由管理员先恢复为草稿');await this.category(tx,before.categoryId);const {snapshot}=productSnapshot(before,true);const row=await tx.product.update({where:{id},data:{publishedSnapshot:snapshot,publishedSlug:before.slug,publishedPrice:before.price,publishedSales:before.sales,publishedAt:new Date(),status:'PUBLISHED',revision:{increment:1}}});await this.audit(tx,actor,'PRODUCT_PUBLISHED',id,{revision:row.revision});return this.adminView(row)})}
  async status(id:string,status:'DRAFT'|'OFFLINE'|'ARCHIVED',baseRevision:number,actor:AdminPrincipal){return this.transaction(async tx=>{const before=await tx.product.findUnique({where:{id}});if(!before)throw new NotFoundException('商品不存在');this.revision(before,baseRevision);if((before.status==='ARCHIVED'||status==='ARCHIVED')&&!['ADMIN','SUPER_ADMIN'].includes(actor.role))throw new ForbiddenException('仅管理员可归档或恢复商品');const row=await tx.product.update({where:{id},data:{status,publishedSlug:null,revision:{increment:1}}});await this.audit(tx,actor,'PRODUCT_STATUS_CHANGED',id,{from:before.status,to:status});return this.adminView(row)})}
  private publicView(row:any){if(!row.publishedSnapshot)throw new NotFoundException('商品未发布');const result=productSnapshot(row.publishedSnapshot);return {...result.snapshot,id:row.id,slug:row.publishedSlug,descriptionHtml:result.html,available:result.available,publishedAt:row.publishedAt}}
  async publicGet(id:string){const row=await this.db.product.findFirst({where:{id,status:'PUBLISHED',publishedSlug:{not:null}}});if(!row)throw new NotFoundException('商品不存在或已下架');return this.publicView(row)}
  async resolve(ids:string[]){const rows=await this.db.product.findMany({where:{id:{in:ids},status:'PUBLISHED',publishedSlug:{not:null}}});return {items:rows.map(row=>this.publicView(row)),unavailableIds:ids.filter(id=>!rows.some(row=>row.id===id))}}
  async list(query:CatalogQueryDto,published=false){
    const where:Prisma.ProductWhereInput=published?{status:'PUBLISHED',publishedSlug:{not:null}}:{status:query.status},and:Prisma.ProductWhereInput[]=[];
    if(query.categoryId){const nodes=await this.db.category.findMany({where:{scope:'PRODUCT'}}),ids=nodes.some(row=>row.id===query.categoryId)?descendantIds(nodes,query.categoryId):[];and.push(published?{OR:ids.map(id=>({publishedSnapshot:{path:['categoryId'],equals:id}}))}:{categoryId:{in:ids}})}
    if(query.currency)and.push(published?{publishedSnapshot:{path:['currency'],equals:query.currency}}:{currency:query.currency});
    if(query.search?.trim()){const text={contains:query.search.trim(),mode:'insensitive' as const};if(published){and.push({OR:[{publishedSnapshot:{path:['name'],string_contains:query.search.trim(),mode:'insensitive'}},{publishedSnapshot:{path:['summary'],string_contains:query.search.trim(),mode:'insensitive'}}]})}else and.push({OR:[{name:text},{summary:text},{sku:text}]})}
    where.AND=and;
    const key=query.sort.startsWith('price')?(published?'publishedPrice':'price'):query.sort==='salesDesc'?(published?'publishedSales':'sales'):(published?'publishedAt':'createdAt');
    const direction=query.sort==='priceAsc'||query.sort==='oldest'?'asc':'desc';
    const [items,total]=await this.db.$transaction([this.db.product.findMany({where,orderBy:[{[key]:direction},{id:'asc'}],skip:(query.page-1)*query.limit,take:query.limit}),this.db.product.count({where})]);
    return {items:published?items.map(row=>this.publicView(row)):items.map(row=>this.adminView(row)),total,page:query.page,limit:query.limit};
  }
}
