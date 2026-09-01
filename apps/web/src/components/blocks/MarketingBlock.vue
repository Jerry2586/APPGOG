<script setup lang="ts">
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { Block } from '../../types';
import { claimPopup, marketingWindow, matchesPage } from '../../operations-client';
import { activeMarketingPopup, operatingCampaigns, operationsClock } from '../../operations-state';
const input = defineProps<{ block: Block }>(), route = useRoute(), preview = inject('appgog-preview', false);
const campaign = computed(() => operatingCampaigns.value.find(item => item.id === input.block.props.campaignId));
const expectedKind: Record<string,string> = { popup:'POPUP', countdown:'COUNTDOWN', sale:'BANNER' };
const bound = computed(() => !!input.block.props.campaignId);
const available = computed(() => !bound.value || (campaign.value?.kind === expectedKind[input.block.type] && campaign.value?.enabled === true));
const p = computed(() => bound.value ? { ...campaign.value?.config, startAt: campaign.value?.startAt, endAt: campaign.value?.endAt, timezone: campaign.value?.timezone } : input.block.props);
const showPopup = ref(false), tick = ref(Date.now()), mounted = ref(false), closeButton = ref<HTMLButtonElement>(), dialogPanel = ref<HTMLElement>();
let timer: ReturnType<typeof setInterval>, previousFocus: HTMLElement | null = null;
const now = computed(() => tick.value + (bound.value ? operationsClock.value : 0));
const windowState = computed(() => marketingWindow(p.value.startAt, p.value.endAt, p.value.timezone || 'Asia/Shanghai', now.value));
const pageAllowed = computed(() => matchesPage(p.value.pageRules || '*', route.path));
const live = computed(() => available.value && windowState.value.valid && windowState.value.active && pageAllowed.value);
const popupKey = computed(() => bound.value ? 'appgog.popup.campaign.' + input.block.props.campaignId : 'popup_' + input.block.id);
const remaining = computed(() => {
  const duration = Math.max(0, windowState.value.until - now.value);
  if (!Number.isFinite(duration)) return '请配置有效结束时间';
  if (!duration) return p.value.expiredText || '活动已结束';
  return `${Math.floor(duration / 86400000)}天 ${String(Math.floor(duration / 3600000) % 24).padStart(2,'0')}:${String(Math.floor(duration / 60000) % 60).padStart(2,'0')}:${String(Math.floor(duration / 1000) % 60).padStart(2,'0')}`;
});
function close() { showPopup.value = false; if (activeMarketingPopup.value === input.block.id) activeMarketingPopup.value = null; if (previousFocus?.isConnected) previousFocus.focus(); previousFocus = null; }
async function considerPopup() {
  if (preview || !mounted.value || input.block.type !== 'popup') return;
  if (!live.value) { close(); return; }
  if (showPopup.value || activeMarketingPopup.value) return;
  let storage: Storage | undefined; try { storage = localStorage; } catch { /* restricted storage */ }
  if (!claimPopup(popupKey.value, Number(p.value.frequencyHours || 24), now.value, storage)) return;
  activeMarketingPopup.value = input.block.id; previousFocus = document.activeElement as HTMLElement; showPopup.value = true;
  await nextTick(); closeButton.value?.focus();
}
watch([live, popupKey, mounted, activeMarketingPopup, () => p.value.frequencyHours], considerPopup);
function keydown(event: KeyboardEvent) {
  if (!showPopup.value) return;
  if (event.key === 'Escape') { event.preventDefault(); close(); return; }
  if (event.key !== 'Tab') return;
  const focusable = Array.from(dialogPanel.value?.querySelectorAll<HTMLElement>('button,a[href]') || []);
  const first = focusable[0], last = focusable.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
onMounted(() => { mounted.value = true; timer = setInterval(() => { tick.value = Date.now(); considerPopup(); }, 1000); document.addEventListener('keydown', keydown); });
onUnmounted(() => { clearInterval(timer); close(); document.removeEventListener('keydown', keydown); });
</script>
<template>
  <section class="block marketing-block">
    <p v-if="preview && bound" class="component-empty">营销活动绑定：{{ input.block.props.campaignId }}（线上按活动开关、时间和页面规则展示）</p>
    <div v-else-if="preview && input.block.type === 'popup'" class="marketing-preview"><h3>{{ p.title }}</h3><p>{{ p.text }}</p><small>弹窗预览，不记录访客频率</small></div>
    <div v-else-if="input.block.type === 'sale' && (live || preview)" class="banner"><strong>{{ p.title }}</strong> {{ p.text }} <a v-if="p.url && p.url !== '#'" :href="p.url" target="_blank" rel="noopener noreferrer">{{ p.buttonText || '查看活动' }}</a></div>
    <div v-else-if="input.block.type === 'countdown' && (preview || live || (!bound && available && pageAllowed && windowState.valid && windowState.expired && p.expiredBehavior !== 'hide'))" class="banner countdown" role="timer"><strong v-if="!windowState.expired">{{ p.title }}</strong>　<a v-if="windowState.expired && p.expiredBehavior === 'link' && p.expiredUrl" :href="p.expiredUrl" target="_blank" rel="noopener noreferrer">{{ p.expiredText || '活动已结束' }}</a><template v-else>{{ remaining }}</template><small v-if="p.timezone">{{ p.timezone }}</small></div>
    <Teleport v-else-if="showPopup" to="body"><div class="popup marketing-popup" role="dialog" aria-modal="true" :aria-labelledby="`popup-title-${input.block.id}`"><div ref="dialogPanel"><button ref="closeButton" type="button" @click="close"><span aria-hidden="true">×</span><span class="sr-only">关闭活动弹窗</span></button><h2 :id="`popup-title-${input.block.id}`">{{ p.title }}</h2><p>{{ p.text }}</p><a v-if="p.url && p.url !== '#'" class="action action-primary" :href="p.url" target="_blank" rel="noopener noreferrer">{{ p.buttonText || '查看详情' }}</a></div></div></Teleport>
  </section>
</template>
