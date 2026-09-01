// Opt-in local acceptance harness. Real catalog HTTP/JWT/services with an
// in-memory database, test login/media/page data; not a deployment server.
import {createRequire} from 'node:module';import {fileURLToPath,pathToFileURL} from 'node:url';import {randomUUID} from 'node:crypto';
const requireApi=createRequire(new URL('../apps/api/package.json',import.meta.url)),requireWeb=createRequire(new URL('../apps/web/package.json',import.meta.url));requireApi('reflect-metadata');
const apiFile=name=>requireApi(`./dist/src/${name}.js`),{Test}=requireApi('@nestjs/testing'),{ValidationPipe}=requireApi('@nestjs/common'),{JwtModule,JwtService}=requireApi('@nestjs/jwt');
const {CatalogController,PublicCatalogController}=apiFile('catalog.controller'),{CatalogService}=apiFile('catalog.service'),{CatalogWriteDto}=apiFile('catalog.dto'),{CategoryController,PublicCmsController}=apiFile('cms.controller'),{CmsService}=apiFile('cms.service'),{CategoryWriteDto}=apiFile('cms.dto'),{KnowledgeService}=apiFile('knowledge.service'),{PrismaService}=apiFile('prisma.service'),{cmsDatabaseFixture}=apiFile('cms-test-fixture'),{ComponentController}=apiFile('component.controller'),{JWT_ISSUER,JWT_AUDIENCE}=apiFile('security.config');
const db=cmsDatabaseFixture();
const module=await Test.createTestingModule({imports:[JwtModule.register({secret:randomUUID(),signOptions:{issuer:JWT_ISSUER,audience:JWT_AUDIENCE,expiresIn:'1h'}})],controllers:[CatalogController,PublicCatalogController,CategoryController,PublicCmsController,ComponentController],providers:[CatalogService,CmsService,KnowledgeService,{provide:PrismaService,useValue:db}]}).compile();
const app=module.createNestApplication({logger:false});app.setGlobalPrefix('api/v1');app.useBodyParser('json',{limit:'512kb'});app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=','base64');
const layout=[{id:'categories',type:'categories',props:{title:'商品分类',scope:'PRODUCT'}},{id:'products',type:'products',props:{title:'独立商品',sort:'salesDesc',limit:2,columns:2,categoryId:'',cardStyle:'solid',hoverEffect:'none'}},{id:'cart',type:'cart',props:{title:'独立购物车',position:'inline'}}];
const page={id:'catalog-fixture',name:'商品组件测试',slug:'store',routeType:'PAGE',status:'DRAFT',draftVersionId:'v1',publishedVersionId:null,draftLayout:layout};
app.use(async(req,res,next)=>{
  if(req.path==='/api/v1/auth/admin/login'){const role=['VIEWER','EDITOR','ADMIN'].includes(req.body.email?.split('@')[0])?req.body.email.split('@')[0]:'ADMIN';return res.json({accessToken:await module.get(JwtService).signAsync({sub:role,sid:role,role,type:'access'}),expiresIn:3600,user:{id:role,role,name:'第九阶段测试账号',email:`${role}@example.invalid`}})}
  if(req.path==='/api/v1/admin/pages'&&req.method==='GET')return res.json([page]);
  if(req.path==='/api/v1/admin/pages/catalog-fixture'&&req.method==='GET')return res.json(page);
  if(req.path==='/api/v1/admin/pages/catalog-fixture/versions'&&req.method==='GET')return res.json([]);
  if(req.path==='/api/v1/__fixture/layout')return res.json(layout);
  if(req.path==='/api/v1/admin/media')return res.json({items:[1,2].map(i=>({id:`catalog-fixture-${i}`,publicUrl:`/api/v1/public/media/catalog-fixture-${i}`,originalName:`商品图${i}.png`,altText:`商品图 ${i}`,width:1,height:1})),total:2,page:1,limit:24});
  if(req.path.startsWith('/api/v1/public/media/catalog-fixture-'))return res.set('Content-Type','image/png').send(png);
  next();
});
await app.listen(0,'127.0.0.1');const apiOrigin=await app.getUrl();
const actor={id:'ADMIN',sessionId:'ADMIN',role:'ADMIN',email:'ADMIN@example.invalid',displayName:'测试管理员'},cms=module.get(CmsService),catalog=module.get(CatalogService);
const root=await cms.saveCategory(undefined,Object.assign(new CategoryWriteDto(),{scope:'PRODUCT',name:'设备服务',slug:'catalog'}),actor);
const child=await cms.saveCategory(undefined,Object.assign(new CategoryWriteDto(),{scope:'PRODUCT',name:'设备',slug:'devices',parentId:root.id}),actor);
for(const value of [{name:'验收设备 A',slug:'fixture-a',price:'19.90',stock:3,sales:10,kind:'DEVICE',categoryId:child.id},{name:'售罄设备 B',slug:'fixture-b',price:'9.90',stock:0,sales:9,kind:'DEVICE',categoryId:child.id},{name:'定制服务 C',slug:'fixture-c',price:'100.00',stock:2,sales:3,kind:'SERVICE',categoryId:root.id}]){const row=await catalog.save(undefined,Object.assign(new CatalogWriteDto(),{currency:'CNY',description:'# 真实商品详情\n\n仅用于本机测试。',externalUrl:'https://supplier.example.invalid/item',coverUrl:'http://127.0.0.1:5176/api/v1/public/media/catalog-fixture-1',gallery:['http://127.0.0.1:5176/api/v1/public/media/catalog-fixture-1','http://127.0.0.1:5176/api/v1/public/media/catalog-fixture-2'],...value}),actor);await catalog.publish(row.id,row.revision,actor)}
const {createServer}=await import(pathToFileURL(requireWeb.resolve('vite')).href);
const server=await createServer({root:fileURLToPath(new URL('../apps/web',import.meta.url)),server:{host:'127.0.0.1',port:5176,strictPort:true,proxy:{'/api':apiOrigin}},plugins:[{name:'stage9-isolated-fixture',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(!req.url?.startsWith('/__stage9'))return next();res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>APPGOG 第九阶段隔离验证</title></head><body><div id="app"></div><script type="module" src="/tests/catalog-browser.ts"></script></body></html>'))})}}]});
await server.listen();console.log('Stage 9 isolated fixture: http://127.0.0.1:5176/__stage9-admin');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();await app.close();process.exit(0)});
