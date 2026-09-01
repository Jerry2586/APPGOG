import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import '../src/style.css'; import '../src/effects.css'; import '../src/media.css'; import '../src/cms.css'; import '../src/catalog.css'; import '../src/ai.css'; import '../src/operations.css'; import '../src/site.css';
import App from '../src/App.vue';
import { router } from '../src/router';
import { loginAdmin } from '../src/api';
const administration = location.pathname.startsWith('/admin');
if (administration) await loginAdmin({ email: `${new URLSearchParams(location.search).get('fixtureRole') || 'ADMIN'}@example.invalid`, password: 'isolated-fixture-not-a-real-password' });
const app=createApp({ setup: () => () => h('div', [h('aside', { style: 'padding:10px;background:#fff4cc;color:#483400;font-size:13px;position:relative;z-index:2000' }, [
  h('strong', '第十二阶段本机验收 · 所有内容仅为测试草稿，不代表正式资料或可用服务。 '),
  h('a', { href: '/' }, '测试首页'), ' · ', h('a', { href: '/admin' }, '测试后台'), ' · ', h('a', { href: '/admin?fixtureRole=VIEWER' }, '只读后台'),
  ' · ', h('button', { onClick: () => router.push('/nodes/detail') }, 'SPA 节点详情')
]), h(App)]) }).use(createPinia()).use(router);
if(administration){const [{default:ElementPlus}]=await Promise.all([import('element-plus'),import('element-plus/dist/index.css')]);app.use(ElementPlus)}
app.mount('#app');
