<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'; import { useRoute } from 'vue-router'; import { api } from '../api'; import BlockRenderer from '../components/BlockRenderer.vue'; import type { Block } from '../types';
import { siteSlug, siteMetadata } from '../site-client';
const route=useRoute(), blocks=ref<Block[]>([]), missing=ref(false), loading=ref(false), loadError=ref('');
let generation=0, alive=true;
function setMeta(selector:string,attribute:string,value:string){let element=document.head.querySelector(selector) as HTMLMetaElement|null;if(!element){element=document.createElement('meta');const [key,name]=attribute.split('=');element.setAttribute(key,name);document.head.appendChild(element)}element.setAttribute('content',value)}
function metadata(page?: Record<string, any>, notFound = false) {
  const meta = siteMetadata(page, notFound); document.title = meta.title;
  for (const [key, value] of Object.entries({ description: meta.description, keywords: meta.keywords, robots: meta.robots })) setMeta(`meta[name="${key}"]`, `name=${key}`, value);
  for (const [key, value] of Object.entries({ title: meta.title, description: meta.description, image: meta.image })) setMeta(`meta[property="og:${key}"]`, `property=og:${key}`, value);
}
async function load(){const request=++generation;loading.value=true;missing.value=false;loadError.value='';metadata();try{blocks.value=[];const slug=siteSlug(route.params.slug);const page=(await api.get(`/public/pages/${slug}`)).data;if(!alive||request!==generation)return;if(page.routeType==='REDIRECT'){location.assign(page.redirectUrl);return}blocks.value=page.layout as Block[];metadata(page)}catch(failure:any){if(alive&&request===generation){missing.value=failure?.response?.status===404;loadError.value=missing.value?'':'页面服务暂时不可用，请稍后重试';metadata(undefined,true)}}finally{if(alive&&request===generation)loading.value=false}}
onMounted(load);watch(()=>route.fullPath,load);onUnmounted(()=>{alive=false;generation++});
</script>
<template><main class="site" :aria-busy="loading"><p v-if="loading" role="status" class="component-empty">正在加载页面…</p><BlockRenderer v-for="b in blocks" :key="b.id" :block="b"/><div v-if="missing" class="empty"><h1>页面未找到</h1><a href="/">返回首页</a></div><div v-else-if="loadError" class="empty" role="alert"><p>{{loadError}}</p><button @click="load">重试加载</button></div></main></template>
