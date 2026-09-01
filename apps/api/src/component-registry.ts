export const COMPONENT_SCHEMA_VERSION = 1;

export type ComponentControl = 'text' | 'textarea' | 'url' | 'number' | 'boolean' | 'select' | 'url-list' | 'json';
export type ComponentField = {
  key: string;
  label: string;
  control: ComponentControl;
  options?: string[];
  min?: number;
  max?: number;
};
export type ComponentDefinition = {
  type: string;
  label: string;
  group: string;
  container: boolean;
  dataDependency: 'NONE' | 'CMS' | 'CATALOG' | 'AI';
  defaults: Record<string, unknown>;
  fields: ComponentField[];
};

const field = (key: string, label: string, control: ComponentControl, options?: Partial<ComponentField>): ComponentField => ({
  key, label, control, ...options
});

export const COMPONENT_REGISTRY: ComponentDefinition[] = [
  {
    type: 'grid', label: '1–4 列响应式网格', group: '基础排版', container: true, dataDependency: 'NONE',
    defaults: { columns: 2, gap: 20, stackAt: 'tablet' },
    fields: [field('columns', '列数', 'number', { min: 1, max: 4 }), field('gap', '间距', 'number', { min: 0, max: 80 }), field('stackAt', '堆叠断点', 'select', { options: ['never', 'tablet', 'mobile'] })]
  },
  {
    type: 'hero', label: 'Hero 图文巨幕', group: '基础排版', container: false, dataDependency: 'NONE',
    defaults: { eyebrow: '', title: '在此输入标题', text: '在此输入说明', imageUrl: '', align: 'center' },
    fields: [field('eyebrow', '眉题', 'text'), field('title', '标题', 'text'), field('text', '正文', 'textarea'), field('imageUrl', '图片 URL', 'url'), field('align', '对齐', 'select', { options: ['left', 'center', 'right'] }), field('buttons', '按钮 JSON', 'json')]
  },
  {
    type: 'carousel', label: '轮播图', group: '基础排版', container: false, dataDependency: 'NONE',
    defaults: { title: '轮播图', text: '', slides: [], autoplay: true, intervalMs: 5000, showArrows: true, showDots: true },
    fields: [field('title', '标题', 'text'), field('text', '说明', 'textarea'), field('slides', '轮播项 JSON', 'json'), field('images', '兼容图片 URL', 'url-list'), field('autoplay', '自动播放', 'boolean'), field('intervalMs', '间隔毫秒', 'number', { min: 2000, max: 30000 }), field('showArrows', '显示切换按钮', 'boolean'), field('showDots', '显示指示点', 'boolean')]
  },
  {
    type: 'button', label: '安全外跳按钮', group: '基础排版', container: false, dataDependency: 'NONE',
    defaults: { text: '了解更多', url: '#', openInNewWindow: true, variant: 'primary', align: 'center' },
    fields: [field('text', '按钮文字', 'text'), field('url', '目标 URL', 'url'), field('openInNewWindow', '新窗口', 'boolean'), field('variant', '样式', 'select', { options: ['primary', 'secondary', 'ghost'] }), field('align', '对齐', 'select', { options: ['left', 'center', 'right'] })]
  },
  {
    type: 'header', label: '全局导航栏', group: '站点结构', container: false, dataDependency: 'NONE',
    defaults: { logoText: 'APPGOG', logoUrl: '', navItems: [], ctaText: '购买套餐', url: '#', sticky: true, themeToggle: true },
    fields: [field('logoText', 'Logo 文字', 'text'), field('logoUrl', 'Logo URL', 'url'), field('navItems', '导航项 JSON', 'json'), field('ctaText', '行动按钮', 'text'), field('url', '行动链接', 'url'), field('sticky', '吸顶', 'boolean'), field('themeToggle', '主题切换', 'boolean')]
  },
  {
    type: 'footer', label: '全局页脚', group: '站点结构', container: false, dataDependency: 'NONE',
    defaults: { text: '© 2026 APPGOG', columns: [], socialLinks: [], legalText: '' },
    fields: [field('text', '版权文字', 'text'), field('columns', '分栏链接 JSON', 'json'), field('socialLinks', '社交链接 JSON', 'json'), field('legalText', '备案/法务文字', 'textarea')]
  },
  {
    type: 'breadcrumb', label: '面包屑/返回', group: '站点结构', container: false, dataDependency: 'NONE',
    defaults: { homeLabel: '首页', homeUrl: '/', items: [], showBack: true },
    fields: [field('homeLabel', '首页文字', 'text'), field('homeUrl', '首页路径', 'url'), field('items', '路径项 JSON', 'json'), field('showBack', '显示返回', 'boolean')]
  },
  {
    type: 'products', label: '商品网格', group: '数据组件', container: false, dataDependency: 'CATALOG',
    defaults: { title: '增值商品', categoryId: '', sort: 'salesDesc', limit: 8, columns: 4, cardStyle: 'glass', hoverEffect: 'lift' },
    fields: [field('title', '标题', 'text'), field('categoryId', '分类 ID', 'text'), field('sort', '排序', 'select', { options: ['salesDesc', 'newest', 'priceAsc', 'priceDesc'] }), field('limit', '数量', 'number', { min: 1, max: 50 }), field('columns', '列数', 'number', { min: 1, max: 4 }), field('cardStyle', '卡片样式', 'select', { options: ['glass', 'solid'] }), field('hoverEffect', '悬停效果', 'select', { options: ['lift', 'none'] })]
  },
  {
    type: 'cart', label: '独立购物车挂件', group: '数据组件', container: false, dataDependency: 'CATALOG',
    defaults: { title: '购物车', position: 'bottom-right' },
    fields: [field('title', '标题', 'text'), field('position', '位置', 'select', { options: ['bottom-right', 'bottom-left', 'inline'] })]
  },
  {
    type: 'categories', label: '分类导航树', group: '数据组件', container: false, dataDependency: 'CMS',
    defaults: { title: '内容分类', scope: 'CONTENT' },
    fields: [field('title', '标题', 'text'), field('scope', '范围', 'select', { options: ['CONTENT', 'PRODUCT'] })]
  },
  {
    type: 'contents', label: '图文/视频教程列表', group: '数据组件', container: false, dataDependency: 'CMS',
    defaults: { title: '教程', categoryId: '', contentType: 'ARTICLE', sort: 'newest', limit: 8, columns: 1 },
    fields: [field('title', '标题', 'text'), field('categoryId', '分类 ID', 'text'), field('contentType', '内容类型', 'select', { options: ['ARTICLE', 'VIDEO'] }), field('sort', '排序', 'select', { options: ['newest', 'oldest', 'viewsDesc'] }), field('limit', '数量', 'number', { min: 1, max: 50 }), field('columns', '列数', 'number', { min: 1, max: 4 })]
  },
  {
    type: 'faq', label: 'FAQ 折叠面板', group: '数据组件', container: false, dataDependency: 'CMS',
    defaults: { title: '常见问题', categoryId: '', limit: 10 },
    fields: [field('title', '标题', 'text'), field('categoryId', '分类 ID', 'text'), field('limit', '数量', 'number', { min: 1, max: 50 })]
  },
  {
    type: 'ai', label: 'AI 语义搜索', group: '数据组件', container: false, dataDependency: 'AI',
    defaults: { title: '遇到问题？问问 AI 助手', placeholder: '描述你的问题' },
    fields: [field('title', '标题', 'text'), field('placeholder', '输入提示', 'text')]
  },
  {
    type: 'sale', label: '限时促销横幅', group: '营销与动效', container: false, dataDependency: 'NONE',
    defaults: { title: '限时优惠', text: '', url: '#' },
    fields: [field('title', '标题', 'text'), field('text', '说明', 'textarea'), field('url', '目标 URL', 'url')]
  },
  {
    type: 'popup', label: '全屏弹窗广告', group: '营销与动效', container: false, dataDependency: 'NONE',
    defaults: { title: '活动', text: '', url: '#', buttonText: '查看详情', frequencyHours: 24, startAt: '', endAt: '', pageRules: '*' },
    fields: [field('title', '标题', 'text'), field('text', '正文', 'textarea'), field('url', '目标 URL', 'url'), field('buttonText', '按钮文字', 'text'), field('frequencyHours', '弹出间隔小时', 'number', { min: 1, max: 8760 }), field('startAt', '开始时间（ISO）', 'text'), field('endAt', '结束时间（ISO）', 'text'), field('pageRules', '页面规则（逗号分隔）', 'text')]
  },
  {
    type: 'countdown', label: '促销倒计时', group: '营销与动效', container: false, dataDependency: 'NONE',
    defaults: { title: '倒计时', endAt: '', expiredText: '活动已结束', timezone: 'Asia/Shanghai', expiredBehavior: 'show-text', expiredUrl: '' },
    fields: [field('title', '标题', 'text'), field('endAt', '结束时间', 'text'), field('expiredText', '过期文字', 'text'), field('timezone', 'IANA 时区', 'text'), field('expiredBehavior', '过期行为', 'select', { options: ['show-text', 'hide', 'link'] }), field('expiredUrl', '过期跳转 URL', 'url')]
  },
  {
    type: 'particles', label: '粒子背景', group: '营销与动效', container: false, dataDependency: 'NONE',
    defaults: { enabled: true, density: 24, disabledOnMobile: true },
    fields: [field('enabled', '启用', 'boolean'), field('density', '粒子数', 'number', { min: 0, max: 80 }), field('disabledOnMobile', '移动端禁用', 'boolean')]
  },
  {
    type: 'globe', label: '3D 地球', group: '营销与动效', container: false, dataDependency: 'NONE',
    defaults: { title: '全球连接', text: '', quality: 'auto', disabledOnMobile: true },
    fields: [field('title', '标题', 'text'), field('text', '说明', 'textarea'), field('quality', '质量', 'select', { options: ['auto', 'low', 'high'] }), field('disabledOnMobile', '移动端禁用', 'boolean')]
  }
];

// Optional binding keeps the same registered marketing components and JSON tree.
COMPONENT_REGISTRY.find(item => item.type === 'hero')!.fields.push(
  field('headingLevel', '标题层级', 'select', { options: ['h1', 'h2', 'h3'] }),
  field('compact', '紧凑图文卡', 'boolean'),
  field('publicationRequirement', '待核实事项（完成后清空，否则禁止发布）', 'textarea')
);
COMPONENT_REGISTRY.find(item => item.type === 'breadcrumb')!.fields.push(field('backUrl', '返回上级路径（优先于浏览器历史）', 'url'));
for (const definition of COMPONENT_REGISTRY.filter(item => ['sale', 'popup', 'countdown'].includes(item.type))) {
  definition.fields.unshift(field('campaignId', '后台营销活动 ID（绑定后使用活动配置）', 'text'));
  for (const extra of [field('startAt', '开始时间', 'text'), field('endAt', '结束时间', 'text'), field('timezone', 'IANA 时区', 'text'), field('pageRules', '页面规则（逗号分隔）', 'text')]) {
    if (!definition.fields.some(item => item.key === extra.key)) definition.fields.push(extra);
  }
}
export const COMPONENT_TYPES = COMPONENT_REGISTRY.map(item => item.type);
const definitions = new Map(COMPONENT_REGISTRY.map(item => [item.type, item]));
const compatibilityFields: ComponentField[] = [
  field('title', '标题', 'text'), field('text', '文字', 'textarea'), field('url', 'URL', 'url'),
  field('columns', '列数', 'number', { min: 1, max: 4 }), field('limit', '数量', 'number', { min: 1, max: 50 }),
  field('sort', '排序', 'text'), field('cardStyle', '卡片样式', 'text'), field('hoverEffect', '悬停效果', 'text'),
  field('frequencyHours', '间隔', 'number', { min: 1, max: 8760 }), field('images', '图片', 'url-list'),
  field('categoryId', '分类', 'text'), field('endAt', '时间', 'text'), field('contentType', '内容类型', 'text')
];

export class ComponentPropsValidationError extends Error {}
const fail = (message: string): never => { throw new ComponentPropsValidationError(message); };

function safeUrl(value: string, label: string) {
  if (/[\\\u0000-\u0020]/.test(value)) fail(`${label}不能包含反斜杠、空白或控制字符`);
  if (value === '' || value.startsWith('#')) return;
  if (value.startsWith('/')) {
    if (value.startsWith('//')) fail(`${label}不能使用协议相对 URL`);
    return;
  }
  let url: URL;
  try { url = new URL(value); } catch { return fail(`${label}必须是安全 URL`); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    fail(`${label}必须是无身份信息和参数的 HTTP/HTTPS URL`);
  }
}

function objectArray(value: unknown, key: string) {
  if (!Array.isArray(value) || value.length > 30) fail(`${key}必须是最多 30 项的数组`);
  const items = value as unknown[];
  const allowed = key === 'columns' ? ['title', 'links'] : key === 'slides'
    ? ['imageUrl', 'title', 'text', 'url', 'alt'] : ['label', 'url', 'text', 'variant'];
  items.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail(`${key}[${index}]必须是对象`);
    const record = item as Record<string, unknown>;
    if (Object.keys(record).some(name => !allowed.includes(name))) fail(`${key}[${index}]包含未声明字段`);
    for (const [name, child] of Object.entries(record)) {
      if (name === 'links') objectArray(child, 'links');
      else if (typeof child !== 'string' || child.length > 2000) fail(`${key}[${index}].${name}必须是安全文本`);
      if ((name === 'url' || name === 'imageUrl') && typeof child === 'string') safeUrl(child, `${key}[${index}].${name}`);
    }
  });
}

function checkField(field: ComponentField, value: unknown) {
  if (field.control === 'boolean') {
    if (typeof value !== 'boolean') fail(`${field.key}必须是布尔值`);
    return;
  }
  if (field.control === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < (field.min ?? -Infinity) || value > (field.max ?? Infinity)) {
      fail(`${field.key}数值超出允许范围`);
    }
    return;
  }
  if (field.control === 'json') {
    objectArray(value, field.key);
    return;
  }
  if (field.control === 'url-list') {
    const values = Array.isArray(value) ? value : String(value).split(/\r?\n|,/);
    values.filter(Boolean).forEach((item, index) => {
      if (typeof item !== 'string') fail(`${field.key}[${index}]必须是 URL`);
      safeUrl(item.trim(), `${field.key}[${index}]`);
    });
    return;
  }
  if (typeof value !== 'string' || value.length > 10_000) fail(`${field.key}必须是安全文本`);
  const text = value as string;
  if (field.control === 'url') safeUrl(text.trim(), field.key);
  if (field.control === 'select' && field.options && !field.options.includes(text)) fail(`${field.key}不在允许选项内`);
}

export function validateComponentProps(type: string, props: Record<string, unknown>) {
  const definition = definitions.get(type);
  if (!definition) fail(`未注册组件：${type}`);
  const resolved = definition as ComponentDefinition;
  const fields = new Map<string, ComponentField>([...compatibilityFields, ...resolved.fields].map(item => [item.key, item]));
  for (const [key, value] of Object.entries(props)) {
    const field = fields.get(key);
    if (!field) fail(`${type}.props.${key} 未在 Schema 中声明`);
    checkField(field as ComponentField, value);
  }
}
