import { BadRequestException } from '@nestjs/common';

export const OPERATIONS = ['theme', 'themeSchedule', 'marketingCampaign', 'pluginSnippet'] as const;
export type OperationKind = typeof OPERATIONS[number];
export const THEME_COLORS = ['primary', 'accent', 'bg', 'surface', 'text', 'muted'] as const;
const bad = (message: string): never => { throw new BadRequestException(message); };
export function object(value: unknown, keys: readonly string[], label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return bad(`${label}必须是对象`);
  if (Object.keys(value).some(key => !keys.includes(key))) return bad(`${label}包含未声明字段`);
  return value as Record<string, any>;
}
function text(value: unknown, label: string, max = 2000, empty = false): string {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return bad(`${label}不是有效文本`);
  return value.trim();
}
function bool(value: unknown, label: string): boolean { if (typeof value !== 'boolean') return bad(`${label}必须是布尔值`); return value; }
function integer(value: unknown, label: string, min: number, max: number): number { if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) return bad(`${label}超出范围`); return Number(value); }
function choice<T extends string>(value: unknown, allowed: readonly T[], label: string): T { if (!allowed.includes(value as T)) return bad(`${label}不在允许选项内`); return value as T; }
export function timeZone(value: unknown) {
  const zone = text(value, '时区', 100);
  try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(); } catch { return bad('无效 IANA 时区'); }
  return zone;
}
export function instant(value: unknown, nullable = false): Date | null {
  if (nullable && (value === null || value === '')) return null;
  const raw = text(value, '时间', 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) return bad('时间必须包含明确时区偏移或 Z');
  const date = new Date(raw);
  const day = Number(raw.slice(8, 10)), month = Number(raw.slice(5, 7)), year = Number(raw.slice(0, 4));
  if (!Number.isFinite(date.getTime()) || year < 2000 || year > 2200 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || Number(raw.slice(11, 13)) > 23) return bad('时间不存在或超出 2000–2200 范围');
  return date;
}
export function pageRules(value: unknown) {
  const rules = text(value, '页面规则', 2000).split(',').map(item => item.trim());
  if (rules.length > 30 || rules.some(rule => rule !== '*' && !/^\/(?:[A-Za-z0-9_/-]*)(?:\*)?$/.test(rule))) return bad('页面规则使用逗号分隔的 /路径、/前缀* 或 *');
  return [...new Set(rules)].join(',');
}
export function marketingUrl(value: unknown) {
  const raw = text(value, '跳转地址', 2000, true);
  if (!raw) return '';
  if (/[\s\\\u0000-\u001f]/.test(raw)) return bad('跳转地址包含危险字符');
  if (/^\/(?!\/)[A-Za-z0-9/_-]*$/.test(raw)) return raw;
  try { const url = new URL(raw); if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash) return url.href; } catch { /* rejected below */ }
  return bad('跳转地址只允许站内路径或无身份、参数、片段的 HTTP/HTTPS URL');
}
export function themeVariables(value: unknown) {
  const data = object(value, [...THEME_COLORS, 'radius', 'shadow'], 'CSS 变量');
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value !== 'string') return bad('CSS 变量必须为字符串');
    if ((THEME_COLORS as readonly string[]).includes(key)) { if (!/^#[a-f0-9]{6}$/i.test(value)) return bad('颜色必须为六位十六进制颜色'); }
    else if (key === 'radius') { if (!/^(?:[0-9]|[1-3][0-9]|40)px$/.test(value)) return bad('圆角应为 0–40px'); }
    else if (!['none', '0 8px 24px #00000026', '0 16px 48px #00000040'].includes(value)) return bad('阴影必须使用预设');
    result[key] = value;
  }
  return result;
}
export function operationData(kind: OperationKind, input: unknown): any {
  if (kind === 'theme') {
    const data = object(input, ['name', 'mode', 'variables', 'effects'], '主题');
    const effects = object(data.effects, ['particles', 'density', 'disabledOnMobile'], '动效');
    return { name: text(data.name, '名称', 100), mode: choice(data.mode, ['LIGHT', 'DARK', 'AUTO'], '主题模式'), variables: themeVariables(data.variables), effects: { particles: bool(effects.particles, '粒子开关'), density: integer(effects.density, '粒子密度', 0, 80), disabledOnMobile: bool(effects.disabledOnMobile, '手机降级') } };
  }
  if (kind === 'themeSchedule') {
    const data = object(input, ['themeId', 'startAt', 'endAt', 'timezone', 'enabled'], '调度');
    const startAt = instant(data.startAt)!, endAt = instant(data.endAt)!;
    if (endAt <= startAt) return bad('结束时间必须晚于开始时间');
    return { themeId: text(data.themeId, '主题 ID', 100), startAt, endAt, timezone: timeZone(data.timezone), enabled: bool(data.enabled, '启用') };
  }
  if (kind === 'marketingCampaign') {
    const data = object(input, ['name', 'kind', 'config', 'startAt', 'endAt', 'timezone', 'enabled'], '营销');
    const config = object(data.config, ['title', 'text', 'url', 'buttonText', 'frequencyHours', 'pageRules', 'expiredText', 'expiredBehavior', 'expiredUrl'], '营销配置');
    const startAt = instant(data.startAt, true), endAt = instant(data.endAt, true), campaignKind = choice(data.kind, ['POPUP', 'COUNTDOWN', 'BANNER'], '类型');
    if (startAt && endAt && endAt <= startAt) return bad('结束时间必须晚于开始时间');
    if (campaignKind === 'COUNTDOWN' && !endAt) return bad('倒计时必须配置结束时间');
    return { name: text(data.name, '名称', 100), kind: campaignKind, startAt, endAt, timezone: timeZone(data.timezone), enabled: bool(data.enabled, '启用'), config: {
      title: text(config.title, '标题', 200), text: text(config.text, '正文', 4000, true), url: marketingUrl(config.url), buttonText: text(config.buttonText, '按钮文字', 100, true), frequencyHours: integer(config.frequencyHours, '频率小时', 1, 8760), pageRules: pageRules(config.pageRules),
      expiredText: text(config.expiredText, '结束文字', 200), expiredBehavior: choice(config.expiredBehavior, ['hide', 'text', 'link'], '结束行为'), expiredUrl: marketingUrl(config.expiredUrl)
    } };
  }
  const data = object(input, ['name', 'position', 'code', 'delayMs', 'enabled', 'changeNote', 'acknowledgeRisk'], '插件');
  const enabled = bool(data.enabled, '启用');
  if (enabled && data.acknowledgeRisk !== true) return bad('启用可执行代码必须明确确认其同源权限与第三方隐私风险');
  if (data.acknowledgeRisk !== undefined) bool(data.acknowledgeRisk, '风险确认');
  return { name: text(data.name, '名称', 100), position: choice(data.position, ['HEAD', 'BODY_END'], '注入位置'), code: text(data.code, '代码', 100000, true), delayMs: integer(data.delayMs, '延迟毫秒', 3000, 60000), enabled, changeNote: text(data.changeNote, '变更说明', 500) };
}
