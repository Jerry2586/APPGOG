<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api, currentAdminAccount } from '../api';
import { mediaError, useMediaLibrary, type MediaAsset } from '../media-client';

const { items, total, page, pageCount, search, folder, state, loading, error, load } = useMediaLibrary();
const uploading = ref(false), busy = ref(false), progress = ref(0), file = ref<File | null>(null);
const fileInput = ref<HTMLInputElement | null>(null), dialog = ref(false);
const upload = reactive({ altText: '', folder: 'general' });
const editForm = reactive({ id: '', altText: '', folder: 'general' });
const admin = currentAdminAccount(), roleRank = { VIEWER: 0, EDITOR: 1, ADMIN: 2, SUPER_ADMIN: 3 } as const;
const canUpload = computed(() => !!admin && roleRank[admin.role] >= roleRank.EDITOR);
const canArchive = computed(() => !!admin && roleRank[admin.role] >= roleRank.ADMIN);
const formatSize = (value: number) => value < 1048576 ? `${(value / 1024).toFixed(1)} KiB` : `${(value / 1048576).toFixed(2)} MiB`;

function resetFile() { file.value = null; if (fileInput.value) fileInput.value.value = ''; }
function chooseFile(event: Event) {
  const selected = (event.target as HTMLInputElement).files?.[0] || null;
  if (selected && (!selected.size || selected.size > 10 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(selected.type))) {
    ElMessage.error('请选择不超过 10 MiB 的 JPEG、PNG、GIF 或 WebP 图片'); resetFile(); return;
  }
  file.value = selected;
}
async function send() {
  if (!canUpload.value || uploading.value || !file.value) return;
  uploading.value = true; progress.value = 0;
  try {
    const data = new FormData();
    data.append('file', file.value); data.append('altText', upload.altText); data.append('folder', upload.folder.trim().toLowerCase());
    await api.post('/admin/media', data, { onUploadProgress: event => { progress.value = Math.round((event.progress || 0) * 100); } });
    resetFile(); upload.altText = ''; ElMessage.success('图片已通过验证并上传'); await load(1);
  } catch (failure) { ElMessage.error(mediaError(failure)); }
  finally { uploading.value = false; }
}
function edit(item: MediaAsset) { Object.assign(editForm, { id: item.id, altText: item.altText || '', folder: item.folder }); dialog.value = true; }
async function save() {
  if (busy.value) return;
  busy.value = true;
  try { await api.patch(`/admin/media/${editForm.id}`, { altText: editForm.altText, folder: editForm.folder.trim().toLowerCase() }); dialog.value = false; ElMessage.success('媒体信息已更新'); await load(); }
  catch (failure) { ElMessage.error(mediaError(failure)); } finally { busy.value = false; }
}
async function changeArchive(item: MediaAsset) {
  if (busy.value) return;
  busy.value = true;
  try {
    if (!item.archivedAt) {
      await ElMessageBox.confirm('归档不会物理删除文件，已有页面 URL 仍可访问。确定归档？', '归档媒体', { type: 'warning' });
      await api.delete(`/admin/media/${item.id}`);
    } else await api.post(`/admin/media/${item.id}/restore`, {});
    ElMessage.success(item.archivedAt ? '媒体已恢复' : '媒体已归档'); await load();
  } catch (failure) { if (failure !== 'cancel' && failure !== 'close') ElMessage.error(mediaError(failure)); }
  finally { busy.value = false; }
}
async function copy(url: string) {
  try { await navigator.clipboard.writeText(url); ElMessage.success('公开 URL 已复制'); }
  catch { ElMessage.error('浏览器不允许复制，请从卡片中的 URL 文本框手动复制'); }
}
onMounted(() => load());
</script>

<template><div class="media-manager">
  <div class="resource-head"><div><h1>媒体资源库</h1><p>APPGOG 独立图片存储；图片会经过完整解码验证。</p></div><b>{{ total }} 项</b></div>
  <form v-if="canUpload" class="media-upload" @submit.prevent="send">
    <label>图片<input ref="fileInput" type="file" accept="image/jpeg,image/png,image/gif,image/webp" :disabled="uploading" @change="chooseFile"></label>
    <label>替代文字<input v-model="upload.altText" maxlength="300" :disabled="uploading" placeholder="说明图片内容"></label>
    <label>文件夹<input v-model="upload.folder" required maxlength="50" :disabled="uploading" placeholder="general"></label>
    <button :disabled="uploading || !file">{{ uploading ? (progress < 100 ? `上传 ${progress}%` : '验证与保存中…') : '安全上传' }}</button>
  </form>
  <form class="media-filters" @submit.prevent="load(1)"><input v-model="search" aria-label="搜索媒体" maxlength="100" placeholder="文件名或替代文字"><input v-model="folder" aria-label="文件夹筛选" maxlength="50" placeholder="文件夹"><select v-model="state" aria-label="资源状态"><option value="active">使用中</option><option value="archived">已归档</option><option value="all">全部</option></select><button>筛选</button></form>
  <p v-if="error" role="alert">{{ error }} <button @click="load()">重试</button></p>
  <p v-else-if="loading" role="status">正在读取媒体库…</p>
  <div v-else-if="items.length" class="media-grid"><article v-for="item in items" :key="item.id" :class="{ archived: item.archivedAt }">
    <img :src="item.publicUrl" :alt="item.altText || ''" loading="lazy"><div><b :title="item.originalName">{{ item.originalName }}</b><small>{{ item.width }}×{{ item.height }} · {{ formatSize(item.byteSize) }} · {{ item.folder }}</small><small v-if="item.createdBy">上传：{{ item.createdBy.displayName }}</small></div>
    <input class="media-url" :value="item.publicUrl" readonly :aria-label="`${item.originalName} 公开 URL`">
    <div class="media-actions"><button @click="copy(item.publicUrl)">复制 URL</button><button v-if="canUpload" :disabled="busy" @click="edit(item)">编辑</button><button v-if="canArchive" :disabled="busy" @click="changeArchive(item)">{{ item.archivedAt ? '恢复' : '归档' }}</button></div>
  </article></div><p v-else class="component-empty">没有符合条件的媒体资源</p>
  <nav class="media-pagination" aria-label="媒体分页"><button :disabled="loading || page <= 1" @click="load(page - 1)">上一页</button><span>第 {{ page }} / {{ pageCount }} 页 · 共 {{ total }} 项</span><button :disabled="loading || page >= pageCount" @click="load(page + 1)">下一页</button></nav>
  <el-dialog v-model="dialog" title="编辑媒体信息" width="min(520px, 92vw)"><el-form label-position="top"><el-form-item label="替代文字"><el-input v-model="editForm.altText" maxlength="300" /></el-form-item><el-form-item label="文件夹"><el-input v-model="editForm.folder" maxlength="50" /></el-form-item></el-form><template #footer><el-button :disabled="busy" @click="dialog = false">取消</el-button><el-button type="primary" :loading="busy" @click="save">保存</el-button></template></el-dialog>
</div></template>
