<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api, currentAdminAccount } from '../api';
import { LayoutHistory } from '../layout-history';
import { newBlock, type Block, type ComponentDefinition, type ComponentField, type ComponentManifest } from '../types';
import BlockRenderer from './BlockRenderer.vue';
import EditorBlock from './EditorBlock.vue';
import MediaPicker from './MediaPicker.vue';
import { appendMediaValue, type MediaAsset } from '../media-client';
import { categoryOptions, type CmsCategory } from '../cms-client';
import { pendingPublication } from '../site-client';
provide('appgog-preview', true);

type PageRecord = {
  id: string;
  name: string;
  slug: string;
  liveSlug?: string | null;
  routeType: 'PAGE' | 'REDIRECT';
  redirectUrl?: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'OFFLINE' | 'ARCHIVED';
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeywords?: string | null;
  ogImage?: string | null;
  draftVersionId: string;
  publishedVersionId?: string | null;
  draftVersion?: { id: string; version: number };
  publishedVersion?: { id: string; version: number } | null;
  draftLayout: Block[];
};

const admin = currentAdminAccount();
const pages = ref<PageRecord[]>([]);
const current = ref<PageRecord | null>(null);
const currentId = ref('');
const selected = ref<Block | null>(null);
const versions = ref<any[]>([]);
const saving = ref(false);
const dirty = ref(false);
const previewing = ref(false);
const previewDevice = ref<'desktop' | 'tablet' | 'mobile'>('desktop');
const changeNote = ref('');
const history = new LayoutHistory<Block[]>(50);
const historyRevision = ref(0);
const componentDefinitions = ref<ComponentDefinition[]>([]);
const editorLoadError = ref('');
const starter = ref<{ version: number; pages: { requirement: string; name: string; slug: string; existingPageId: string | null }[] } | null>(null);
const starterError = ref(''), installing = ref(false);
const pendingChecks = computed(() => pendingPublication(current.value?.draftLayout || []));
const manifestSchemaVersion = ref(1);
const mediaPickerVisible = ref(false);
const mediaTarget = ref<{ kind: 'prop' | 'seo'; key?: string; control?: string; pageId: string; blockId?: string } | null>(null);
const groups = computed(() => componentDefinitions.value.reduce<Record<string, string[]>>((result, definition) => {
  (result[definition.group] ||= []).push(definition.type);
  return result;
}, {}));
const labels = computed<Record<string, string>>(() => Object.fromEntries(componentDefinitions.value.map(item => [item.type, item.label])));
const definitions = computed(() => new Map(componentDefinitions.value.map(item => [item.type, item])));
const blockMap = computed<Record<string, Block>>(() => Object.fromEntries(componentDefinitions.value.map(item => [item.type, newBlock(item.type, item.defaults)])));
const selectedDefinition = computed(() => selected.value ? definitions.value.get(selected.value.type) : undefined);
const bindingCategories=ref<CmsCategory[]>([]),bindingError=ref('');
const bindingOptions=computed(()=>categoryOptions(bindingCategories.value));
let bindingRequest=0;
async function loadBindingCategories(){const request=++bindingRequest;if(!selectedDefinition.value?.fields.some(field=>field.key==='categoryId'))return;try{const {data}=await api.get('/admin/category',{params:{scope:selected.value?.type==='products'?'PRODUCT':'CONTENT'}});if(request===bindingRequest){bindingCategories.value=data;bindingError.value=''}}catch{if(request===bindingRequest){bindingCategories.value=[];bindingError.value='分类读取失败，可重试'}}}
watch(()=>selected.value?.type,loadBindingCategories);
const roleRank = { VIEWER: 0, EDITOR: 1, ADMIN: 2, SUPER_ADMIN: 3 } as const;
const canEdit = computed(() => !!admin && roleRank[admin.role] >= roleRank.EDITOR);
const canDelete = computed(() => !!admin && roleRank[admin.role] >= roleRank.ADMIN);
const canUndo = computed(() => (historyRevision.value, history.canUndo));
const canRedo = computed(() => (historyRevision.value, history.canRedo));
const selectedIsRoot = computed(() => !!current.value?.draftLayout.some(item => item.id === selected.value?.id));
const previewWidth = computed(() => ({ desktop: '100%', tablet: '768px', mobile: '375px' })[previewDevice.value]);

function cloneBlock(item: any) {
  const definition = definitions.value.get(item.type);
  return newBlock(item.type, definition?.defaults || item.props || {});
}

function makeBlock(type: string) {
  return newBlock(type, definitions.value.get(type)?.defaults || {});
}

function fieldTextValue(field: ComponentField) {
  const value = selected.value?.props[field.key];
  if (field.control === 'json') return JSON.stringify(value ?? [], null, 2);
  if (field.control === 'url-list') return Array.isArray(value) ? value.join('\n') : String(value || '');
  return String(value ?? '');
}

function updateStructuredField(field: ComponentField, event: Event) {
  if (!selected.value) return;
  const value = (event.target as HTMLTextAreaElement).value;
  try {
    selected.value.props[field.key] = field.control === 'json'
      ? JSON.parse(value || '[]')
      : value.split(/\r?\n|,/).map(item => item.trim()).filter(Boolean);
    recordHistory();
  } catch {
    ElMessage.error(`${field.label} 必须是有效 JSON`);
  }
}

function openMediaPicker(target: { kind: 'prop' | 'seo'; key?: string; control?: string }) {
  if (!current.value || !canEdit.value) return;
  mediaTarget.value = { ...target, pageId: current.value.id, blockId: selected.value?.id };
  mediaPickerVisible.value = true;
}

function selectMedia(url: string, asset: MediaAsset) {
  const target = mediaTarget.value;
  if (!target || !current.value || !canEdit.value) return;
  if (current.value.id !== target.pageId || (target.kind === 'prop' && selected.value?.id !== target.blockId)) {
    ElMessage.warning('选图目标已经变化，请重新打开媒体库'); return;
  }
  if (target.kind === 'seo') { current.value.ogImage = url; markMetadataChanged(); }
  else if (selected.value && target.key) {
    try {
      selected.value.props[target.key] = appendMediaValue(selected.value.props[target.key], target.key, target.control, asset);
      recordHistory();
    } catch (failure) { ElMessage.error((failure as Error).message); }
  }
}

function resetHistory() {
  history.reset(current.value?.draftLayout || []);
  historyRevision.value += 1;
  dirty.value = false;
}

function recordHistory() {
  if (!current.value || !canEdit.value) return;
  history.record(current.value.draftLayout);
  historyRevision.value += 1;
  dirty.value = true;
}

function markMetadataChanged() {
  if (canEdit.value) dirty.value = true;
}

function undo() {
  const layout = history.undo();
  if (layout && current.value) {
    current.value.draftLayout = layout;
    selected.value = null;
    dirty.value = true;
    historyRevision.value += 1;
  }
}

function redo() {
  const layout = history.redo();
  if (layout && current.value) {
    current.value.draftLayout = layout;
    selected.value = null;
    dirty.value = true;
    historyRevision.value += 1;
  }
}

async function loadVersions() {
  versions.value = current.value ? (await api.get(`/admin/pages/${current.value.id}/versions`)).data : [];
}

async function choose(id = currentId.value) {
  if (!id) return;
  if (dirty.value && current.value && id !== current.value.id) {
    try {
      await ElMessageBox.confirm('当前草稿尚未保存，切换页面将放弃本地修改。', '未保存更改', { type: 'warning' });
    } catch {
      currentId.value = current.value.id;
      return;
    }
  }
  current.value = (await api.get(`/admin/pages/${id}`)).data;
  currentId.value = id;
  selected.value = null;
  previewing.value = false;
  resetHistory();
  await loadVersions();
}

async function loadPages(preferredId?: string) {
  pages.value = (await api.get('/admin/pages')).data;
  const id = preferredId || current.value?.id || pages.value[0]?.id;
  if (id) await choose(id);
  else {
    current.value = null;
    currentId.value = '';
  }
}

async function createPage() {
  const suffix = Date.now().toString(36);
  const layout = [makeBlock('header'), makeBlock('hero'), makeBlock('footer')];
  const page = (await api.post('/admin/pages', {
    name: '新页面', slug: `page-${suffix}`, routeType: 'PAGE', layout,
    schemaVersion: 1, changeNote: '创建页面'
  })).data;
  await loadPages(page.id);
  ElMessage.success('页面已创建');
}

async function loadStarter() {
  starterError.value = '';
  try { starter.value = (await api.get('/admin/pages/site-starter')).data; }
  catch { starterError.value = '官网页面清单读取失败'; }
}

async function installStarter() {
  if (installing.value || saving.value || !canDelete.value) return;
  if (dirty.value) { ElMessage.warning('请先保存当前草稿，再初始化官网页面'); return; }
  try { await ElMessageBox.confirm('创建缺少的官网草稿，不覆盖任何已有页面或线上路由，不自动发布。实际资料需逐页核实。', '初始化官网方案', { type: 'warning' }); } catch { return; }
  installing.value = true;
  try {
    const { data } = await api.post('/admin/pages/site-starter', { version: starter.value?.version || 1 });
    await loadPages(current.value?.id || data.created[0]?.id);
    await loadStarter();
    ElMessage.success(`新增 ${data.created.length} 个草稿，跳过 ${data.skipped.length} 个已占用路由`);
  } catch (failure: any) { ElMessage.error(failure.response?.data?.message || '官网草稿初始化失败，请刷新后重试'); }
  finally { installing.value = false; }
}

async function duplicatePage() {
  if (!current.value || dirty.value || saving.value) { ElMessage.warning('请先保存当前草稿'); return; }
  saving.value = true;
  try {
    const { baseVersionId: _, ...payload } = draftPayload();
    const { data } = await api.post('/admin/pages', { ...payload, name: `${current.value.name.slice(0, 90)} 副本`, slug: `page-${crypto.randomUUID()}`, changeNote: `复制页面 ${current.value.slug}` });
    await loadPages(data.id);
    ElMessage.success('已复制为独立草稿，请修改路由与资料');
  } catch (failure: any) { ElMessage.error(failure.response?.data?.message || '复制失败'); }
  finally { saving.value = false; }
}

function selectPending(id: string) {
  const find = (blocks: Block[]): Block | undefined => { for (const block of blocks) { if (block.id === id) return block; const child = find(block.children); if (child) return child; } };
  selected.value = find(current.value?.draftLayout || []) || null;
}

function draftPayload() {
  if (!current.value) throw new Error('没有当前页面');
  return {
    name: current.value.name,
    slug: current.value.slug,
    routeType: current.value.routeType,
    redirectUrl: current.value.routeType === 'REDIRECT' ? current.value.redirectUrl : null,
    seoTitle: current.value.seoTitle,
    seoDescription: current.value.seoDescription,
    seoKeywords: current.value.seoKeywords,
    ogImage: current.value.ogImage,
    layout: current.value.draftLayout,
    schemaVersion: 1,
    changeNote: changeNote.value || '后台编辑保存',
    baseVersionId: current.value.draftVersionId
  };
}

async function saveDraft(showMessage = true) {
  if (!current.value) return null;
  saving.value = true;
  try {
    const page = (await api.patch(`/admin/pages/${current.value.id}/draft`, draftPayload())).data as PageRecord;
    current.value = page;
    currentId.value = page.id;
    const index = pages.value.findIndex(item => item.id === page.id);
    if (index >= 0) pages.value[index] = page;
    changeNote.value = '';
    resetHistory();
    await loadVersions();
    if (showMessage) ElMessage.success('草稿已保存，线上版本未变更');
    return page;
  } catch (error: any) {
    if (error.response?.status === 409) ElMessage.error('检测到并发编辑，请重新加载当前页面');
    throw error;
  } finally {
    saving.value = false;
  }
}

async function publish() {
  if (!current.value) return;
  if (pendingChecks.value.length) { ElMessage.warning('请先逐项核实并清除待核实事项，再发布'); return; }
  try {
  if (dirty.value) await saveDraft(false);
  if (!current.value) return;
  const page = (await api.post(`/admin/pages/${current.value.id}/publish`, {
    draftVersionId: current.value.draftVersionId
  })).data as PageRecord;
  current.value = page;
  await loadPages(page.id);
  ElMessage.success('当前草稿已发布');
  } catch (failure: any) { ElMessage.error(failure.response?.data?.message || '发布失败，线上版本未变更'); }
}

async function changeStatus(status: 'DRAFT' | 'OFFLINE' | 'ARCHIVED') {
  if (!current.value) return;
  if (dirty.value) await ElMessageBox.confirm('继续变更状态将放弃本地未保存修改。', '存在未保存修改', { type: 'warning' });
  const page = (await api.post(`/admin/pages/${current.value.id}/status`, { status })).data as PageRecord;
  current.value = page;
  await loadPages(page.id);
  ElMessage.success(`页面状态已更新为 ${status}`);
}

async function removePage() {
  if (!current.value) return;
  await ElMessageBox.confirm(`确定删除页面“${current.value.name}”及全部版本？`, '删除页面', { type: 'warning' });
  await api.delete(`/admin/pages/${current.value.id}`);
  current.value = null;
  dirty.value = false;
  await loadPages();
  ElMessage.success('页面已删除');
}

async function restoreVersion(version: any) {
  if (!current.value) return;
  await ElMessageBox.confirm(`将版本 ${version.version} 恢复为新草稿？线上版本不会改变。`, '恢复历史版本', { type: 'warning' });
  const page = (await api.post(`/admin/pages/${current.value.id}/restore`, {
    versionId: version.id,
    baseVersionId: current.value.draftVersionId,
    changeNote: `恢复版本 ${version.version}`
  })).data as PageRecord;
  current.value = page;
  await loadPages(page.id);
  ElMessage.success('历史版本已复制为新草稿');
}

function removeRoot(id: string) {
  if (!current.value) return;
  current.value.draftLayout = current.value.draftLayout.filter(item => item.id !== id);
  if (selected.value?.id === id) selected.value = null;
  recordHistory();
}

async function loadEditor() {
  editorLoadError.value = '';
  try {
    const manifest = (await api.get<ComponentManifest>('/admin/components')).data;
    componentDefinitions.value = manifest.components;
    manifestSchemaVersion.value = manifest.schemaVersion;
    await loadPages();
    await loadStarter();
  } catch (error: any) {
    editorLoadError.value = error.response?.data?.message || error.message || '页面编辑器加载失败';
  }
}
onMounted(loadEditor);
function beforeUnload(event: BeforeUnloadEvent) { if (dirty.value || saving.value || installing.value) { event.preventDefault(); event.returnValue = ''; } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload));
onUnmounted(() => window.removeEventListener('beforeunload', beforeUnload));
defineExpose({ hasUnsavedChanges: () => dirty.value, isBusy: () => saving.value || installing.value });
</script>

<template>
  <aside class="library">
    <div class="lib-head"><b>组件库</b><button v-if="canEdit" @click="createPage">＋页面</button></div>
    <details class="starter-panel"><summary>第十二阶段 · 官网方案</summary><p>21 个 JSON 页面/入口，全部先建草稿。已占用路由不覆盖。</p><p v-if="starterError" role="alert">{{ starterError }}</p><button @click="loadStarter">刷新官网清单</button><ul><li v-for="page in starter?.pages" :key="page.slug">{{ page.requirement }} · {{ page.name }} /{{ page.slug }} · {{ page.existingPageId ? '已有页面' : '未创建' }}</li></ul><button v-if="canDelete" :disabled="installing || saving || dirty" @click="installStarter">{{ installing ? '正在创建…' : '创建缺少的官网草稿' }}</button><p>检查 Header/Footer、SEO、实际链接和素材。没有确认资料时保持草稿。</p></details>
    <p v-if="editorLoadError" role="alert">{{ editorLoadError }} <button @click="loadEditor">重试加载编辑器</button></p>
    <select v-model="currentId" @change="choose()">
      <option v-for="page in pages" :key="page.id" :value="page.id">{{ page.name }} · /{{ page.slug }}</option>
    </select>
    <p v-if="current" class="page-state">草稿 v{{ current.draftVersion?.version }} · {{ current.status }}<br><small v-if="current.liveSlug">线上：/{{ current.liveSlug }}</small></p>
    <section v-for="(types, title) in groups" :key="title">
      <h4>{{ title }}</h4>
      <VueDraggable :model-value="types.map(type => blockMap[type])" :group="{ name: 'blocks', pull: 'clone', put: false }" :clone="cloneBlock" :sort="false" :disabled="!canEdit" :force-fallback="true" :fallback-on-body="true">
        <div v-for="type in types" :key="type" class="palette">＋ {{ labels[type] }}</div>
      </VueDraggable>
    </section>
  </aside>

  <main class="canvas">
    <div class="canvas-title">
      <span>自由拖拽画布 · {{ current?.name || '暂无页面' }} <i v-if="dirty">未保存</i></span>
      <span class="editor-actions">
        <button :disabled="!canUndo" @click="undo">撤销</button><button :disabled="!canRedo" @click="redo">恢复</button>
        <button @click="previewing = !previewing">{{ previewing ? '返回编辑' : '预览' }}</button>
        <button v-if="canEdit" :disabled="saving || !current" @click="saveDraft()">保存草稿</button>
        <button v-if="canEdit" class="publish" :disabled="saving || !current" @click="publish">保存并发布</button>
      </span>
    </div>
    <div v-if="previewing" class="preview-toolbar">
      <button v-for="device in ['desktop', 'tablet', 'mobile']" :key="device" :class="{ active: previewDevice === device }" @click="previewDevice = device as any">{{ device }}</button>
    </div>
    <div v-if="previewing && current" class="preview-stage">
      <div class="preview-frame" :style="{ width: previewWidth }">
        <div v-if="current.routeType === 'REDIRECT'" class="redirect-preview">外部重定向：<a :href="current.redirectUrl || '#'" target="_blank" rel="noopener noreferrer">{{ current.redirectUrl }}</a></div>
        <BlockRenderer v-else v-for="block in current.draftLayout" :key="block.id" :block="block" />
      </div>
    </div>
    <VueDraggable v-else-if="current" v-model="current.draftLayout" group="blocks" item-key="id" class="dropzone" :disabled="!canEdit" :force-fallback="true" :fallback-on-body="true" @end="recordHistory" @add="recordHistory">
      <EditorBlock v-for="block in current.draftLayout" :key="block.id" :block="block" :labels="labels" :selected-id="selected?.id" :disabled="!canEdit" @select="selected = $event" @remove="removeRoot" @changed="recordHistory" />
    </VueDraggable>
    <div v-else class="dropzone empty-editor">尚未创建页面</div>
  </main>

  <aside class="props">
    <h3>属性面板</h3>
    <template v-if="selected">
      <p>当前选中：{{ labels[selected.type] }}</p>
      <p v-if="selectedDefinition" class="schema-note">Props Schema v{{ manifestSchemaVersion }} · 数据依赖 {{ selectedDefinition.dataDependency }}</p>
      <template v-for="field in selectedDefinition?.fields || []" :key="field.key">
        <label v-if="field.key==='categoryId'">关联分类<select v-model="selected.props[field.key]" :disabled="!canEdit" @change="recordHistory"><option value="">全部分类</option><option v-if="selected.props[field.key]&&!bindingOptions.some(node=>node.id===selected?.props[field.key])" :value="selected.props[field.key]">已配置分类（当前不可用）</option><option v-for="node in bindingOptions" :key="node.id" :value="node.id">{{'—'.repeat(Math.min(node.depth,12))}} {{node.name}}</option></select><small v-if="bindingError">{{bindingError}}</small><button type="button" @click="loadBindingCategories">刷新分类</button></label>
        <label v-else-if="field.control === 'boolean'" class="check-field"><input v-model="selected.props[field.key]" type="checkbox" :disabled="!canEdit" @change="recordHistory">{{ field.label }}</label>
        <label v-else-if="field.control === 'select'">{{ field.label }}<select v-model="selected.props[field.key]" :disabled="!canEdit" @change="recordHistory"><option v-for="option in field.options" :key="option" :value="option">{{ option }}</option></select></label>
        <label v-else-if="field.control === 'json' || field.control === 'url-list'">{{ field.label }}<textarea :value="fieldTextValue(field)" :disabled="!canEdit" @change="updateStructuredField(field, $event)" /><button v-if="canEdit && ['slides','images'].includes(field.key)" type="button" @click="openMediaPicker({kind:'prop',key:field.key,control:field.control})">从媒体库添加图片</button></label>
        <label v-else-if="field.control === 'textarea'">{{ field.label }}<textarea v-model="selected.props[field.key]" :disabled="!canEdit" @change="recordHistory" /></label>
        <label v-else-if="field.control === 'number'">{{ field.label }}<input v-model.number="selected.props[field.key]" type="number" :min="field.min" :max="field.max" :disabled="!canEdit" @change="recordHistory"></label>
        <label v-else>{{ field.label }}<input v-model="selected.props[field.key]" :type="field.control === 'url' ? 'url' : 'text'" :disabled="!canEdit" @change="recordHistory"><button v-if="canEdit && field.key === 'imageUrl'" type="button" @click="openMediaPicker({kind:'prop',key:field.key,control:field.control})">从媒体库选择</button></label>
      </template>
      <button v-if="canEdit && selectedIsRoot && !['header', 'footer'].includes(selected.type)" class="danger" @click="removeRoot(selected.id)">移除顶层组件</button>
    </template>
    <p v-else>点击画布中的组件进行配置</p>

    <hr>
    <template v-if="current">
      <section v-if="pendingChecks.length" class="publication-list"><b>发布前待核实 {{ pendingChecks.length }} 项</b><button v-for="check in pendingChecks" :key="check.id" @click="selectPending(check.id)">{{ check.title }}：{{ check.message }}</button></section>
      <button v-if="canEdit" :disabled="saving || dirty" @click="duplicatePage">复制为新草稿（用于新增节点等）</button>
      <label>页面名称<input v-model="current.name" :disabled="!canEdit" @change="markMetadataChanged"></label>
      <label>草稿路由<input v-model="current.slug" :disabled="!canEdit" @change="markMetadataChanged"></label>
      <label>路由类型<select v-model="current.routeType" :disabled="!canEdit" @change="markMetadataChanged"><option value="PAGE">组件页面</option><option value="REDIRECT">外部重定向</option></select></label>
      <label v-if="current.routeType === 'REDIRECT'">重定向 URL<input v-model="current.redirectUrl" :disabled="!canEdit" placeholder="https://panel.domain.com/..." @change="markMetadataChanged"></label>
      <label>SEO 标题<input v-model="current.seoTitle" :disabled="!canEdit" @change="markMetadataChanged"></label>
      <label>SEO 关键词<input v-model="current.seoKeywords" :disabled="!canEdit" @change="markMetadataChanged"></label>
      <label>SEO 描述<textarea v-model="current.seoDescription" :disabled="!canEdit" @change="markMetadataChanged" /></label>
      <label>SEO 分享图<input v-model="current.ogImage" :disabled="!canEdit" @change="markMetadataChanged"><button v-if="canEdit" type="button" @click="openMediaPicker({kind:'seo'})">从媒体库选择</button></label>
      <label>版本备注<input v-model="changeNote" :disabled="!canEdit" maxlength="500"></label>
      <div v-if="canEdit" class="status-actions">
        <button @click="changeStatus('DRAFT')">转草稿</button><button @click="changeStatus('OFFLINE')">下线</button><button @click="changeStatus('ARCHIVED')">归档</button>
      </div>
      <button v-if="canDelete" class="danger" @click="removePage">删除页面</button>

      <h3>版本历史</h3>
      <div class="version-list">
        <article v-for="version in versions" :key="version.id">
          <b>v{{ version.version }}</b><span>/{{ version.slug }}</span><small>{{ version.changeNote || '无备注' }}</small>
          <button v-if="canEdit && version.id !== current.draftVersionId" @click="restoreVersion(version)">恢复</button>
        </article>
      </div>
    </template>
  </aside>
  <MediaPicker :visible="mediaPickerVisible" @close="mediaPickerVisible=false" @select="selectMedia" />
</template>
