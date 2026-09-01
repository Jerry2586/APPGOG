<script setup lang="ts">
import { watch } from 'vue';
import { useMediaLibrary, type MediaAsset } from '../media-client';
const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ close: []; select: [url: string, asset: MediaAsset] }>();
const { items, total, page, pageCount, search, loading, error, load } = useMediaLibrary();
function pick(asset: MediaAsset) { emit('select', asset.publicUrl, asset); emit('close'); }
function closeDialog(value: boolean) { if (!value) emit('close'); }
watch(() => props.visible, value => { if (value) load(1); }, { immediate: true });
</script>
<template><el-dialog :model-value="visible" class="media-picker-dialog" title="从媒体库选择图片" width="min(900px, 92vw)" @update:model-value="closeDialog">
  <form class="media-picker-search" @submit.prevent="load(1)"><el-input v-model="search" aria-label="搜索图片" maxlength="100" placeholder="文件名或替代文字" /><el-button native-type="submit">搜索</el-button></form>
  <p v-if="error" role="alert">{{ error }} <button @click="load()">重试</button></p><p v-else-if="loading" role="status">正在读取…</p>
  <div v-else class="media-picker-grid"><button v-for="item in items" :key="item.id" type="button" @click="pick(item)"><img :src="item.publicUrl" :alt="item.altText || ''" loading="lazy"><span>{{ item.originalName }}</span></button></div>
  <p v-if="!loading && !error && !items.length">媒体库中没有可用图片</p>
  <nav class="media-pagination" aria-label="选图分页"><button :disabled="loading || page <= 1" @click="load(page - 1)">上一页</button><span>{{ page }} / {{ pageCount }} 页 · {{ total }} 项</span><button :disabled="loading || page >= pageCount" @click="load(page + 1)">下一页</button></nav>
</el-dialog></template>
