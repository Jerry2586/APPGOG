import {createApp,defineComponent,h,ref} from 'vue';import {createRouter,createWebHistory,RouterView,RouterLink} from 'vue-router';import ElementPlus from 'element-plus';import 'element-plus/dist/index.css';import '../src/style.css';import '../src/media.css';import '../src/cms.css';import '../src/catalog.css';import '../src/ai.css';
import {api,loginAdmin} from '../src/api';import Admin from '../src/views/Admin.vue';import RagManager from '../src/components/RagManager.vue';import BlockRenderer from '../src/components/BlockRenderer.vue';import GlobalAiHost from '../src/components/GlobalAiHost.vue';import ContentView from '../src/views/ContentView.vue';
const layout=(await api.get('/__fixture/layout')).data;
const Public=defineComponent({setup:()=>()=>h('main',{style:'max-width:900px;margin:20px auto;padding:12px'},layout.map((block:any)=>h(BlockRenderer,{block})))});
const Manager=defineComponent({setup:()=>()=>h('main',{style:'padding:12px'},[h(RagManager)])});
const Measurements=defineComponent({setup(){const measured=ref('未读取');return()=>h('aside',{style:'padding:8px;background:#fff;color:#222;overflow-wrap:anywhere'},[h('button',{onClick:()=>{measured.value=JSON.stringify({viewport:window.innerWidth,client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth})}},'读取页面尺寸 '+location.pathname),h('output',{'aria-label':'页面尺寸'},measured.value)])}});
const Responsive=defineComponent({setup(){const width=ref('360'),view=ref('public');return()=>h('main',[h('h1','独立 iframe 视口'),h('label',['视口宽度',h('select',{'aria-label':'视口宽度',onChange:(e:Event)=>{width.value=(e.target as HTMLSelectElement).value}},['360','768'].map(value=>h('option',{value},value)))]),h('label',['测试页面',h('select',{'aria-label':'测试页面',onChange:(e:Event)=>{view.value=(e.target as HTMLSelectElement).value}},['public','manager'].map(value=>h('option',{value},value)))]),h('iframe',{title:'AI 响应式页面',src:`/__stage10-${view.value}`,width:width.value,height:'1000',style:'display:block;border:1px solid #888;max-width:100%'})])}});
const router=createRouter({history:createWebHistory(),routes:[{path:'/__stage10-admin',component:Admin,meta:{admin:true}},{path:'/__stage10-manager',component:Manager,meta:{admin:true}},{path:'/__stage10-public',component:Public},{path:'/__stage10-responsive',component:Responsive,meta:{admin:true}},{path:'/content/:slug(.*)+',component:ContentView}]});
// Public route starts anonymously; role login is opt-in through this visible harness control.
// Only the narrow manager fixture auto-selects a read-only local test session.
if(location.pathname==='/__stage10-manager')await loginAdmin({email:'VIEWER@example.invalid',password:'isolated-test-only'});
const harnessErrors=ref<string[]>([]),outcome=ref(''),version=ref(0);
const Fixture=defineComponent({
  setup:()=>()=>h('div',[
    h('header',{style:'padding:12px;background:#edf0fb;color:#222;overflow-wrap:anywhere'},[
      h('strong','第十阶段：真实 API + 内存数据库 + 模型替身'),
      h('p','不调用外部模型、不代表 PostgreSQL/实机/模型效果验收。公开页无需登录。'),
      ...[['admin','后台'],['public','首页助手'],['responsive','响应式验收']].map(([path,label])=>h(RouterLink,{to:'/__stage10-'+path,style:'margin-right:12px'},()=>label)),
      h('label',[' 测试角色 ',h('select',{
        'aria-label':'测试角色',
        onChange:async(e:Event)=>{
          await loginAdmin({email:(e.target as HTMLSelectElement).value+'@example.invalid',password:'isolated-test-only'});
          version.value++;
        }
      },[h('option',{value:''},'未登录'),...['SUPER_ADMIN','ADMIN','EDITOR','VIEWER'].map(value=>h('option',{value},value))])])
    ]),
    h('section',{style:'padding:12px;background:#f5f6ff;color:#222'},[
      h('label',['模型场景 ',h('select',{
        'aria-label':'模型场景',
        onChange:async(e:Event)=>{outcome.value=JSON.stringify((await api.post('/__fixture/mode',{mode:(e.target as HTMLSelectElement).value})).data)}
      },['documents','answer','failure','slow'].map(value=>h('option',{value},value)))]),
      h('button',{onClick:async()=>{outcome.value=JSON.stringify((await api.post('/__fixture/process',{})).data)}},'执行一个后台索引任务'),
      h('output',{'aria-label':'测试执行结果'},outcome.value)
    ]),
    ...harnessErrors.value.map(message=>h('p',{role:'alert'},message)),
    h(Measurements),h(RouterView,{key:version.value}),h(GlobalAiHost)
  ])
});
const fixture=createApp(Fixture).use(router).use(ElementPlus);
fixture.config.errorHandler=error=>{harnessErrors.value.push(String(error))};
fixture.mount('#app');
