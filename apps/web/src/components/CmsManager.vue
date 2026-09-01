<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api, currentAdminAccount } from '../api';
import { categoryOptions, contentPayload, emptyContent, safeCmsHtml, type CmsCategory } from '../cms-client';
import { mediaError } from '../media-client';
import MediaPicker from './MediaPicker.vue';
import RichTextEditor from './RichTextEditor.vue';
import VideoPlayer from './VideoPlayer.vue';
const props=defineProps<{kind:'content'|'video'|'faq'}>();
const account=currentAdminAccount(), canEdit=!!account&&account.role!=='VIEWER', canArchive=['ADMIN','SUPER_ADMIN'].includes(account?.role||'');
const items=ref<any[]>([]), categories=ref<CmsCategory[]>([]), total=ref(0), page=ref(1), search=ref(''), status=ref(''), categoryId=ref(''), loading=ref(false), error=ref('');
const form=ref<any>(null), saved=ref(''), busy=ref(false), preview=ref(false), picker=ref(false), imageTarget=ref('coverUrl'), categoryError=ref('');
const type=computed(()=>props.kind==='video'?'VIDEO':props.kind==='faq'?'FAQ':'ARTICLE');
const options=computed(()=>categoryOptions(categories.value));
const dirty=computed(()=>!!form.value && JSON.stringify(contentPayload(form.value))!==saved.value);
const pages=computed(()=>Math.max(1,Math.ceil(total.value/20)));
defineExpose({ hasUnsavedChanges:()=>dirty.value, isBusy:()=>busy.value });
let loadId=0;
async function load(next=page.value) {
  const request=++loadId; loading.value=true; error.value=''; page.value=next;
  try { const {data}=await api.get('/admin/content/page',{params:{page:next,limit:20,type:type.value,search:search.value||undefined,status:status.value||undefined,categoryId:categoryId.value||undefined}});
    if(request!==loadId)return; items.value=data.items; total.value=data.total; if(next>pages.value) await load(pages.value);
  } catch(e){if(request===loadId)error.value=mediaError(e)} finally {if(request===loadId)loading.value=false}
}
async function mayDiscard() { if(!dirty.value)return true; try {await ElMessageBox.confirm('当前内容尚未保存，确定放弃修改？','未保存的内容');return true}catch{return false} }
async function edit(id?:string) {if(busy.value||!(await mayDiscard()))return; busy.value=true;try {form.value=id?(await api.get(`/admin/content/${id}`)).data:emptyContent(type.value);saved.value=JSON.stringify(contentPayload(form.value));preview.value=false}catch(e){ElMessage.error(mediaError(e))}finally{busy.value=false} }
async function close(){if(await mayDiscard())form.value=null}
async function save() {
  if(!canEdit||busy.value||!form.value)return false;busy.value=true;
  try{const payload=contentPayload(form.value); const result=form.value.id?await api.patch(`/admin/content/${form.value.id}`,payload):await api.post('/admin/content',payload);form.value=result.data;saved.value=JSON.stringify(contentPayload(form.value));await load();ElMessage.success('草稿已保存，线上版本未被覆盖');return true}
  catch(e){ElMessage.error(mediaError(e));return false}finally{busy.value=false}
}
async function act(action:string,nextStatus?:string) {
  if(!form.value?.id||busy.value||!canEdit)return;
  if(dirty.value){ElMessage.warning('请先保存草稿再执行此操作');return}
  try{if(action==='publish'||nextStatus==='ARCHIVED')await ElMessageBox.confirm(action==='publish'?'将当前草稿发布到前台？':'归档后内容将从前台及知识检索中移除，文件仍保留。','确认操作');
    busy.value=true;const {data}=await api.post(`/admin/content/${form.value.id}/${action}`,{baseRevision:form.value.revision,...(nextStatus?{status:nextStatus}:{})});form.value=data;saved.value=JSON.stringify(contentPayload(data));await load();ElMessage.success(action==='reindex'?'索引任务已入队，请刷新查看后台处理状态':'操作完成');
  }catch(e){if(e!=='cancel'&&e!=='close')ElMessage.error(mediaError(e))}finally{busy.value=false}
}
async function refreshIndex(){const id=form.value?.id;if(!id)return;try{const {data}=await api.get(`/admin/content/${id}`);if(form.value?.id===id)form.value.indexJobs=data.indexJobs}catch(e){ElMessage.error(mediaError(e))}}
function selectImage(url:string){if(form.value&&canEdit)form.value[imageTarget.value]=url}
function openPicker(target:string){imageTarget.value=target;picker.value=true}
function beforeUnload(event:BeforeUnloadEvent){if(dirty.value){event.preventDefault();event.returnValue=''}}
async function loadCategories(){try{categories.value=(await api.get('/admin/category',{params:{scope:'CONTENT'}})).data;categoryError.value=''}catch(e){categoryError.value=mediaError(e)}}
watch(()=>props.kind,()=>{form.value=null;search.value='';status.value='';categoryId.value='';load(1)});
onMounted(async()=>{window.addEventListener('beforeunload',beforeUnload);await Promise.all([loadCategories(),load(1)])});
onUnmounted(()=>{loadId++;window.removeEventListener('beforeunload',beforeUnload)});
</script>
<template><section class="cms-manager">
  <header class="cms-heading"><div><h1>{{kind==='video'?'影视教程库':kind==='faq'?'FAQ 知识库':'文档 CMS 库'}}</h1><p>草稿与公开内容隔离；编辑不会自动发布。</p></div><button v-if="canEdit" @click="edit()">＋ 新建</button></header>
  <form class="cms-filters" @submit.prevent="load(1)"><input v-model="search" aria-label="搜索内容" maxlength="100" placeholder="标题、摘要、正文或分类"><select v-model="status" aria-label="内容状态"><option value="">全部状态</option><option>DRAFT</option><option>PUBLISHED</option><option>OFFLINE</option><option>ARCHIVED</option></select><select v-model="categoryId" aria-label="按分类筛选"><option value="">全部分类及子分类</option><option v-for="category in options" :key="category.id" :value="category.id">{{'—'.repeat(Math.min(12,category.depth))}} {{category.name}}</option></select><button>搜索</button></form>
  <p v-if="loading" role="status">正在加载…</p><p v-else-if="error" role="alert">{{error}} <button @click="load()">重试</button></p>
  <p v-if="categoryError" role="alert">分类加载失败：{{categoryError}} <button @click="loadCategories">重试分类</button></p>
  <div v-if="!loading&&!error" class="cms-list"><article v-for="item in items" :key="item.id"><div><strong>{{item.title}}</strong><small>{{item.slug}} · {{item.status}} · 版本 {{item.revision}}</small></div><button :disabled="busy" @click="edit(item.id)">{{canEdit?'编辑':'查看'}}</button></article><p v-if="!items.length">没有符合条件的内容</p></div>
  <nav aria-label="内容分页"><button :disabled="loading||page<=1" @click="load(page-1)">上一页</button> {{page}} / {{pages}} 页 · {{total}} 项 <button :disabled="loading||page>=pages" @click="load(page+1)">下一页</button></nav>
  <section v-if="form" class="cms-editor" aria-label="内容编辑区"><header class="cms-heading"><h2>{{form.id?'编辑内容':'新建内容'}}</h2><button :disabled="busy" @click="close">关闭编辑</button></header>
    <fieldset :disabled="!canEdit||busy"><div class="cms-form-grid">
      <label>标题<input v-model="form.title" maxlength="200" required></label><label>路由标识<input v-model="form.slug" maxlength="160" placeholder="help/windows" required></label>
      <label>分类<select v-model="form.categoryId"><option value="">未分类</option><option v-for="category in options" :key="category.id" :value="category.id">{{'—'.repeat(Math.min(12,category.depth))}} {{category.name}}</option></select></label>
      <label>正文格式<select v-model="form.format" :disabled="!!(form.body||form.faqAnswer)"><option value="MARKDOWN">Markdown</option><option value="RICH_TEXT">富文本</option></select><small>先选择格式再录入正文，避免隐式转换丢失内容。</small></label>
      <label class="cms-wide">摘要<textarea v-model="form.summary" maxlength="1000" rows="3"></textarea></label>
      <label>封面 URL<input v-model="form.coverUrl" maxlength="2000"><button type="button" @click="openPicker('coverUrl')">从媒体库选择封面</button></label>
      <label v-if="type==='VIDEO'">m3u8 直链<input v-model="form.videoUrl" maxlength="2000" placeholder="https://media.example.com/tutorial.m3u8"></label>
      <label v-if="type==='FAQ'" class="cms-wide">FAQ 问题<textarea v-model="form.faqQuestion" maxlength="1000"></textarea></label>
    </div>
    <template v-if="type==='FAQ'"><label v-if="form.format==='MARKDOWN'">FAQ 答案（Markdown）<textarea v-model="form.faqAnswer" rows="12" maxlength="100000"></textarea></label><RichTextEditor v-else :key="`${form.id||'new'}-faq`" v-model="form.faqAnswer" label="FAQ 富文本答案" :disabled="!canEdit||busy" /></template>
    <template v-else><label v-if="form.format==='MARKDOWN'">Markdown 正文<textarea v-model="form.body" rows="16" maxlength="100000"></textarea></label><RichTextEditor v-else :key="`${form.id||'new'}-body`" v-model="form.body" :disabled="!canEdit||busy" /></template>
    <div class="cms-form-grid"><label>SEO 标题<input v-model="form.seoTitle" maxlength="200"></label><label>SEO 关键词<input v-model="form.seoKeywords" maxlength="500"></label><label class="cms-wide">SEO 描述<textarea v-model="form.seoDescription" maxlength="500"></textarea></label><label>SEO 分享图<input v-model="form.ogImage" maxlength="2000"><button type="button" @click="openPicker('ogImage')">从媒体库选择分享图</button></label><label><span><input v-model="form.ragEnabled" type="checkbox">允许投喂 AI</span><small>保存关闭开关会立即排除知识检索；仅已发布快照可索引。</small></label></div></fieldset>
    <div class="cms-actions"><button :disabled="busy" @click="preview=!preview">{{preview?'关闭预览':'预览草稿'}}</button><button v-if="canEdit" :disabled="busy" @click="save">保存草稿</button><button v-if="canEdit&&form.id&&form.status!=='ARCHIVED'" :disabled="busy||dirty" @click="act('publish')">发布当前草稿</button><button v-if="canEdit&&form.status==='PUBLISHED'" :disabled="busy||dirty" @click="act('status','OFFLINE')">下线</button><button v-if="canArchive&&form.id&&form.status!=='ARCHIVED'" :disabled="busy||dirty" @click="act('status','ARCHIVED')">归档</button><button v-if="canArchive&&form.status==='ARCHIVED'" :disabled="busy||dirty" @click="act('status','DRAFT')">恢复为草稿</button><button v-if="canEdit&&form.ragEnabled&&form.status==='PUBLISHED'" :disabled="busy||dirty" @click="act('reindex')">重新索引</button></div>
    <p role="status">{{dirty?'有未保存的修改':'内容已保存'}}<template v-if="form.status"> · {{form.status}}</template></p>
    <a v-if="form.status==='PUBLISHED'&&form.publishedSlug" :href="`/content/${form.publishedSlug}`" target="_blank" rel="noopener noreferrer">查看线上版本 ↗</a>
    <section v-if="form.indexJobs?.length" aria-label="索引状态"><h3>最近索引状态</h3><button :disabled="busy" @click="refreshIndex">刷新索引状态</button><p v-for="job in form.indexJobs" :key="job.id">{{job.status}} · {{job.errorMessage||job.finishedAt||job.startedAt}}</p></section>
    <article v-if="preview" class="cms-preview"><h2>{{form.title}}</h2><p>{{form.summary}}</p><img v-if="form.coverUrl" :src="form.coverUrl" alt="内容封面"><VideoPlayer v-if="type==='VIDEO'&&form.videoUrl" :src="form.videoUrl" /><h3 v-if="type==='FAQ'">{{form.faqQuestion}}</h3><div v-html="safeCmsHtml(type==='FAQ'?form.faqAnswer:form.body,form.format)"></div></article>
  </section><MediaPicker :visible="picker" @close="picker=false" @select="selectImage" />
</section></template>
