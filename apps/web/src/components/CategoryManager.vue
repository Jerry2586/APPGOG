<script setup lang="ts">
import { computed,onMounted,onUnmounted,ref } from 'vue';
import { ElMessage,ElMessageBox } from 'element-plus';
import { api,currentAdminAccount } from '../api';
import { categoryOptions,type CmsCategory } from '../cms-client';
import { mediaError } from '../media-client';
const props=withDefaults(defineProps<{scope?:'CONTENT'|'PRODUCT'}>(),{scope:'CONTENT'});
const role=currentAdminAccount()?.role, canEdit=!!role&&role!=='VIEWER', canDelete=role==='ADMIN'||role==='SUPER_ADMIN';
const nodes=ref<CmsCategory[]>([]),form=ref<any>(null),error=ref(''),busy=ref(false),saved=ref('');
const flat=computed(()=>categoryOptions(nodes.value)), parents=computed(()=>categoryOptions(nodes.value,form.value?.id));
const dirty=computed(()=>!!form.value&&JSON.stringify(form.value)!==saved.value);
defineExpose({hasUnsavedChanges:()=>dirty.value,isBusy:()=>busy.value});
function beforeUnload(event:BeforeUnloadEvent){if(dirty.value){event.preventDefault();event.returnValue=''}}
async function load(){try{nodes.value=(await api.get('/admin/category',{params:{scope:props.scope}})).data;error.value=''}catch(e){error.value=mediaError(e)}}
async function edit(node?:CmsCategory,parentId:string|null=null){if(form.value&&JSON.stringify(form.value)!==saved.value){try{await ElMessageBox.confirm('放弃当前分类修改？','未保存')}catch{return}}form.value=node?{...node}:{name:'',slug:'',description:'',parentId,scope:props.scope,sort:0};saved.value=JSON.stringify(form.value)}
async function save(){if(!canEdit||busy.value)return;busy.value=true;try{const value=form.value,data={name:value.name,slug:value.slug,description:value.description||'',parentId:value.parentId||null,sort:Number(value.sort),scope:props.scope,...(value.id?{baseRevision:value.revision}:{})};if(value.id)await api.patch(`/admin/category/${value.id}`,data);else await api.post('/admin/category',data);form.value=null;await load();ElMessage.success('分类已保存')}catch(e){ElMessage.error(mediaError(e))}finally{busy.value=false}}
async function remove(node:CmsCategory){try{await ElMessageBox.confirm('仅无子分类、无内容或商品引用的分类可以删除，删除后不可恢复。','删除分类');busy.value=true;await api.delete(`/admin/category/${node.id}`,{data:{baseRevision:node.revision}});if(form.value?.id===node.id)form.value=null;await load()}catch(e){if(e!=='cancel'&&e!=='close')ElMessage.error(mediaError(e))}finally{busy.value=false}}
onMounted(()=>{void load();window.addEventListener('beforeunload',beforeUnload)});
onUnmounted(()=>window.removeEventListener('beforeunload',beforeUnload));
</script>
<template><section class="cms-manager"><header class="cms-heading"><div><h1>{{scope==='PRODUCT'?'商品分类树':'无限分类树'}}</h1><p>分类可任意层级嵌套；移动时保留子树，服务端检查循环和引用。</p></div><button v-if="canEdit" @click="edit()">新建根分类</button></header><p v-if="error" role="alert">{{error}} <button @click="load">重试</button></p>
<ol class="cms-category-list" :aria-label="scope==='PRODUCT'?'商品分类树':'内容分类树'"><li v-for="node in flat" :key="node.id" :style="{paddingLeft:`${Math.min(node.depth,12)*12}px`}"><span>{{node.name}} <small>第 {{node.depth+1}} 层 · 排序 {{node.sort}}</small></span><div><button v-if="canEdit" :disabled="busy" @click="edit(node)">编辑 / 移动</button><button v-if="canEdit" :disabled="busy" @click="edit(undefined,node.id)">添加子分类</button><button v-if="canDelete" :disabled="busy" @click="remove(node)">删除</button></div></li></ol><p v-if="!nodes.length&&!error">暂无分类</p>
<form v-if="form" class="cms-editor" @submit.prevent="save"><h2>分类资料</h2><fieldset :disabled="busy||!canEdit"><label>分类名称<input v-model="form.name" required maxlength="100"></label><label>唯一标识<input v-model="form.slug" required maxlength="160"></label><label>父分类<select v-model="form.parentId"><option :value="null">根分类</option><option v-for="node in parents" :key="node.id" :value="node.id">{{'—'.repeat(Math.min(12,node.depth))}} {{node.name}}</option></select></label><label>排序<input v-model.number="form.sort" type="number" min="-1000000" max="1000000" required></label><label>说明<textarea v-model="form.description" maxlength="1000"></textarea></label><button>保存分类</button></fieldset></form></section></template>
