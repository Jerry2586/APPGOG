// Isolated stage11 acceptance only. Loopback, fake database and test identities.
// Never imports AppModule, never loads real analytics/customer-service vendors.
import {createRequire} from 'node:module';import {fileURLToPath,pathToFileURL} from 'node:url';import {randomUUID} from 'node:crypto';
const requireApi=createRequire(new URL('../apps/api/package.json',import.meta.url)),requireWeb=createRequire(new URL('../apps/web/package.json',import.meta.url));requireApi('reflect-metadata');
const load=name=>requireApi(`./dist/src/${name}.js`),{Test}=requireApi('@nestjs/testing'),{ValidationPipe}=requireApi('@nestjs/common'),{JwtModule,JwtService}=requireApi('@nestjs/jwt');
const {OperationsController}=load('operations.controller'),{OperationsService}=load('operations.service'),{PublicController}=load('public.controller'),{PageService}=load('page.service'),{ComponentController}=load('component.controller'),{PrismaService}=load('prisma.service'),{cmsDatabaseFixture}=load('cms-test-fixture'),{JWT_ISSUER,JWT_AUDIENCE}=load('security.config');
const db=cmsDatabaseFixture(),layout=[{id:'head',type:'header',props:{logoText:'APPGOG',logoUrl:'/',themeToggle:true,navItems:[{label:'首页',url:'/'},{label:'第二页',url:'/second'}]}},{id:'hero',type:'hero',props:{title:'第十一阶段隔离验收',text:'本机测试数据，不代表实际促销或第三方服务。',align:'center'}},{id:'popup-block',type:'popup',props:{campaignId:'campaign-popup'}},{id:'countdown-block',type:'countdown',props:{campaignId:'campaign-countdown'}},{id:'banner-block',type:'sale',props:{campaignId:'campaign-banner'}}].map(b=>({...b,children:[]}));
const page={id:'fixture-page',name:'营销组件验证',slug:'home',routeType:'PAGE',status:'DRAFT',draftVersionId:'v1',publishedVersionId:null,draftLayout:layout};
const module=await Test.createTestingModule({imports:[JwtModule.register({secret:randomUUID(),signOptions:{issuer:JWT_ISSUER,audience:JWT_AUDIENCE,expiresIn:'1h'}})],controllers:[OperationsController,PublicController,ComponentController],providers:[OperationsService,{provide:PrismaService,useValue:db},{provide:PageService,useValue:{publicPage:async slug=>({...page,slug,layout})}}]}).compile();
const app=module.createNestApplication({logger:false});app.setGlobalPrefix('api/v1');app.useBodyParser('json',{limit:'512kb'});app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
app.use(async(req,res,next)=>{try{
  if(req.path==='/api/v1/__fixture/vendor.js')return setTimeout(()=>{res.type('text/javascript').send("document.getElementById('fixture-vendor').textContent='本地资源已加载';")},150);
  if(req.path==='/api/v1/auth/admin/login'){const requested=req.body.email?.split('@')[0],role=['SUPER_ADMIN','ADMIN','EDITOR','VIEWER'].includes(requested)?requested:'VIEWER';return res.json({accessToken:await module.get(JwtService).signAsync({sub:role,sid:role,role,type:'access'}),expiresIn:3600,user:{id:role,role,name:'第十一阶段隔离账号',email:`${role}@example.invalid`}})}
  if(req.path==='/api/v1/ai/config')return res.json({enabled:false,globalAssistantEnabled:false});
  if(req.path==='/api/v1/admin/pages'&&req.method==='GET')return res.json([page]);
  if(req.path==='/api/v1/admin/pages/fixture-page'&&req.method==='GET')return res.json(page);
  if(req.path==='/api/v1/admin/pages/fixture-page/versions'&&req.method==='GET')return res.json([]);
  if(req.path==='/api/v1/__fixture/expire'&&req.method==='POST'){await db.marketingCampaign.update({where:{id:'campaign-countdown'},data:{endAt:new Date(Date.now()+5000),revision:{increment:1}}});return res.json({message:'倒计时五秒后结束，点击前台刷新配置查看'})}
  if(req.path==='/api/v1/__fixture/disable-probes'&&req.method==='POST'){for(const row of db.rows('pluginSnippet').filter(row=>row.enabled))await module.get(OperationsService).disable(row.id,row.revision,{id:'SUPER_ADMIN'});return res.json({disabled:true})}
  next();
}catch(error){next(error)}});
const ops=module.get(OperationsService),actor={id:'SUPER_ADMIN',role:'SUPER_ADMIN',email:'fixture@example.invalid',displayName:'Fixture',sessionId:'SUPER_ADMIN'};
const dark=await ops.save('theme',undefined,{baseRevision:0,data:{name:'默认科技蓝',mode:'DARK',variables:{primary:'#6d5dfc',accent:'#19d3ae',bg:'#090b16',surface:'#121527',text:'#eef0ff',muted:'#969bb8',radius:'18px',shadow:'0 8px 24px #00000026'},effects:{particles:false,density:24,disabledOnMobile:true}}},actor);
await ops.save('theme',undefined,{baseRevision:0,data:{name:'节日红',mode:'DARK',variables:{primary:'#d12240',accent:'#ffca58',bg:'#190b16',surface:'#2b1327',text:'#fff0f0',muted:'#c39bb8',radius:'24px',shadow:'0 16px 48px #00000040'},effects:{particles:true,density:24,disabledOnMobile:true}}},actor);
await ops.activate(dark.id,{baseRevision:1,baseStateRevision:0},actor);
for(const [id,kind,title] of [['campaign-popup','POPUP','隔离测试弹窗'],['campaign-countdown','COUNTDOWN','隔离测试倒计时'],['campaign-banner','BANNER','隔离测试横幅']])await db.marketingCampaign.create({data:{id,name:title,kind,config:{title,text:'仅验收用途',url:'/second',buttonText:'查看第二页',frequencyHours:24,pageRules:'/,/second',expiredBehavior:'hide',expiredText:'已结束',expiredUrl:''},startAt:null,endAt:kind==='COUNTDOWN'?new Date(Date.now()+86400000):null,timezone:'Asia/Shanghai',enabled:true,revision:1}});
for(const position of ['HEAD','BODY_END'])await ops.save('pluginSnippet',undefined,{baseRevision:0,data:{name:position+' 本地无外联探针',position,delayMs:3000,enabled:true,acknowledgeRisk:true,changeNote:'隔离环境验收，无任何外部调用',code:(position==='HEAD'?'<script src="/api/v1/__fixture/vendor.js"></script>':'')+`<script>document.getElementById('fixture-${position}').textContent='${position} 执行于 '+Math.round(performance.now())+'ms；前置资源状态 '+document.getElementById('fixture-vendor').textContent;</script>`}},actor);
await app.listen(0,'127.0.0.1');const apiOrigin=await app.getUrl();
const {createServer}=await import(pathToFileURL(requireWeb.resolve('vite')).href);
const server=await createServer({root:fileURLToPath(new URL('../apps/web',import.meta.url)),server:{host:'127.0.0.1',port:5178,strictPort:true,proxy:{'/api':apiOrigin}},plugins:[{name:'stage11-local-fixture',transformIndexHtml(html){return html.replace('/src/main.ts','/tests/operations-browser.ts')}}]});
await server.listen();console.log('Stage11 isolated fixture: http://127.0.0.1:5178/ and /admin');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();await app.close();process.exit(0)});
