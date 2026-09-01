<script setup lang="ts">
import { computed,onUnmounted,ref,watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api';
import { safeCmsHtml } from '../cms-client';
import VideoPlayer from '../components/VideoPlayer.vue';
const route=useRoute(),item=ref<any>(null),loading=ref(false),error=ref('');let requestId=0;
const html=computed(()=>safeCmsHtml(item.value?.html||'', 'RICH_TEXT')), faqHtml=computed(()=>safeCmsHtml(item.value?.faqHtml||'','RICH_TEXT'));
const originalTitle=document.title;let undoMeta:Array<()=>void>=[];
function clearSeo(){document.title=originalTitle;for(const undo of undoMeta)undo();undoMeta=[]}
function meta(key:string,content:string,property=false){const attribute=property?'property':'name';let node=document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);const original=node?.getAttribute('content');if(!node){node=document.createElement('meta');node.setAttribute(attribute,key);document.head.append(node)}const current=node;undoMeta.push(()=>{if(original===undefined)current.remove();else current.setAttribute('content',original||'')});node.content=content}
async function load(){const request=++requestId;loading.value=true;item.value=null;error.value='';clearSeo();try{const slug=Array.isArray(route.params.slug)?route.params.slug.join('/'):route.params.slug;const {data}=await api.get(`/public/contents/${String(slug).split('/').map(encodeURIComponent).join('/')}`);if(request!==requestId)return;item.value=data;document.title=data.seoTitle||`${data.title} · APPGOG`;meta('description',data.seoDescription||data.summary||'');meta('keywords',data.seoKeywords||'');meta('og:title',data.seoTitle||data.title,true);meta('og:description',data.seoDescription||data.summary||'',true);meta('og:image',data.ogImage||data.coverUrl||'',true);meta('og:type','article',true)}catch(e:any){if(request===requestId)error.value=e?.response?.status===404?'内容不存在或已下线':'内容暂时无法加载，请稍后重试'}finally{if(request===requestId)loading.value=false}}
watch(()=>route.params.slug,load,{immediate:true});onUnmounted(()=>{requestId++;clearSeo()});
</script>
<template><main class="article cms-article"><RouterLink to="/">← 返回首页</RouterLink><p v-if="loading" role="status">正在加载内容…</p><p v-else-if="error" role="alert">{{error}} <button @click="load">重试</button></p><article v-else-if="item"><nav v-if="item.breadcrumb?.length" aria-label="内容分类路径"><ol><li v-for="node in item.breadcrumb" :key="node.id">{{node.name}}</li></ol></nav><h1>{{item.title}}</h1><p class="summary">{{item.summary}}</p><img v-if="item.coverUrl" class="cms-cover" :src="item.coverUrl" :alt="item.title"><VideoPlayer v-if="item.type==='VIDEO'&&item.videoUrl" :src="item.videoUrl" :poster="item.coverUrl||undefined"/><section v-if="item.type==='FAQ'" class="markdown"><h2>{{item.faqQuestion}}</h2><div v-html="faqHtml"></div></section><div v-else class="markdown" v-html="html"></div></article></main></template>
