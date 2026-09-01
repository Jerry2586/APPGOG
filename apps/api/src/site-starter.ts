import type { PageBlock, PageLayout } from '@appgog/contracts';
import { COMPONENT_REGISTRY } from './component-registry';
import { validatePageLayout } from './page-layout';

export const SITE_STARTER_VERSION = 1;
export type SiteStarterPage = {
  requirement: string; name: string; slug: string; seoTitle: string; seoDescription: string;
  layout: PageLayout;
};

/** Authoring recipes only. Public requests always read published database versions. */
export function siteStarterPages(): SiteStarterPage[] {
  let sequence = 0;
  const block = (type: PageBlock['type'], props: Record<string, unknown> = {}, children: PageBlock[] = []): PageBlock => ({
    id: `site-${++sequence}`, type,
    props: { ...structuredClone(COMPONENT_REGISTRY.find(item => item.type === type)!.defaults), ...props }, children
  });
  const link = (label: string, url: string) => ({ label, url });
  const text = (title: string, body: string, requirement = '', buttons: ReturnType<typeof link>[] = []) => block('hero', {
    title, text: body, align: 'left', headingLevel: 'h2', compact: true, publicationRequirement: requirement, buttons
  });
  const grid = (...children: PageBlock[]) => block('grid', { columns: Math.min(3, children.length), stackAt: 'tablet' }, children);
  const review = (title: string, requirement: string) => text(title, '资料确认后在此填写正式内容。', requirement);
  const nav = [link('首页', '/'), link('全球节点', '/nodes'), link('客户端下载', '/downloads'), link('帮助中心', '/help'), link('独立商城', '/shop'), link('关于 APPGOG', '/about'), link('登入', '/login'), link('注册', '/register')];
  const footer = [
    { title: '了解 APPGOG', links: [link('关于我们', '/company'), link('招纳贤士', '/careers'), link('媒体报道', '/press')] },
    { title: '生态与合作', links: [link('合作伙伴', '/partners'), link('联盟营销', '/affiliate'), link('企业级定制', '/enterprise')] },
    { title: '服务与支持', links: [link('隐私政策', '/privacy'), link('无日志声明', '/no-logs'), link('24/7 VIP 客服', '/support')] }
  ];
  const page = (requirement: string, slug: string, name: string, introduction: string, body: PageBlock[], parent?: ReturnType<typeof link>): SiteStarterPage => {
    const layout = [block('header', { navItems: nav, ctaText: '购买套餐', url: '/purchase' }),
      ...(slug === 'home' ? [] : [block('breadcrumb', { items: [...(parent ? [parent] : []), { label: name }], showBack: !!parent, backUrl: parent?.url || '/' })]),
      block('hero', { eyebrow: `APPGOG / ${slug.toUpperCase()}`, title: name, text: introduction, headingLevel: 'h1', align: 'left', publicationRequirement: '发布前逐项核对本页文案、链接、素材授权与资料真实性，再清除此提示。' }),
      ...body,
      block('footer', { columns: footer, text: '© APPGOG', legalText: '', socialLinks: [] })];
    return { requirement, name, slug, seoTitle: `${name} · APPGOG`, seoDescription: introduction, layout: validatePageLayout(layout) };
  };
  const gateway = (requirement: string, slug: string, name: string, target: string) => page(requirement, slug, name,
    '此入口只通过普通链接前往独立的 Xboard 系统；APPGOG 不接收账号、密码或业务数据。', [
      text(`前往${target}`, '请在 Xboard 页面继续操作。', `填写已确认的 Xboard ${target} HTTP/HTTPS 地址到下方按钮；不得附带查询参数、片段或身份信息。`, [{ label: `前往${target}`, url: '' }]),
      text('账号与业务边界', 'APPGOG 官网、知识库与独立商城可直接浏览，不同步 Xboard 登录状态。', '', [link('帮助中心', '/help'), link('隐私政策', '/privacy')])
    ]);
  return [
    page('SITE-001', 'home', '连接世界，从 APPGOG 开始', '了解服务、获取客户端与使用指南，在同一门户找到清晰的下一步。', [
      text('开始使用', '套餐购买与账号操作在独立 Xboard 面板完成。', '', [link('查看套餐', '/purchase'), link('创建账号', '/register'), link('进入面板', '/dashboard')]),
      block('ai', { title: '首页 AI 助手', placeholder: '询问产品介绍、客户端配置或文档问题' }),
      grid(text('跨平台入口', '按设备查找下载入口和教程。', '', [link('客户端下载', '/downloads')]), text('知识与支持', '检索文档、视频教程及常见问题。', '', [link('帮助中心', '/help')]), text('独立增值服务', '非流量商品单独展示，购买通过外部服务完成。', '', [link('浏览独立商城', '/shop')])),
      review('产品优势', '补充经确认的产品优势和适用场景；不要使用未经验证的速度、规模或 SLA 数字。'),
      block('globe', { title: '全球连接', text: '视觉示意，不代表实时网络数据。', disabledOnMobile: true })
    ]),
    page('SITE-002', 'nodes', '全球节点', '按已确认的公开资料了解网络覆盖；这里不读取实时节点或用户数据。', [
      block('globe', { title: '网络覆盖示意', text: '装饰效果，不表示实时在线状态。' }),
      grid(text('节点资料卡', '请配置地区、节点名称、公开介绍、资料日期和详情链接。', '取得可公开的真实节点资料后替换本卡，可在网格中继续添加图文卡。', [link('查看节点详情', '/nodes/detail')])),
      review('数据来源与更新时间', '填写公开资料来源、核验日期及更新方式；不能展示虚构延迟、负载或在线人数。')
    ]),
    page('SITE-003', 'nodes/detail', '节点详情', '展示单个节点经确认的公开介绍。', [
      grid(review('位置与接入介绍', '填写已确认的国家、城市、节点名称和可公开的接入说明。'), review('网络资料', '只填写获准公开的线路、能力、适用场景及数据来源；不填写订阅凭证。')),
      review('资料核验', '填写资料来源、核验日期；若有性能图表，必须说明测试条件和非实时性质。'),
      block('button', { text: '返回节点列表', url: '/nodes', openInNewWindow: false })
    ], link('全球节点', '/nodes')),
    page('SITE-004', 'downloads', '客户端下载', '选择设备平台，下载与配置说明由运营人员确认后发布。', [
      ...[ ['Windows', 'macOS', 'Linux'], ['iOS', 'Android'] ].map(platforms => grid(...platforms.map(platform =>
        text(platform, '版本、系统要求、发布时间与安装说明待填写。', `确认 ${platform} 客户端名称、授权、版本及正式下载地址；将按钮链接填入后再发布。`, [{ label: `${platform} 下载`, url: '' }, link('查看安装教程', '/help')])
      ))), text('安装与订阅', '在帮助中心查阅安装说明。账号与订阅操作请前往 Xboard 面板。', '', [link('帮助中心', '/help'), link('进入面板', '/dashboard')])
    ]),
    page('SITE-005', 'help', '帮助中心', '搜索使用文档、常见问题与视频教程，或向 AI 助手提问。', [
      block('ai', { title: '知识库 AI 助手' }), block('categories'), block('contents', { title: '文档与指南', contentType: 'ARTICLE', columns: 2 }),
      block('faq'), block('contents', { title: '视频教程', contentType: 'VIDEO', columns: 2 }),
      text('仍需帮助？', '账号、订单或订阅问题请在 Xboard 工单页面提交。', '', [link('提交工单', '/ticket'), link('联系支持', '/support')])
    ]),
    page('SITE-006', 'about', '关于 APPGOG', '从新加坡出发，连接品牌、服务与用户。', [
      text('新加坡总部', 'APPGOG 总部位于新加坡。', '总部定位来自需求确认；正式主体名称、注册地址与公开联系资料仍需核对。'),
      grid(review('愿景与价值观', '确认品牌愿景及价值观，不虚构安全认证与服务能力。'), review('服务与布局', '确认业务范围与区域信息，不虚构海外机构、机房和网络规模。')),
      text('进一步了解', '认识团队或与我们合作。', '', [link('关于我们', '/company'), link('加入团队', '/careers'), link('企业级定制', '/enterprise')])
    ]),
    gateway('SITE-007', 'login', '登入', '登录'), gateway('SITE-007', 'register', '注册', '注册'),
    page('SITE-008', 'company', '关于我们', '了解 APPGOG 的品牌故事与团队。', [review('品牌故事', '填写已确认的创立背景、时间线与品牌理念。'), review('公司资料', '填写正式公司名称、注册资料、地址与经批准的联系方式。')]),
    page('SITE-009', 'careers', '招纳贤士', '了解职位、工作方式与申请流程。', [
      grid(review('开放职位', '填写真实职位、职责、要求、地点和招聘有效期；无职位时写明暂无开放职位。'), review('工作与申请流程', '填写真实工作方式及简历处理流程。')),
      text('联系我们', '请填写招聘邮箱与 Telegram 入口。', '确认招聘邮箱和 Telegram 官方地址；邮箱可填写在正文，Telegram 使用 HTTPS 链接。', [{ label: 'Telegram 招聘咨询', url: '' }])
    ]),
    page('SITE-010', 'press', '媒体报道', '查阅经核验的 APPGOG 媒体报道。', [text('报道资料', '确认报道后填写标题、媒体、日期、摘要与原文链接。', '需提供真实报道原文与转载授权；没有报道时明确填写暂无已公开报道，不能使用示例媒体背书。', [{ label: '查看报道原文', url: '' }])]),
    page('SITE-011', 'partners', '合作伙伴', '了解经授权公开的合作关系与设施资料。', [
      grid(text('合作伙伴', '填写合作名称、授权 Logo、合作范围与来源。', '确认公开授权，不使用未经授权的厂商品牌。', [{ label: '合作方官网', url: '' }]), review('自有机房与设施', '需提供真实产权或运营关系、获准公开的设施资料与图片；没有自有设施时应如实说明。'))
    ]),
    page('SITE-012', 'affiliate', '联盟营销', '了解合作介绍，并前往独立渠道申请。', [review('合作规则', '确认适用条件、推广规则及规则来源；不得虚构佣金比例。'), text('申请合作', '申请、邀请及佣金管理由独立平台处理。', '填写 Xboard 联盟营销页或正式外部申请地址。', [{ label: '前往申请', url: '' }])]),
    page('SITE-013', 'enterprise', '企业级定制', '讨论业务需求、部署场景与服务范围。', [
      grid(review('服务范围', '确认可交付的定制服务、地区和限制。'), review('合作流程', '确认咨询、评估与交付流程；服务承诺及 SLA 必须有依据。')),
      text('联系商务', '填写正式商务邮箱与外部联系入口。', '确认商务邮箱和 HTTPS 联系链接。', [{ label: '联系商务', url: '' }])
    ]),
    page('SITE-014', 'privacy', '隐私政策', '隐私政策正式文本须经责任主体与法务确认。', [
      review('适用范围与责任主体', '法务确认正式主体、适用范围、生效日期、联系方式和版本。'),
      review('数据处理说明', '按实际部署披露访问日志、管理员会话、安全审计、AI 输入与服务商、第三方插件、浏览器存储、保存期限及权利请求渠道。'),
      review('当地法律与使用责任', '由法务确认用户遵守所在及相关地区法律的义务、禁止用途、双方责任及法定权利；不使用一概免责的草拟结论。'),
      text('独立系统边界', 'APPGOG 不访问 Xboard 数据库、账号或业务 API。前往外部平台后，应阅读该平台适用的隐私与服务规则。')
    ]),
    page('SITE-015', 'no-logs', '无日志声明', '按可验证的技术事实说明日志范围，不作未经确认的保证。', [
      review('声明范围与技术事实', '确认网络服务与 APPGOG 门户各自的数据处理范围；不能把门户访问、安全审计、AI 数据处理描述为绝对不留存。'),
      review('证据与更新记录', '仅公开已确认的机制、证据、审计结论及日期；没有审计或无手令证明时不得宣称已通过或从未收到。'),
      review('法律与责任边界', '法务确认当地法律遵守、声明限制、生效日期及用户联系渠道。')
    ]),
    page('SITE-016', 'support', '24/7 VIP 客服', '通过已确认的支持渠道获取帮助。', [
      grid(text('支持邮箱', '正式支持邮箱待填写。', '确认可用邮箱、服务时间与响应规则；标题中的 24/7 能力也须核实。'), text('Telegram', '官方客服入口待填写。', '确认真实 Telegram 客服或群组地址。', [{ label: '联系 Telegram 客服', url: '' }]), text('Xboard 工单', '账号与业务问题在 Xboard 页面提交，APPGOG 不接收工单数据。', '', [link('前往工单', '/ticket')])),
      review('支持等级与服务时间', '填写真实支持等级、开放时间及处理流程，不编造在线状态、响应时间或 SLA。'),
      text('先试试自助帮助', '查阅配置文档、FAQ 与视频教程。', '', [link('帮助中心', '/help')]), block('ai', { title: '支持知识助手' })
    ]),
    page('SHOP-001–008', 'shop', '独立增值商城', '浏览非流量商品；实际购买在各商品的独立外部链接完成。', [block('categories', { scope: 'PRODUCT', title: '商品分类' }), block('products', { title: '独立增值商品', columns: 3 }), block('cart', { position: 'inline' })]),
    gateway('BND-004', 'purchase', '购买套餐', '套餐购买'), gateway('BND-003', 'dashboard', '进入面板', '用户面板'), gateway('AI-009', 'ticket', '提交工单', '工单')
  ];
}

export function publicationRequirements(layout: PageLayout): { blockId: string; message: string }[] {
  return layout.flatMap(block => [
    ...(typeof block.props.publicationRequirement === 'string' && block.props.publicationRequirement.trim()
      ? [{ blockId: block.id, message: block.props.publicationRequirement.trim() }] : []),
    ...publicationRequirements(block.children)
  ]);
}
