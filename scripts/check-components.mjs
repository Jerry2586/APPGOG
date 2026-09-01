import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const server = read('apps/api/src/component-registry.ts');
const controller = read('apps/api/src/component.controller.ts');
const layout = read('apps/api/src/page-layout.ts');
const web = read('apps/web/src/component-registry.ts');
const renderer = read('apps/web/src/components/BlockRenderer.vue');
const editor = read('apps/web/src/components/PageEditor.vue');
const carousel = read('apps/web/src/components/blocks/CarouselBlock.vue');
const effects = read('apps/web/src/effects.css');
const aiHost = read('apps/web/src/components/GlobalAiHost.vue');
const app = read('apps/web/src/App.vue');
const expected = ['grid', 'hero', 'carousel', 'button', 'header', 'footer', 'breadcrumb', 'products', 'cart', 'categories', 'contents', 'faq', 'ai', 'sale', 'popup', 'countdown', 'particles', 'globe'];
const failures = [];
const required = (text, pattern, message) => { if (!pattern.test(text)) failures.push(message); };

const serverTypes = [...server.matchAll(/\btype:\s*'([^']+)'\s*,\s*label:/g)].map(match => match[1]);
const webMap = web.match(/componentRenderers[\s\S]*?=\s*\{([\s\S]*?)\};/)?.[1] || '';
const webTypes = expected.filter(type => new RegExp(`\\b${type}:`).test(webMap));
if (serverTypes.length !== 18 || new Set(serverTypes).size !== 18) failures.push('服务端组件清单不是 18 个唯一组件');
if (expected.some(type => !serverTypes.includes(type))) failures.push('服务端组件清单缺少规定组件');
if (expected.some(type => !webTypes.includes(type))) failures.push('前端渲染器清单与服务端不一致');

required(server, /COMPONENT_SCHEMA_VERSION\s*=\s*1/, '组件 Props Schema 未版本化');
required(server, /validateComponentProps/, '组件 Props 缺少服务端校验');
required(layout, /COMPONENT_TYPES[\s\S]*?validateComponentProps/, '页面树未接入组件注册表校验');
required(controller, /@Controller\('admin\/components'\)[\s\S]*?@UseGuards\(AdminGuard, RolesGuard\)/, '组件清单接口缺少后台鉴权');
required(editor, /\/admin\/components[\s\S]*?selectedDefinition\?\.fields/, '编辑器未按服务端清单动态生成属性控件');
required(editor, /:force-fallback="true" :fallback-on-body="true"/, '页面拖拽缺少指针兼容模式');
required(read('apps/web/src/components/EditorBlock.vue'), /:force-fallback="true" :fallback-on-body="true"/, '嵌套拖拽与外层兼容模式不一致');
required(renderer, /componentRenderers[\s\S]*?<component\s+:is="renderer"/, '公开页与预览未共用动态渲染注册表');
required(carousel, /aria-roledescription="carousel"[\s\S]*?touchstart[\s\S]*?touchend/, '轮播缺少无障碍语义或触摸切换');
required(carousel, /mouseenter[\s\S]*?focusin/, '轮播自动播放缺少悬停/聚焦暂停');
required(effects, /prefers-reduced-motion:reduce/, '动效缺少减少动画降级');
required(app, /GlobalAiHost/, '全局 AI 助手未挂载到全站入口');
required(aiHost, /data\.enabled===true&&data\.globalAssistantEnabled===true[\s\S]*?GlobalAssistant\s+v-if="isPublic&&enabled"/, '全局 AI 助手未受公开页面范围及配置开关控制');

if (failures.length) {
  console.error('APPGOG 组件系统检查失败：\n' + failures.map(item => `- ${item}`).join('\n'));
  process.exit(1);
}
console.log('APPGOG 组件系统检查通过：18 个注册组件、版本化 Props、动态编辑器、共享渲染器和降级边界完整。');
