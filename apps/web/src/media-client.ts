import { computed, onUnmounted, ref } from 'vue';
import { api } from './api';

export type MediaAsset = {
  id: string; originalName: string; mimeType: string; byteSize: number;
  width: number; height: number; altText?: string | null; folder: string;
  archivedAt?: string | null; publicUrl: string; createdBy?: { displayName: string } | null;
};

/** Media paths belong to the API origin, which can differ from the Web origin. */
export function resolveMediaUrl(path: string, apiBase: string, webOrigin: string) {
  if (!/^\/api\/v1\/public\/media\/[a-zA-Z0-9_-]+$/.test(path)) throw new Error('媒体地址格式无效');
  const base = new URL(apiBase, webOrigin);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('媒体 API 地址无效');
  return new URL(path, base.origin).href;
}

export function mediaError(error: any) {
  const message = error?.response?.data?.message;
  if (Array.isArray(message)) return message.join('；');
  if (typeof message === 'string') return message;
  return '媒体操作失败，请检查网络后重试';
}

export function appendMediaValue(existing: unknown, key: string, control: string | undefined, asset: Pick<MediaAsset, 'publicUrl' | 'altText'>) {
  if (control === 'url-list') {
    const list = Array.isArray(existing) ? existing : String(existing || '').split(/\r?\n|,/).map(item => item.trim()).filter(Boolean);
    if (list.includes(asset.publicUrl)) return list;
    if (list.length >= 30) throw new Error('最多添加 30 张图片');
    return [...list, asset.publicUrl];
  }
  if (control === 'json' && key === 'slides') {
    const list = Array.isArray(existing) ? existing : [];
    if (list.length >= 30) throw new Error('最多添加 30 个轮播项');
    return [...list, { imageUrl: asset.publicUrl, alt: asset.altText || '' }];
  }
  return asset.publicUrl;
}

export function useMediaLibrary() {
  const items = ref<MediaAsset[]>([]), total = ref(0), page = ref(1), limit = 30;
  const search = ref(''), folder = ref(''), state = ref<'active' | 'archived' | 'all'>('active');
  const loading = ref(false), error = ref('');
  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / limit)));
  let revision = 0;
  onUnmounted(() => { revision += 1; });
  async function load(nextPage = page.value): Promise<boolean> {
    const request = ++revision;
    page.value = nextPage; loading.value = true; error.value = '';
    try {
      const { data } = await api.get('/admin/media', { params: {
        page: nextPage, limit, search: search.value.trim() || undefined,
        folder: folder.value.trim().toLowerCase() || undefined, state: state.value
      } });
      if (request !== revision) return false;
      total.value = data.total;
      if (nextPage > pageCount.value) return load(pageCount.value);
      items.value = data.items.map((item: MediaAsset) => ({ ...item,
        publicUrl: resolveMediaUrl(item.publicUrl, String(api.defaults.baseURL || '/api/v1'), location.origin)
      }));
      return true;
    } catch (failure) {
      if (request === revision) { error.value = mediaError(failure); items.value = []; total.value = 0; }
      return false;
    } finally { if (request === revision) loading.value = false; }
  }
  return { items, total, page, pageCount, search, folder, state, loading, error, load };
}
