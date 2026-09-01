<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { safeCmsHtml } from '../../cms-client';
import { api } from '../../api';
import type { Block } from '../../types';
import CategoryTree from '../CategoryTree.vue';
const props = defineProps<{ block: Block }>();
const rows = ref<any[]>([]), loading = ref(false), error = ref('');
const route=useRoute(),router=useRouter(),search=ref(''),page=ref(1),total=ref(0);
const isCms=computed(()=>['contents','faq'].includes(props.block.type));
const pageSize=computed(()=>Math.min(100,Math.max(1,Number(props.block.props.limit)||8)));
let loadId=0;
const columns = computed(() => ({ '--cols': String(Math.min(4, Math.max(1, Number(props.block.props.columns || 1)))) }));
async function load() {
  const request=++loadId;
  const type = props.block.type;
  if (!['contents', 'faq', 'categories'].includes(type)) return;
  loading.value = true; error.value = '';
  try {
    if (type === 'categories') rows.value = (await api.get('/public/categories', { params: { scope: props.block.props.scope } })).data;
    else {const {data}=await api.get('/public/content-search', { params: { type: type === 'faq' ? 'FAQ' : props.block.props.contentType, categoryId: (typeof route.query.category==='string'?route.query.category:props.block.props.categoryId)||undefined, search: typeof route.query.search==='string'?route.query.search:undefined, page:page.value, sort: props.block.props.sort, limit: pageSize.value } });if(request!==loadId)return;rows.value=data.items;total.value=data.total;}
  } catch { if(request===loadId)error.value = '内容服务暂时不可用'; }
  finally { if(request===loadId)loading.value = false; }
}
async function runSearch(){const next=search.value.trim();if(next===(route.query.search||'')){page.value=1;await load()}else await router.replace({path:route.path,query:{...route.query,search:next||undefined}})}
async function turnPage(offset:number){page.value+=offset;await load()}
watch(()=>[props.block.type,JSON.stringify(props.block.props),route.query.category,route.query.search],()=>{search.value=typeof route.query.search==='string'?route.query.search:'';page.value=1;void load()},{immediate:true});
onUnmounted(()=>{loadId++});
</script>
<template><section class="block data-block" :class="[`block-${block.type}`,`style-${block.props.cardStyle || ''}`,`hover-${block.props.hoverEffect || ''}`]">
  <form v-if="isCms" class="cms-search" @submit.prevent="runSearch"><label class="sr-only" :for="`search-${block.id}`">搜索知识内容</label><input :id="`search-${block.id}`" v-model="search" maxlength="100" placeholder="搜索标题、摘要、正文或分类"><button>搜索</button></form>
  <template v-if="block.type === 'categories'"><h2>{{ block.props.title }}</h2><p v-if="loading" role="status">正在加载分类…</p><p v-else-if="error" class="component-error">{{ error }}</p><CategoryTree v-else-if="rows.length"  :items="rows" :scope="String(block.props.scope||'CONTENT')"/><p v-else class="component-empty">暂无分类</p></template>
  <template v-else-if="block.type === 'contents'"><h2>{{ block.props.title }}</h2><p v-if="loading" role="status">正在加载内容…</p><p v-else-if="error" class="component-error">{{ error }}</p><div v-else-if="rows.length" class="list" :style="columns"><a v-for="item in rows" :key="item.id" :href="`/content/${item.slug}`"><b>{{ item.title }}</b><small>{{ item.summary }}</small></a></div><p v-else class="component-empty">暂无内容</p></template>
  <template v-else-if="block.type === 'faq'"><h2>{{ block.props.title }}</h2><p v-if="loading" role="status">正在加载常见问题…</p><p v-else-if="error" class="component-error">{{ error }}</p><div v-else-if="rows.length" class="faq"><details v-for="item in rows" :key="item.id"><summary>{{ item.faqQuestion }}</summary><div v-html="safeCmsHtml(item.faqHtml||'','RICH_TEXT')"></div><a :href="`/content/${item.slug}`">查看详情</a></details></div><p v-else class="component-empty">暂无常见问题</p></template>
  <nav v-if="isCms" class="cms-pagination" aria-label="知识内容分页"><button :disabled="loading||page<=1" @click="turnPage(-1)">上一页</button><span>{{page}} / {{Math.max(1,Math.ceil(total/pageSize))}}</span><button :disabled="loading||page*pageSize>=total" @click="turnPage(1)">下一页</button><button v-if="error" @click="load">重试加载</button></nav>
</section></template>
