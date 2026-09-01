export const THEME_DARK = { primary: '#6d5dfc', accent: '#19d3ae', bg: '#090b16', surface: '#121527', text: '#eef0ff', muted: '#969bb8', radius: '18px', shadow: '0 8px 24px #00000026' };
export const THEME_LIGHT = { ...THEME_DARK, bg: '#f6f7fb', surface: '#ffffff', text: '#17192a', muted: '#60657a' };
export type ThemeData = { id?: string; mode: string; variables: Record<string, string>; effects?: { particles: boolean; density: number; disabledOnMobile: boolean } };
export type ColorMode = 'light' | 'dark';
export function themeStyles(theme: ThemeData | null, preference: ColorMode | '', systemDark: boolean) {
  const baseMode: ColorMode = theme?.mode === 'LIGHT' ? 'light' : theme?.mode === 'DARK' ? 'dark' : systemDark ? 'dark' : 'light';
  const mode = preference || baseMode, vars: Record<string, string> = { ...(mode === 'light' ? THEME_LIGHT : THEME_DARK) };
  for (const [key, value] of Object.entries(theme?.variables || {})) {
    if (!(key in vars) || typeof value !== 'string') continue;
    if (key === 'radius' ? !/^(?:[0-9]|[1-3][0-9]|40)px$/.test(value) : key === 'shadow' ? !['none', '0 8px 24px #00000026', '0 16px 48px #00000040'].includes(value) : !/^#[a-f0-9]{6}$/i.test(value)) continue;
    if (mode !== baseMode && ['bg', 'surface', 'text', 'muted'].includes(key)) continue;
    vars[key] = value;
  }
  return { mode, style: Object.fromEntries(Object.entries(vars).map(([key, value]) => ['--' + key, value])) };
}
// Resolve local wall time against IANA rules; reject DST gaps AND ambiguous overlaps.
// Explicit offset/Z is accepted for selecting one side of an overlap.
export function zonedTimestamp(value: string, zone: string) {
  if (!value) return NaN;
  if (/Z$|[+-]\d{2}:\d{2}$/.test(value)) return Date.parse(value);
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return NaN;
  const [year, month, day, hour, minute, second] = match.slice(1).map(x => Number(x || 0));
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    const fields = (stamp: number) => Object.fromEntries(formatter.formatToParts(new Date(stamp)).filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)]));
    const offsets = new Set([-86400000, 0, 86400000].map(delta => { const p = fields(wall + delta); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - (wall + delta); }));
    const candidates = [...offsets].map(offset => wall - offset).filter(stamp => { const p = fields(stamp); return p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute && p.second === second; });
    return candidates.length === 1 ? candidates[0] : NaN;
  } catch { return NaN; }
}
export function operationIso(value: string, zone: string) { if (!value) return null; const timestamp = zonedTimestamp(value, zone); if (!Number.isFinite(timestamp)) throw new Error('时间不存在、夏令时重复或时区无效；请填写带 Z/偏移的时间消除歧义'); return new Date(timestamp).toISOString(); }
export function matchesPage(rules: string, path: string) {
  if (path.startsWith('/admin')) return false;
  return rules.split(',').map(x => x.trim()).some(rule => rule === '*' || (rule.endsWith('*') ? path.startsWith(rule.slice(0, -1)) : path === rule));
}
export function marketingWindow(start: unknown, end: unknown, zone: string, now: number) {
  const from = start ? zonedTimestamp(String(start), zone) : -Infinity, until = end ? zonedTimestamp(String(end), zone) : Infinity;
  return { active: now >= from && now < until, expired: now >= until, valid: !Number.isNaN(from) && !Number.isNaN(until) && from < until, until };
}
const memory = new Map<string, number>();
export function claimPopup(key: string, hours: number, now: number, storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  let last = memory.get(key) || 0;
  try { const saved = Number(storage?.getItem(key) || 0); if (Number.isFinite(saved)) last = Math.max(last, saved); } catch { /* in-memory fallback */ }
  if (last > now) last = now; // Clock rollback must not turn into repeated popups.
  if (last && now - last < Math.max(1, hours) * 3600000) return false;
  memory.set(key, now);
  try { storage?.setItem(key, String(now)); } catch { /* unavailable storage */ }
  return true;
}
