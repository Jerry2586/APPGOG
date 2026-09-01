import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import '../src/style.css';import '../src/effects.css';import '../src/media.css';import '../src/cms.css';import '../src/catalog.css';import '../src/ai.css';import '../src/operations.css';
import App from '../src/App.vue';
import { router } from '../src/router';
import { api, loginAdmin } from '../src/api';
if(location.pathname.startsWith('/admin'))await loginAdmin({email:`${new URLSearchParams(location.search).get('fixtureRole')||'SUPER_ADMIN'}@example.invalid`,password:'isolated-fixture-not-a-real-password'});
const initialId=String(Date.now());
createApp({setup:()=>()=>h('div',[
  h('div',{style:'padding:10px;background:#fff;color:#222;display:flex;gap:12px;flex-wrap:wrap;position:relative;z-index:2000'},[
    h('strong','仅本机隔离测试'),h('span',{id:'fixture-document'},`文档 ${initialId}`),
    h('a',{href:'/'},'公开首页'),h('a',{href:'/admin'},'超级管理员'),h('a',{href:'/admin?fixtureRole=VIEWER'},'只读管理员'),
    h('button',{onClick:()=>router.push(location.pathname==='/second'?'/':'/second')},'SPA 切换公开页'),
    h('button',{onClick:()=>{localStorage.removeItem('appgog.popup.campaign.campaign-popup');location.href='/'}},'重置测试弹窗频率'),
    h('button',{onClick:async()=>{await api.post('/__fixture/expire');location.href='/second'}},'倒计时五秒后结束'),
    h('button',{onClick:async(event:Event)=>{await api.post('/__fixture/disable-probes');(event.target as HTMLButtonElement).textContent='已停用，等待公开配置刷新'}},'停用测试插件'),
    h('output',{id:'fixture-HEAD'},'HEAD 尚未执行'),h('output',{id:'fixture-BODY_END'},'BODY_END 尚未执行'),h('output',{id:'fixture-vendor'},'本地资源尚未加载')
  ]),h(App)
])}).use(createPinia()).use(router).use(ElementPlus).mount('#app');
