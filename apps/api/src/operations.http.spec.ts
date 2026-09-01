import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';
import { PublicController } from './public.controller';
import { PageService } from './page.service';
import { AdminController } from './admin.controller';
import { PrismaService } from './prisma.service';
import { cmsDatabaseFixture } from './cms-test-fixture';
import { ADMIN_ROLES, type AdminRoleName } from './auth.types';
import { JWT_AUDIENCE, JWT_ISSUER } from './security.config';
describe('stage 11 real HTTP / JWT / DTO / service, isolated database fixture', () => {
  const db = cmsDatabaseFixture(), tokens: Partial<Record<AdminRoleName,string>> = {};
  let app: NestExpressApplication, base: string, service: OperationsService;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [JwtModule.register({secret:randomUUID(),signOptions:{issuer:JWT_ISSUER,audience:JWT_AUDIENCE,expiresIn:'15m'}})], controllers:[OperationsController,AdminController,PublicController], providers:[OperationsService,{provide:PrismaService,useValue:db},{provide:PageService,useValue:{}}] }).compile();
    service=module.get(OperationsService);app=module.createNestApplication<NestExpressApplication>({logger:false});app.setGlobalPrefix('api/v1');app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));await app.listen(0,'127.0.0.1');base=`${await app.getUrl()}/api/v1`;for(const role of ADMIN_ROLES)tokens[role]=await module.get(JwtService).signAsync({sub:role,sid:role,role,type:'access'});
  });
  afterAll(async()=>{await app?.close()});beforeEach(()=>db.reset());
  const req=(path:string,role?:AdminRoleName,method='GET',body?:any)=>fetch(base+path,{method,headers:{...(role?{authorization:`Bearer ${tokens[role]}`}:{ }),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  async function ok(path:string,role:AdminRoleName|undefined='ADMIN',method='GET',body?:any){const r=await req(path,role,method,body),data=await r.json();expect({status:r.status,error:r.ok?null:data}).toEqual({status:method==='POST'?201:200,error:null});return data}
  const theme=(extra:any={})=>({name:'测试主题',mode:'DARK',variables:{primary:'#123456',radius:'12px'},effects:{particles:false,density:20,disabledOnMobile:true},...extra});
  const plugin=(extra:any={})=>({name:'测试插件',position:'HEAD',code:'<script>/* fixture */</script>',delayMs:3000,enabled:false,acknowledgeRisk:false,changeNote:'初始审核',...extra});
  const config={title:'活动标题',text:'说明',url:'https://panel.example.invalid/buy',buttonText:'查看',frequencyHours:24,pageRules:'*',expiredBehavior:'hide',expiredText:'活动已结束',expiredUrl:''};
  const campaign=(extra:any={})=>({name:'活动',kind:'POPUP',startAt:null,endAt:null,timezone:'Asia/Shanghai',enabled:true,config,...extra});
  const create=(kind:string,data:any,role:AdminRoleName='ADMIN')=>ok('/admin/'+kind,role,'POST',{baseRevision:0,data});
  it('retains exact resource routes with strict roles, not the generic write bypass',async()=>{
    for(const resource of ['theme','themeSchedule','marketingCampaign','pluginSnippet']) {
      expect((await req('/admin/'+resource)).status).toBe(401);
      for(const role of ['VIEWER','EDITOR'] as const){expect((await req('/admin/'+resource,role)).status).toBe(403);expect((await req('/admin/'+resource,role,'POST',{baseRevision:0,data:theme()})).status).toBe(403)}
    }
    expect((await req('/admin/pluginSnippet','ADMIN')).status).toBe(403);
    expect((await req('/admin/theme','ADMIN','POST',{name:'legacy',active:true})).status).toBe(400);
    expect((await req('/admin/theme?limit=101','ADMIN')).status).toBe(400);
    expect((await req('/admin/theme?unknown=x','ADMIN')).status).toBe(400);
  });
  it('creates, updates with optimistic revision, audits and lists pages',async()=>{
    let row=await create('theme',theme());expect(row.revision).toBe(1);
    row=await ok(`/admin/theme/${row.id}`,'ADMIN','PATCH',{baseRevision:1,data:theme({name:'更新'})});expect(row.revision).toBe(2);
    expect((await req(`/admin/theme/${row.id}`,'ADMIN','PATCH',{baseRevision:1,data:theme()})).status).toBe(409);
    expect((await ok('/admin/theme?search=更新&limit=1')).total).toBe(1);expect(db.rows('auditLog')).toHaveLength(2);
  });
  it.each([{variables:{bg:'url(https://evil.invalid)'}},{variables:{evil:'#ffffff'}},{effects:{particles:true,density:900,disabledOnMobile:true}},{active:true},{mode:'SYSTEM'}])('rejects CSS injection, unsupported fields and effects %j',async extra=>{expect((await req('/admin/theme','ADMIN','POST',{baseRevision:0,data:theme(extra)})).status).toBe(400)});
  it('changes one default atomically and rejects stale cross-theme activation',async()=>{
    const first=await create('theme',theme()),second=await create('theme',theme({name:'第二主题'}));
    await ok(`/admin/theme/${first.id}/activate`,'ADMIN','POST',{baseRevision:1,baseStateRevision:0});
    expect((await req(`/admin/theme/${second.id}/activate`,'ADMIN','POST',{baseRevision:1,baseStateRevision:0})).status).toBe(409);
    await ok(`/admin/theme/${second.id}/activate`,'ADMIN','POST',{baseRevision:1,baseStateRevision:1});
    expect(db.rows('theme').filter((r:any)=>r.active).map((r:any)=>r.id)).toEqual([second.id]);
    expect((await req(`/admin/theme/${second.id}`,'ADMIN','DELETE',{baseRevision:1})).status).toBe(409);
  });
  it('rejects overlaps, permits adjacent intervals, restores default at end and catches up after downtime',async()=>{
    const baseTheme=await create('theme',theme()),holiday=await create('theme',theme({name:'节日'}));
    await ok(`/admin/theme/${baseTheme.id}/activate`,'ADMIN','POST',{baseRevision:1,baseStateRevision:0});
    const schedule={themeId:holiday.id,startAt:'2030-01-01T00:00:00+08:00',endAt:'2030-01-02T00:00:00+08:00',timezone:'Asia/Shanghai',enabled:true};
    await create('themeSchedule',schedule);
    expect((await req('/admin/themeSchedule','ADMIN','POST',{baseRevision:0,data:schedule})).status).toBe(409);
    const adjacent=await create('themeSchedule',{...schedule,startAt:schedule.endAt,endAt:'2030-01-03T00:00:00+08:00'});
    await service.applySchedule(new Date('2030-01-01T02:00:00+08:00'));expect(db.rows('theme').find((r:any)=>r.active).id).toBe(holiday.id);
    const auditCount=db.rows('auditLog').length;await service.applySchedule(new Date('2030-01-01T03:00:00+08:00'));expect(db.rows('auditLog')).toHaveLength(auditCount);
    await service.applySchedule(new Date('2030-01-03T00:00:00+08:00'));expect(db.rows('theme').find((r:any)=>r.active).id).toBe(baseTheme.id);
    expect((await req(`/admin/theme/${holiday.id}`,'ADMIN','DELETE',{baseRevision:1})).status).toBe(409);
    await ok(`/admin/themeSchedule/${adjacent.id}`,'ADMIN','DELETE',{baseRevision:1});
  });
  it.each([{startAt:'2030-01-01T00:00:00'},{startAt:'2030-02-30T00:00:00Z'},{timezone:'Not/AZone'},{endAt:'2001-01-01T00:00:00Z'},{themeId:'missing'}])('rejects invalid schedule %j',async extra=>{
    const row=await create('theme',theme());const r=await req('/admin/themeSchedule','ADMIN','POST',{baseRevision:0,data:{themeId:row.id,startAt:'2030-01-01T00:00:00Z',endAt:'2030-01-02T00:00:00Z',timezone:'Asia/Shanghai',enabled:true,...extra}});expect([400,404]).toContain(r.status);
  });
  it('rolls back all changes when audit append fails',async()=>{db.failAudit=true;expect((await req('/admin/theme','ADMIN','POST',{baseRevision:0,data:theme()})).status).toBe(500);expect(db.rows('theme')).toHaveLength(0)});
  it('public bootstrap filters campaign windows and invalid legacy content, never emits plugin history',async()=>{
    const active=await create('marketingCampaign',campaign());await create('marketingCampaign',campaign({name:'future',startAt:'2200-01-01T00:00:00Z'}));await create('marketingCampaign',campaign({name:'past',endAt:'2000-01-01T00:00:00Z'}));await create('marketingCampaign',campaign({name:'disabled',enabled:false}));
    const r=await req('/public/bootstrap');expect(r.headers.get('cache-control')).toBe('no-store');const data=await r.json();expect(data.campaigns.map((r:any)=>r.id)).toEqual([active.id]);expect(data.snippets).toEqual([]);
    db.rows('marketingCampaign')[0].config.url='javascript:alert(1)';expect((await ok('/public/bootstrap',undefined)).campaigns).toEqual([]);
  });
  it.each([{config:{...config,url:'https://panel.example.invalid/?token=secret'}},{config:{...config,url:'//evil.invalid'}},{config:{...config,pageRules:'https://evil.invalid'}},{kind:'COUNTDOWN',endAt:null},{kind:'LOTTERY'}])('rejects marketing scope/URL/config errors %j',async extra=>{expect((await req('/admin/marketingCampaign','ADMIN','POST',{baseRevision:0,data:campaign(extra)})).status).toBe(400)});
  it('enforces both code permission and minimum delay; preserves immutable rollback history',async()=>{
    expect((await req('/admin/pluginSnippet','SUPER_ADMIN','POST',{baseRevision:0,data:plugin({delayMs:2999})})).status).toBe(400);
    expect((await req('/admin/pluginSnippet','SUPER_ADMIN','POST',{baseRevision:0,data:plugin({enabled:true})})).status).toBe(400);
    let row=await create('pluginSnippet',plugin({enabled:true,acknowledgeRisk:true}),'SUPER_ADMIN');
    expect((await ok('/admin/pluginSnippet','SUPER_ADMIN')).items[0].code).toBeUndefined();
    const live=(await ok('/public/bootstrap',undefined)).snippets[0];expect(live.delayMs).toBe(3000);expect(live.position).toBe('HEAD');expect(live.versions).toBeUndefined();
    row=await ok(`/admin/pluginSnippet/${row.id}/disable`,'SUPER_ADMIN','POST',{baseRevision:row.revision});expect(row.enabled).toBe(false);expect((await ok('/public/bootstrap',undefined)).snippets).toEqual([]);
    const versions=(await ok(`/admin/pluginSnippet/${row.id}/versions`,'SUPER_ADMIN')).items;expect(versions).toHaveLength(2);const original=versions.find((v:any)=>v.version===1);
    row=await ok(`/admin/pluginSnippet/${row.id}/restore`,'SUPER_ADMIN','POST',{baseRevision:row.revision,versionId:original.id,changeNote:'回退测试',acknowledgeRisk:false});expect(row.revision).toBe(3);expect(row.enabled).toBe(false);expect(db.rows('pluginSnippetVersion').find((v:any)=>v.id===original.id).enabled).toBe(true);
    expect((await req(`/admin/pluginSnippet/${row.id}`,'SUPER_ADMIN','DELETE',{baseRevision:3})).status).toBe(400);
  });
  it('plugin version ownership and audit failures cannot partially restore/enable code',async()=>{
    const a=await create('pluginSnippet',plugin(),'SUPER_ADMIN'),b=await create('pluginSnippet',plugin({name:'other'}),'SUPER_ADMIN');
    const version=db.rows('pluginSnippetVersion').find((v:any)=>v.pluginSnippetId===a.id);
    expect((await req(`/admin/pluginSnippet/${b.id}/restore`,'SUPER_ADMIN','POST',{baseRevision:1,versionId:version.id,changeNote:'no',acknowledgeRisk:false})).status).toBe(404);
    db.failAudit=true;expect((await req(`/admin/pluginSnippet/${a.id}`,'SUPER_ADMIN','PATCH',{baseRevision:1,data:plugin({enabled:true,acknowledgeRisk:true})})).status).toBe(500);expect(db.rows('pluginSnippet').find((r:any)=>r.id===a.id).enabled).toBe(false);expect(db.rows('pluginSnippetVersion')).toHaveLength(2);
  });
  it('bounds executable aggregate payload, preserving disabled drafts when the budget is full',async()=>{
    for(let n=0;n<16;n++)await create('pluginSnippet',plugin({name:'plugin-'+n,enabled:true,acknowledgeRisk:true}),'SUPER_ADMIN');
    expect((await req('/admin/pluginSnippet','SUPER_ADMIN','POST',{baseRevision:0,data:plugin({name:'excess',enabled:true,acknowledgeRisk:true})})).status).toBe(400);
    await create('pluginSnippet',plugin({name:'disabled extra'}),'SUPER_ADMIN');
  });
});
