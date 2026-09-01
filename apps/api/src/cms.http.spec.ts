import 'reflect-metadata';
import {ValidationPipe,type INestApplication} from '@nestjs/common';
import {JwtModule,JwtService} from '@nestjs/jwt';
import {Test} from '@nestjs/testing';
import {randomUUID} from 'node:crypto';
import type {NestExpressApplication} from '@nestjs/platform-express';
import {ADMIN_ROLES,type AdminRoleName} from './auth.types';
import {JWT_AUDIENCE,JWT_ISSUER} from './security.config';
import {CmsController,CategoryController,PublicCmsController} from './cms.controller';
import {CmsService} from './cms.service';
import {KnowledgeService} from './knowledge.service';
import {PrismaService} from './prisma.service';
import {cmsDatabaseFixture} from './cms-test-fixture';
import {AdminController} from './admin.controller';
describe('stage 8 real HTTP/JWT/services with isolated Prisma fixture',()=>{
  const db=cmsDatabaseFixture(),tokens:Partial<Record<AdminRoleName,string>>={};let app:NestExpressApplication,base:string;
  let priorKey:string|undefined;
  beforeAll(async()=>{priorKey=process.env.OPENAI_API_KEY;delete process.env.OPENAI_API_KEY;const module=await Test.createTestingModule({imports:[JwtModule.register({secret:randomUUID(),signOptions:{issuer:JWT_ISSUER,audience:JWT_AUDIENCE,expiresIn:'15m'}})],controllers:[CmsController,CategoryController,PublicCmsController,AdminController],providers:[CmsService,KnowledgeService,{provide:PrismaService,useValue:db}]}).compile();app=module.createNestApplication<NestExpressApplication>({logger:false});app.setGlobalPrefix('api/v1');app.useBodyParser('json',{limit:'512kb'});app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));await app.listen(0,'127.0.0.1');base=`${await app.getUrl()}/api/v1`;for(const role of ADMIN_ROLES)tokens[role]=await module.get(JwtService).signAsync({sub:role,sid:role,role,type:'access'})});
  beforeEach(()=>db.reset());afterAll(async()=>{await app?.close();if(priorKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=priorKey});
  const payload=(extra:any={})=>({type:'ARTICLE',format:'MARKDOWN',title:'Windows 安装',slug:'help/windows',body:'公开安装说明',...extra});
  function request(path:string,role?:AdminRoleName,method='GET',body?:any){return fetch(base+path,{method,headers:{...(role?{Authorization:`Bearer ${tokens[role]}`}:{ }),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})}
  async function ok(path:string,role?:AdminRoleName,method='GET',body?:any){const response=await request(path,role,method,body),data=await response.json();expect({status:response.status,data:response.ok?'ok':data}).toEqual({status:method==='POST'?201:200,data:'ok'});return data}
  const create=(extra:any={})=>ok('/admin/content','EDITOR','POST',payload(extra));
  const publish=(doc:any)=>ok(`/admin/content/${doc.id}/publish`,'EDITOR','POST',{baseRevision:doc.revision});
  it('authenticates and rejects viewer writes and generic publish-field injection',async()=>{
    expect((await request('/admin/content')).status).toBe(401);expect((await request('/admin/category')).status).toBe(401);
    await ok('/admin/content','VIEWER');for(const resource of ['content','category'])expect((await request(`/admin/${resource}`,'VIEWER','POST',payload())).status).toBe(403);
    for(const extra of [{status:'PUBLISHED'},{publishedSnapshot:{}},{revision:9},{viewCount:1},{ragEnabled:'true'},{body:null},{videoUrl:'javascript:x'},{type:'ORDER'}])expect((await request('/admin/content','EDITOR','POST',payload(extra))).status).toBe(400);
    expect(db.rows('content')).toHaveLength(0);
  });
  it('publishes nested URLs and isolates draft title/body/slug/category and search',async()=>{
    const root=await ok('/admin/category','EDITOR','POST',{name:'公开分类',slug:'public'}),other=await ok('/admin/category','EDITOR','POST',{name:'待发布分类',slug:'draft'});
    let doc=await create({categoryId:root.id});expect((await request('/public/contents/help/windows')).status).toBe(404);expect(await ok('/public/contents')).toHaveLength(0);
    doc=await publish(doc);expect((await ok('/public/contents/help/windows')).breadcrumb[0].name).toBe('公开分类');
    doc=await ok(`/admin/content/${doc.id}`,'EDITOR','PATCH',payload({title:'秘密草稿',slug:'new/path',body:'绝密草稿词',categoryId:other.id,baseRevision:doc.revision}));
    const live=await ok('/public/contents/help/windows');expect(live.title).toBe('Windows 安装');expect(live.html).toContain('公开安装说明');expect(live.revision).toBeUndefined();expect(live.indexJobs).toBeUndefined();expect((await request('/public/contents/new/path')).status).toBe(404);
    for(const search of ['秘密草稿','绝密草稿词','待发布分类'])expect((await ok(`/public/content-search?search=${encodeURIComponent(search)}`)).total).toBe(0);
    expect((await ok(`/public/content-search?search=${encodeURIComponent('公开分类')}`)).total).toBe(1);
    expect((await ok(`/public/content-search?categoryId=${root.id}`)).total).toBe(1);expect((await ok(`/public/content-search?categoryId=${other.id}`)).total).toBe(0);
    await publish(doc);expect((await request('/public/contents/help/windows')).status).toBe(404);expect((await ok('/public/contents/new/path')).title).toBe('秘密草稿');
  });
  it('enforces optimistic versions and atomic audit on saves and publish',async()=>{
    const doc=await create();expect((await request(`/admin/content/${doc.id}`,'EDITOR','PATCH',payload())).status).toBe(400);
    expect((await request(`/admin/content/${doc.id}/publish`,'EDITOR','POST',{baseRevision:0})).status).toBe(400);
    expect((await request(`/admin/content/${doc.id}/publish`,'EDITOR','POST',{baseRevision:9})).status).toBe(409);
    db.failAudit=true;expect((await request(`/admin/content/${doc.id}/publish`,'EDITOR','POST',{baseRevision:1})).status).toBe(500);expect(db.rows('content')[0].status).toBe('DRAFT');
    expect((await request(`/admin/content/${doc.id}`,'EDITOR','PATCH',payload({baseRevision:1,title:'未提交'}))).status).toBe(500);expect(db.rows('content')[0].title).toBe('Windows 安装');expect(db.rows('auditLog')).toHaveLength(1);
  });
  it('retains archived records and guards archive/restore/direct republish',async()=>{
    let doc=await publish(await create());expect((await request(`/admin/content/${doc.id}/status`,'EDITOR','POST',{baseRevision:doc.revision,status:'ARCHIVED'})).status).toBe(403);
    expect((await request(`/admin/content/${doc.id}`,'EDITOR','DELETE',{baseRevision:doc.revision})).status).toBe(403);
    doc=await ok(`/admin/content/${doc.id}/status`,'ADMIN','POST',{baseRevision:doc.revision,status:'ARCHIVED'});expect(db.rows('content')).toHaveLength(1);expect((await request('/public/contents/help/windows')).status).toBe(404);
    expect((await request(`/admin/content/${doc.id}/publish`,'ADMIN','POST',{baseRevision:doc.revision})).status).toBe(400);
    expect((await request(`/admin/content/${doc.id}/status`,'EDITOR','POST',{baseRevision:doc.revision,status:'DRAFT'})).status).toBe(403);
    doc=await ok(`/admin/content/${doc.id}/status`,'ADMIN','POST',{baseRevision:doc.revision,status:'DRAFT'});doc=await publish(doc);
    await ok(`/admin/content/${doc.id}/status`,'EDITOR','POST',{baseRevision:doc.revision,status:'OFFLINE'});expect((await ok('/public/contents')).length).toBe(0);
  });
  it('creates, sorts and moves categories with cycle/scope/reference guards',async()=>{
    let root=await ok('/admin/category','EDITOR','POST',{name:'根分类',slug:'root',sort:9});const child=await ok('/admin/category','EDITOR','POST',{name:'子分类',slug:'child',parentId:root.id,sort:1});
    expect((await request(`/admin/category/${root.id}`,'EDITOR','PATCH',{name:'根分类',slug:'root',parentId:child.id,baseRevision:1})).status).toBe(400);
    expect((await request(`/admin/category/${root.id}`,'ADMIN','DELETE',{baseRevision:1})).status).toBe(409);
    expect((await request('/admin/category','EDITOR','POST',{name:'商品',slug:'product',scope:'PRODUCT',parentId:root.id})).status).toBe(400);
    const doc=await publish(await create({categoryId:child.id}));expect((await ok(`/public/content-search?categoryId=${root.id}`)).total).toBe(1);
    expect((await request(`/admin/category/${child.id}`,'ADMIN','DELETE',{baseRevision:1})).status).toBe(409);
    await ok(`/admin/content/${doc.id}`,'EDITOR','PATCH',payload({baseRevision:doc.revision}));expect((await request(`/admin/category/${child.id}`,'ADMIN','DELETE',{baseRevision:1})).status).toBe(409);
    root=await ok(`/admin/category/${root.id}`,'EDITOR','PATCH',{name:'根分类',slug:'root',sort:-2,baseRevision:1});expect(root.sort).toBe(-2);expect(root.revision).toBe(2);
    const isolated=await ok('/admin/category','EDITOR','POST',{name:'无引用',slug:'empty'});await ok(`/admin/category/${isolated.id}`,'ADMIN','DELETE',{baseRevision:1});
  });
  it('handles structured FAQ and video lifecycle and safe rich HTML',async()=>{
    let faq=await create({type:'FAQ',slug:'faq',body:'',format:'RICH_TEXT'});expect((await request(`/admin/content/${faq.id}/publish`,'EDITOR','POST',{baseRevision:1})).status).toBe(400);
    faq=await ok(`/admin/content/${faq.id}`,'EDITOR','PATCH',payload({type:'FAQ',slug:'faq',format:'RICH_TEXT',faqQuestion:'如何安装？',faqAnswer:'<p><strong>先下载</strong><script>evil()</script><img src="x" onerror="evil()"></p>',baseRevision:1}));await publish(faq);const publicFaq=await ok('/public/contents/faq');expect(publicFaq.faqQuestion).toBe('如何安装？');expect(publicFaq.faqHtml).toContain('<strong>先下载</strong>');expect(publicFaq.faqHtml).not.toMatch(/script|onerror/);
    const video=await create({type:'VIDEO',slug:'video',videoUrl:'https://example.invalid/a.m3u8?sig=one'});await publish(video);expect((await ok('/public/content-search?type=VIDEO')).total).toBe(1);expect((await ok('/public/content-search?type=FAQ')).total).toBe(1);
  });
  it('paginates and rejects invalid queries, duplicate slugs, type changes and foreign category',async()=>{
    const doc=await create();expect((await request('/admin/content','EDITOR','POST',payload())).status).toBe(409);
    expect((await request(`/admin/content/${doc.id}`,'EDITOR','PATCH',payload({baseRevision:1,type:'VIDEO'}))).status).toBe(400);
    expect((await request('/admin/content','EDITOR','POST',payload({slug:'other',categoryId:'missing'}))).status).toBe(400);
    await create({slug:'second'});await create({slug:'third'});const list=await ok('/admin/content/page?page=2&limit=2','VIEWER');expect(list.total).toBe(3);expect(list.items).toHaveLength(1);
    for(const query of ['page=0','limit=101','type=ORDER','sort=random','x=1'])expect((await request(`/public/content-search?${query}`)).status).toBe(400);
  });
  it('indexes only published snapshots, reports true failures and removes disabled/offline sources',async()=>{
    let doc=await create({ragEnabled:true});expect(db.rows('knowledgeChunk')).toHaveLength(0);doc=await publish(doc);expect(doc.indexJobs[0].status).toBe('PENDING');const knowledge=new KnowledgeService(db);await knowledge.processNext();expect(db.rows('knowledgeChunk')[0].text).toContain('公开安装说明');
    doc=await ok(`/admin/content/${doc.id}`,'EDITOR','PATCH',payload({body:'秘密草稿',ragEnabled:true,baseRevision:doc.revision}));expect(db.rows('knowledgeChunk')[0].text).not.toContain('秘密草稿');
    expect(await knowledge.retrieve('秘密草稿')).toHaveLength(0);expect(await knowledge.retrieve('公开安装')).toHaveLength(1);
    db.failChunk=true;doc=await ok(`/admin/content/${doc.id}/reindex`,'EDITOR','POST',{baseRevision:doc.revision});expect(doc.indexJobs[0].status).toBe('PENDING');for(let n=0;n<3;n++){await knowledge.processNext();db.rows('knowledgeIndexJob').at(-1).availableAt=new Date(0)}expect(db.rows('knowledgeIndexJob').at(-1).status).toBe('FAILED');expect(doc.status).toBe('PUBLISHED');db.failChunk=false;
    doc=await ok(`/admin/content/${doc.id}`,'EDITOR','PATCH',payload({ragEnabled:false,baseRevision:doc.revision}));expect(db.rows('knowledgeChunk')).toHaveLength(0);expect(await knowledge.retrieve('公开安装')).toHaveLength(0);
    expect((await request(`/admin/content/${doc.id}/reindex`,'EDITOR','POST',{baseRevision:doc.revision})).status).toBe(400);
  });
  it('accepts documented long rich text within body bounds',async()=>{const body='<p>'+ '内容'.repeat(45000)+'</p>';const doc=await create({body,format:'RICH_TEXT'});expect(doc.body.length).toBe(body.length)});
});
