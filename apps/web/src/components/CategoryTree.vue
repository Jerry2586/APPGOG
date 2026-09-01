<script setup lang="ts">
import {computed} from 'vue';
import {useRoute} from 'vue-router';
import {categoryOptions,type CmsCategory} from '../cms-client';
const props=defineProps<{items:CmsCategory[];scope?:string}>(),route=useRoute(),flat=computed(()=>categoryOptions(props.items));
const queryKey=computed(()=>props.scope==='PRODUCT'?'productCategory':'category');
</script>
<template><ul class="category-tree"><li><RouterLink :to="{path:route.path,query:{...route.query,[queryKey]:undefined}}">全部分类</RouterLink></li><li v-for="node in flat" :key="node.id" :style="{paddingLeft:`${Math.min(node.depth,12)*12}px`}"><RouterLink :aria-current="route.query[queryKey]===node.id?'true':undefined" :to="{path:route.path,query:{...route.query,[queryKey]:node.id}}">{{node.name}}<span class="sr-only">，第 {{node.depth+1}} 层分类</span></RouterLink></li></ul></template>
