<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api';
import { themeStyles, type ColorMode, type ThemeData } from '../operations-client';
import { operatingCampaigns, operationsClock } from '../operations-state';
import { createPluginRuntime, injectTrustedSnippet } from '../plugin-runtime';
import BlockRenderer from './BlockRenderer.vue';
const route = useRoute(), isPublic = computed(() => !route.path.startsWith('/admin') && !route.meta.admin);
const theme = ref<ThemeData | null>(null);
const media = matchMedia('(prefers-color-scheme: dark)');
let preference: ColorMode | '' = '', generation = 0, alive = true, timer: ReturnType<typeof setInterval>, controller: AbortController | undefined;
try { const saved = localStorage.getItem('appgog.theme.preference'); if (saved === 'light' || saved === 'dark') preference = saved; } catch { /* optional persistence */ }
const plugins = createPluginRuntime({ run: injectTrustedSnippet, reload: () => location.reload(), isPublic: () => isPublic.value });
function applyTheme() { if (!isPublic.value) return; const value = themeStyles(theme.value, preference, media.matches); document.documentElement.dataset.theme = value.mode; for (const [key, color] of Object.entries(value.style)) document.documentElement.style.setProperty(key, color); }
function resetTheme() { for (const key of Object.keys(themeStyles(null, '', true).style)) document.documentElement.style.removeProperty(key); delete document.documentElement.dataset.theme; }
function toggle() { if (!isPublic.value) return; preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('appgog.theme.preference', preference); } catch { /* optional */ } applyTheme(); }
function storage(event: StorageEvent) { if (event.key !== 'appgog.theme.preference') return; preference = event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : ''; applyTheme(); }
async function refresh() {
  controller?.abort(); controller = new AbortController(); const request = ++generation;
  if (!isPublic.value) { operatingCampaigns.value = []; theme.value = null; plugins.cancel(); resetTheme(); return; }
  try { const { data } = await api.get('/public/bootstrap', { signal: controller.signal }); if (!alive || request !== generation || !isPublic.value) return;
    const serverTime = Date.parse(data.serverTime); operationsClock.value = Number.isFinite(serverTime) ? serverTime - Date.now() : 0;
    theme.value = data.theme; operatingCampaigns.value = Array.isArray(data.campaigns) ? data.campaigns : []; applyTheme(); plugins.sync(data.snippets || []);
  } catch { if (request === generation) { operatingCampaigns.value = []; plugins.cancel(); } }
}
watch(() => route.fullPath, refresh, { immediate: true });
onMounted(() => { timer = setInterval(refresh, 15000); window.addEventListener('appgog-theme-toggle', toggle); window.addEventListener('storage', storage); media.addEventListener('change', applyTheme); });
onUnmounted(() => { alive = false; generation++; controller?.abort(); clearInterval(timer); plugins.stop(); operatingCampaigns.value = []; resetTheme(); window.removeEventListener('appgog-theme-toggle', toggle); window.removeEventListener('storage', storage); media.removeEventListener('change', applyTheme); });
const effect = computed(() => ({ id: 'global-theme-particles', type: 'particles', props: { enabled: true, density: theme.value?.effects?.density ?? 20, disabledOnMobile: theme.value?.effects?.disabledOnMobile !== false }, children: [] }));
</script>
<template><div v-if="isPublic && theme?.effects?.particles" class="global-theme-effect"><BlockRenderer :block="effect" /></div></template>
