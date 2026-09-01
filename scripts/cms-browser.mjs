// Opt-in browser acceptance harness: real Nest CMS services/JWT and Vue UI,
// isolated in-memory Prisma. Never production configuration or credentials.
import { createRequire } from 'node:module';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
const requireApi=createRequire(new URL('../apps/api/package.json',import.meta.url));
const requireWeb=createRequire(new URL('../apps/web/package.json',import.meta.url));
requireApi('reflect-metadata');delete process.env.OPENAI_API_KEY;
const {Test}=requireApi('@nestjs/testing'),{ValidationPipe}=requireApi('@nestjs/common'),{JwtModule,JwtService}=requireApi('@nestjs/jwt');
const apiFile=name=>requireApi(`./dist/src/${name}.js`);
const {CmsController,CategoryController,PublicCmsController}=apiFile('cms.controller'),{CmsService}=apiFile('cms.service'),{KnowledgeService}=apiFile('knowledge.service'),{PrismaService}=apiFile('prisma.service'),{cmsDatabaseFixture}=apiFile('cms-test-fixture'),{CmsWriteDto,CategoryWriteDto}=apiFile('cms.dto'),{JWT_ISSUER,JWT_AUDIENCE}=apiFile('security.config');
const db=cmsDatabaseFixture();
const module=await Test.createTestingModule({imports:[JwtModule.register({secret:randomUUID(),signOptions:{issuer:JWT_ISSUER,audience:JWT_AUDIENCE,expiresIn:'15m'}})],controllers:[CmsController,CategoryController,PublicCmsController],providers:[CmsService,KnowledgeService,{provide:PrismaService,useValue:db}]}).compile();
const app=module.createNestApplication({logger:false});app.setGlobalPrefix('api/v1');app.useBodyParser('json',{limit:'512kb'});app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=','base64');
app.use(async(req,res,next)=>{
  if(req.path==='/api/v1/auth/admin/login'){const role=['VIEWER','EDITOR','ADMIN'].includes(req.body.email?.split('@')[0])?req.body.email.split('@')[0]:'ADMIN';res.json({accessToken:await module.get(JwtService).signAsync({sub:role,sid:role,role,type:'access'}),expiresIn:900,user:{id:role,role,name:'第八阶段测试账号',email:`${role}@example.invalid`}});return}
  if(req.path==='/api/v1/admin/pages'){res.json([]);return}
  if(req.path==='/api/v1/admin/components'){res.json({schemaVersion:1,components:[]});return}
  if(req.path==='/api/v1/admin/media'){res.json({items:[{id:'cms-fixture',publicUrl:'/api/v1/public/media/cms-fixture',originalName:'测试封面.png',altText:'测试封面',width:1,height:1}],total:1,page:1,limit:24});return}
  if(req.path==='/api/v1/public/media/cms-fixture'){res.set('Content-Type','image/png').send(png);return}next();
});
await app.listen(0,'127.0.0.1');const apiOrigin=await app.getUrl();
const actor={id:'ADMIN',sessionId:'ADMIN',role:'ADMIN',email:'ADMIN@example.invalid',displayName:'测试管理员'},cms=module.get(CmsService);
const root=await cms.saveCategory(undefined,Object.assign(new CategoryWriteDto(),{name:'安装教程',slug:'install'}),actor);
const child=await cms.saveCategory(undefined,Object.assign(new CategoryWriteDto(),{name:'Windows',slug:'windows',parentId:root.id}),actor);
for(const value of [{type:'ARTICLE',title:'初始公开文章',slug:'guide/start',body:'# 正文标题\n\n公开安装步骤',categoryId:child.id,seoTitle:'测试 SEO 标题',seoDescription:'测试 SEO 描述'},{type:'FAQ',title:'安装问题',slug:'guide/faq',faqQuestion:'如何安装客户端？',faqAnswer:'先下载，然后安装。',categoryId:child.id}]){const doc=await cms.save(undefined,Object.assign(new CmsWriteDto(),{format:'MARKDOWN',ragEnabled:true,...value}),actor);await cms.publish(doc.id,doc.revision,actor)}
const {createServer}=await import(pathToFileURL(requireWeb.resolve('vite')).href);
const server=await createServer({root:fileURLToPath(new URL('../apps/web',import.meta.url)),server:{host:'127.0.0.1',port:5175,strictPort:true,proxy:{'/api':apiOrigin}},plugins:[{name:'stage8-isolated-browser-fixture',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(!['/__stage8-cms-test','/__stage8-library','/','/content/'].some(path=>path==='/content/'?req.url?.startsWith(path):req.url?.split('?')[0]===path))return next();res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>APPGOG 第八阶段隔离验证</title></head><body><div id="app"></div><script type="module" src="/tests/cms-browser.ts"></script></body></html>'))})}}]});
await server.listen();console.log('Stage 8 isolated real HTTP/UI fixture: http://127.0.0.1:5175/__stage8-cms-test');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();await app.close();process.exit(0)});
