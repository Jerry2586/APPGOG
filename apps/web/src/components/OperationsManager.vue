<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { ElMessageBox } from 'element-plus';
import { api } from '../api';
import { operationIso, themeStyles, THEME_DARK } from '../operations-client';
const props = defineProps<{ kind: 'theme' | 'themeSchedule' | 'marketingCampaign' | 'pluginSnippet' }>();
const titles = { theme: '节日皮肤库', themeSchedule: '主题自动调度', marketingCampaign: '自动化与营销', pluginSnippet: '第三方统计 / 客服与自定义代码' };
const items = ref<any[]>([]), themes = ref<any[]>([]), total = ref(0), page = ref(1), search = ref(''), status = ref<any>(), error = ref(''), notice = ref(''), busy = ref(false), loading = ref(false);
const draft = ref<any>(null), selectedId = ref(''), revision = ref(0), original = ref(''), versions = ref<any[]>([]), versionPage = ref(1), versionTotal = ref(0);
let alive = true, generation = 0, historyGeneration = 0;
const dirty = computed(() => draft.value !== null && JSON.stringify(draft.value) !== original.value);
defineExpose({ hasUnsavedChanges: () => dirty.value, isBusy: () => busy.value });
const cssPreview = computed(() => themeStyles(draft.value, '', draft.value?.mode !== 'LIGHT').style);
function message(e: any) { return Array.isArray(e.response?.data?.message) ? e.response.data.message.join('；') : e.response?.data?.message || e.message || '操作失败，请重试'; }
function defaults(): any {
  if (props.kind === 'theme') return { name: '', mode: 'DARK', variables: { ...THEME_DARK }, effects: { particles: false, density: 24, disabledOnMobile: true } };
  if (props.kind === 'themeSchedule') return { themeId: themes.value[0]?.id || '', startAt: '', endAt: '', timezone: 'Asia/Shanghai', enabled: false };
  if (props.kind === 'marketingCampaign') return { name: '', kind: 'POPUP', enabled: false, startAt: '', endAt: '', timezone: 'Asia/Shanghai', config: { title: '', text: '', url: '', buttonText: '查看详情', frequencyHours: 24, pageRules: '*', expiredBehavior: 'hide', expiredText: '活动已结束', expiredUrl: '' } };
  return { name: '', position: 'BODY_END', code: '', delayMs: 3000, enabled: false, changeNote: '', acknowledgeRisk: false };
}
async function mayDiscard() { if (!dirty.value) return true; try { await ElMessageBox.confirm('当前编辑尚未保存，是否放弃？', '未保存的修改'); return true; } catch { return false; } }
async function load() {
  const request = ++generation; loading.value = true; error.value = '';
  try { const [result, state] = await Promise.all([api.get(`/admin/${props.kind}`, { params: { page: page.value, limit: 20, search: search.value || undefined } }), props.kind !== 'pluginSnippet' ? api.get('/admin/theme-state') : Promise.resolve(null)]);
    if (!alive || request !== generation) return; items.value = result.data.items; total.value = result.data.total; status.value = state?.data;
  } catch (e) { if (alive && request === generation) error.value = message(e); } finally { if (request === generation) loading.value = false; }
}
async function loadThemes() { const all: any[] = []; for (let n = 1; n <= 10; n++) { const { data } = await api.get('/admin/theme', { params: { page: n, limit: 100 } }); all.push(...data.items); if (all.length >= data.total) break; } if (alive) themes.value = all; }
function assign(row?: any) {
  const form = defaults();
  if (row) for (const key of Object.keys(form)) if (key in row) form[key] = row[key];
  // Normalize legacy data for explicit review without executing or silently enabling it.
  if (props.kind === 'theme') { form.variables = { ...THEME_DARK, ...form.variables }; form.effects = { particles: false, density: 24, disabledOnMobile: true, ...form.effects }; }
  if (props.kind === 'pluginSnippet') { form.changeNote = ''; form.acknowledgeRisk = false; }
  historyGeneration++; draft.value = form; selectedId.value = row?.id || ''; revision.value = row?.revision || 0; original.value = JSON.stringify(form); versions.value = []; versionTotal.value = 0;
}
async function edit(row?: any) {
  if (busy.value || !(await mayDiscard())) return;
  busy.value = true; error.value = ''; notice.value = '';
  try { if (props.kind === 'themeSchedule') await loadThemes(); assign(row ? (await api.get(`/admin/${props.kind}/${row.id}`)).data : undefined); }
  catch (e) { error.value = message(e); } finally { busy.value = false; }
}
async function cancel() { if (!busy.value && await mayDiscard()) { historyGeneration++; draft.value = null; versions.value = []; } }
async function save() {
  if (busy.value) return; busy.value = true; error.value = ''; notice.value = '';
  try {
    const data = JSON.parse(JSON.stringify(draft.value));
    if (props.kind === 'themeSchedule' || props.kind === 'marketingCampaign') { data.startAt = operationIso(data.startAt, data.timezone); data.endAt = operationIso(data.endAt, data.timezone); }
    const body = { baseRevision: revision.value, data }, url = `/admin/${props.kind}`;
    const response = selectedId.value ? await api.patch(`${url}/${selectedId.value}`, body) : await api.post(url, body);
    assign(response.data); notice.value = props.kind === 'pluginSnippet' ? '已保存并记录不可变版本；启用插件在公开页至少延迟三秒执行。' : '已保存。线上页面最长约 15 秒刷新配置。'; await load();
  } catch (e) { error.value = message(e); } finally { busy.value = false; }
}
async function action(row: any, actionName: 'activate' | 'remove' | 'disable') {
  if (busy.value || !(await mayDiscard())) return;
  try { await ElMessageBox.confirm(actionName === 'activate' ? '设为默认主题？当前有效调度仍优先，调度结束后恢复此主题。' : actionName === 'disable' ? '立即停用插件？已执行的公开页在下次配置刷新后重新加载，以清理旧脚本。' : '删除此记录？关联限制仍会检查，审计记录保留。', '确认操作'); } catch { return; }
  busy.value = true; error.value = ''; notice.value = '';
  try {
    if (actionName === 'remove') await api.delete(`/admin/${props.kind}/${row.id}`, { data: { baseRevision: row.revision } });
    else await api.post(`/admin/${props.kind}/${row.id}/${actionName}`, { baseRevision: row.revision, ...(actionName === 'activate' ? { baseStateRevision: status.value?.state.revision ?? 0 } : {}) });
    draft.value = null; versions.value = []; notice.value = '操作完成'; await load();
  } catch (e) { error.value = message(e); } finally { busy.value = false; }
}
async function history(change = 0) {
  const request = ++historyGeneration, id = selectedId.value;
  versionPage.value = Math.max(1, versionPage.value + change); error.value = '';
  try { const { data } = await api.get(`/admin/pluginSnippet/${id}/versions`, { params: { page: versionPage.value, limit: 10 } }); if (alive && request === historyGeneration && id === selectedId.value) { versions.value = data.items; versionTotal.value = data.total; } } catch (e) { if (alive && request === historyGeneration) error.value = message(e); }
}
async function restore(version: any) {
  if (busy.value || !(await mayDiscard())) return;
  let note: string;
  try { note = (await ElMessageBox.prompt('复制为新版本并保持停用。请填写回退原因：', '恢复历史版本', { inputValidator: value => !!value?.trim() || '必须填写原因' })).value; } catch { return; }
  busy.value = true; error.value = '';
  try { const { data } = await api.post(`/admin/pluginSnippet/${selectedId.value}/restore`, { baseRevision: revision.value, versionId: version.id, changeNote: note, acknowledgeRisk: false }); assign(data); notice.value = '已恢复为新版本，保持停用；审核后可单独启用。'; await load(); } catch (e) { error.value = message(e); } finally { busy.value = false; }
}
function displayTime(value: string, zone: string) { if (!value) return '不限'; try { return new Intl.DateTimeFormat('zh-CN', { timeZone: zone || 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value)); } catch { return value; } }
function turnPage(delta: number) { page.value += delta; load(); }
function beforeUnload(event: BeforeUnloadEvent) { if (dirty.value || busy.value) { event.preventDefault(); event.returnValue = ''; } }
onMounted(() => { load(); window.addEventListener('beforeunload', beforeUnload); }); onUnmounted(() => { alive = false; generation++; historyGeneration++; window.removeEventListener('beforeunload', beforeUnload); });
</script>
<template><section class="operations-manager" :aria-busy="busy || loading">
  <header><div><h1>{{ titles[kind] }}</h1><p>APPGOG 独立运营配置 · 保存即时生效 · 版本冲突保护与审计</p></div><button :disabled="busy" @click="edit()">＋ 新建</button></header>
  <p v-if="error" role="alert" class="ops-error">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
  <p v-if="status" class="ops-note">当前生效：{{ status.theme?.name || '内置主题' }}；默认主题：{{ status.state.defaultThemeId || '内置' }}。{{ status.schedule ? '定时主题生效中，结束后恢复默认。' : '当前没有生效中的调度。' }}</p>
  <p v-if="kind === 'themeSchedule'" class="ops-note">时间窗采用 [开始, 结束)，已启用的调度禁止重叠。允许首尾相接；可先保存未启用计划。</p>
  <p v-if="kind === 'marketingCampaign'" class="ops-note">保存后在页面装修引擎拖入对应弹窗、倒计时或横幅，填写活动 ID 绑定。未开始、过期、停用或页面规则不匹配时不展示；本模块仅负责营销展示。</p>
  <p v-if="kind === 'pluginSnippet'" class="ops-warning">仅超级管理员可管理。HTML/JS 具有公开站点的同源权限，不是沙箱；只粘贴已审核的第三方客服/统计代码。不得放入密钥、身份信息或任何 Xboard 接口调用。HEAD 与 BODY_END 均至少延迟 3000ms；代码不会在此编辑界面预览执行。最多同时启用16个插件、总代码512KiB。已执行代码只能通过刷新清理，停用并不能撤回已发送给第三方的数据。</p>
  <form class="ops-toolbar" @submit.prevent="page=1;load()"><label v-if="kind !== 'themeSchedule'">搜索名称<input v-model="search" maxlength="100" /></label><button :disabled="loading">搜索 / 刷新</button></form>
  <p v-if="loading">正在读取配置…</p><p v-else-if="!items.length">暂无记录</p>
  <div class="ops-list"><article v-for="row in items" :key="row.id"><h3>{{ row.name || themes.find(x=>x.id===row.themeId)?.name || row.themeId }}</h3><code>{{ row.id }}</code><p>版本 {{ row.revision }} · {{ kind==='theme' ? (row.active?'当前活动主题':'皮肤') : row.enabled?'已启用':'已停用' }}</p><p v-if="kind==='themeSchedule'||kind==='marketingCampaign'">{{ displayTime(row.startAt,row.timezone) }} — {{ displayTime(row.endAt,row.timezone) }}<br>{{ row.timezone }}</p><p v-if="kind==='pluginSnippet'">{{ row.position }} · 延迟 {{ row.delayMs }}ms</p><div class="ops-actions"><button :disabled="busy" @click="edit(row)">编辑</button><button v-if="kind==='theme'" :disabled="busy" @click="action(row,'activate')">一键设为默认</button><button v-if="kind==='pluginSnippet'" :disabled="busy" @click="action(row,'disable')">紧急停用</button><button v-else :disabled="busy" @click="action(row,'remove')">删除</button></div></article></div>
  <nav aria-label="配置分页" class="ops-actions"><button :disabled="page<=1||loading" @click="turnPage(-1)">上一页</button><span>第 {{ page }} 页 / 共 {{ total }} 条</span><button :disabled="page*20>=total||loading" @click="turnPage(1)">下一页</button></nav>
  <form v-if="draft" class="ops-form" @submit.prevent="save"><h2>{{ selectedId?'编辑':'新建' }}{{ dirty?' · 未保存':'' }}</h2><p v-if="selectedId"><code>{{ selectedId }}</code> · 版本 {{ revision }}</p>
    <fieldset :disabled="busy"><label v-if="kind!=='themeSchedule'">名称<input v-model="draft.name" maxlength="100" required /></label>
    <template v-if="kind==='theme'"><label>默认明暗策略<select v-model="draft.mode"><option value="DARK">暗黑</option><option value="LIGHT">明亮</option><option value="AUTO">跟随系统</option></select></label><p>访客可通过 Header 明暗按钮切换并记住偏好；切换到另一模式时保持品牌色，使用对应明暗底色。</p><div class="ops-colors"><label v-for="(label,key) in {primary:'主色',accent:'强调色',bg:'背景',surface:'卡片背景',text:'文字',muted:'次要文字'}" :key="key">{{ label }}<input v-model="draft.variables[key]" type="color" /><input v-model="draft.variables[key]" :aria-label="label+'色值'" pattern="#[a-fA-F0-9]{6}" maxlength="7" /></label></div><label>圆角<select v-model="draft.variables.radius"><option v-for="n in [0,4,8,12,18,24,32,40]" :value="n+'px'">{{ n }}px</option></select></label><label>阴影<select v-model="draft.variables.shadow"><option value="none">无</option><option value="0 8px 24px #00000026">柔和</option><option value="0 16px 48px #00000040">明显</option></select></label><label class="ops-check"><input v-model="draft.effects.particles" type="checkbox" />启用节日粒子</label><label>粒子密度<input v-model.number="draft.effects.density" type="number" min="0" max="80" /></label><label class="ops-check"><input v-model="draft.effects.disabledOnMobile" type="checkbox" />手机隐藏粒子</label><div class="ops-preview" :style="cssPreview"><h3>APPGOG 主题实时预览</h3><p>背景、文字与品牌色实时变化，仅影响此预览。</p><article><strong>内容卡片</strong><p>圆角与阴影预览</p><button type="button">品牌按钮</button></article></div></template>
    <template v-if="kind==='themeSchedule'"><label>选择主题<select v-model="draft.themeId" required><option v-for="theme in themes" :key="theme.id" :value="theme.id">{{ theme.name }}</option></select></label></template>
    <template v-if="kind==='themeSchedule'||kind==='marketingCampaign'"><label>时区<input v-model="draft.timezone" required placeholder="Asia/Shanghai" /></label><label>开始时间<input v-model="draft.startAt" :required="kind==='themeSchedule'" placeholder="2026-10-01T00:00:00 或带时区 ISO 时间" /></label><label>结束时间<input v-model="draft.endAt" :required="kind==='themeSchedule'||draft.kind==='COUNTDOWN'" placeholder="2026-10-08T00:00:00 或带时区 ISO 时间" /></label><p>不带偏移的时间按上述 IANA 时区解释；带 Z/偏移的时间表示绝对时刻。夏令时重复或不存在的本地时间会拒绝。</p></template>
    <template v-if="kind==='marketingCampaign'"><label>组件类型<select v-model="draft.kind"><option value="POPUP">弹窗</option><option value="COUNTDOWN">倒计时</option><option value="BANNER">横幅</option></select></label><label>标题<input v-model="draft.config.title" required maxlength="200" /></label><label>正文<textarea v-model="draft.config.text" rows="4" maxlength="4000" /></label><label>跳转 URL<input v-model="draft.config.url" placeholder="/help 或 https://example.com/path" /></label><label>按钮文字<input v-model="draft.config.buttonText" maxlength="100" /></label><label>页面规则<input v-model="draft.config.pageRules" placeholder="*, /help, /help/*" required /></label><label v-if="draft.kind==='POPUP'">重复弹出最短间隔（小时）<input v-model.number="draft.config.frequencyHours" type="number" min="1" max="8760" required /></label><p>绑定后台活动到期后隐藏；倒计时不会继续促销。页面本地倒计时可配置到期文字、隐藏或结束链接。</p></template>
    <template v-if="kind==='pluginSnippet'"><label>注入位置<select v-model="draft.position"><option value="HEAD">head</option><option value="BODY_END">body-end</option></select></label><label>延迟（毫秒，最少 3000）<input v-model.number="draft.delayMs" type="number" min="3000" max="60000" required /></label><label>自定义 HTML / JS（JS 请置于 script 标签中）<textarea v-model="draft.code" class="ops-code" rows="12" maxlength="100000" spellcheck="false" /></label><label>变更说明<input v-model="draft.changeNote" required maxlength="500" /></label><label class="ops-check"><input v-model="draft.acknowledgeRisk" type="checkbox" />我已审核代码，确认其同源权限、第三方数据传输风险和隔离要求</label></template>
    <label v-if="kind!=='theme'" class="ops-check"><input v-model="draft.enabled" type="checkbox" />启用</label>
    <div class="ops-actions"><button type="submit">保存</button><button type="button" @click="cancel">关闭编辑</button><button v-if="kind==='pluginSnippet'&&selectedId" type="button" @click="versionPage=1;history()">查看历史版本</button></div></fieldset>
  </form>
  <section v-if="versions.length" class="ops-versions"><h2>不可变插件历史</h2><article v-for="version in versions" :key="version.id"><h3>版本 {{ version.version }} · {{ version.enabled?'启用':'停用' }}</h3><p>{{ version.changeNote }} · 操作者 {{ version.createdById || '迁移' }} · {{ version.createdAt }}</p><details><summary>查看历史代码（不执行）</summary><pre>{{ version.code }}</pre></details><button :disabled="busy" @click="restore(version)">恢复此版本（保持停用）</button></article><div class="ops-actions"><button :disabled="versionPage<=1" @click="history(-1)">较新版本</button><span>{{ versionPage }} / {{ Math.ceil(versionTotal/10) }}</span><button :disabled="versionPage*10>=versionTotal" @click="history(1)">较旧版本</button></div></section>
</section></template>
