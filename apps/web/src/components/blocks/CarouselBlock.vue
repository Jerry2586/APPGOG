<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { Block } from '../../types';
const props = defineProps<{ block: Block }>();
const index = ref(0), paused = ref(false), touchStart = ref<number | null>(null);
let timer: ReturnType<typeof setInterval> | undefined;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const slides = computed(() => {
  if (Array.isArray(props.block.props.slides) && props.block.props.slides.length) return props.block.props.slides;
  const values = Array.isArray(props.block.props.images) ? props.block.props.images : String(props.block.props.images || '').split(/\r?\n|,/);
  return values.map((imageUrl: string) => ({ imageUrl: imageUrl.trim(), alt: '' })).filter((item: any) => item.imageUrl);
});
function go(next: number) { if (slides.value.length) index.value = (next + slides.value.length) % slides.value.length; }
function stop() { if (timer) clearInterval(timer); timer = undefined; }
function start() { stop(); if (props.block.props.autoplay && !reducedMotion && slides.value.length > 1) timer = setInterval(() => { if (!paused.value) go(index.value + 1); }, Number(props.block.props.intervalMs || 5000)); }
function touchEnd(event: TouchEvent) { const end = event.changedTouches[0]?.clientX; if (touchStart.value != null && end != null && Math.abs(end - touchStart.value) > 40) go(index.value + (end < touchStart.value ? 1 : -1)); touchStart.value = null; }
watch(() => [props.block.props.autoplay, props.block.props.intervalMs, slides.value.length], start);
onMounted(start); onUnmounted(stop);
</script>
<template><section class="block block-carousel"><div class="carousel" role="region" aria-roledescription="carousel" :aria-label="block.props.title || '轮播图'" @mouseenter="paused=true" @mouseleave="paused=false" @focusin="paused=true" @focusout="paused=false" @touchstart.passive="touchStart=$event.touches[0]?.clientX ?? null" @touchend.passive="touchEnd">
  <template v-if="slides.length"><article v-for="(slide,i) in slides" v-show="i === index" :key="i" class="carousel-slide" :style="{ backgroundImage: `linear-gradient(#090b1666,#090b16aa),url(${slide.imageUrl})` }" :aria-hidden="i !== index"><div><h2>{{ slide.title || block.props.title }}</h2><p>{{ slide.text || block.props.text }}</p><a v-if="slide.url" :href="slide.url">查看详情</a></div><span class="sr-only">{{ slide.alt }}</span></article>
  <button v-if="block.props.showArrows && slides.length > 1" class="carousel-prev" type="button" @click="go(index-1)"><span aria-hidden="true">‹</span><span class="sr-only">上一张</span></button><button v-if="block.props.showArrows && slides.length > 1" class="carousel-next" type="button" @click="go(index+1)"><span aria-hidden="true">›</span><span class="sr-only">下一张</span></button>
  <div v-if="block.props.showDots && slides.length > 1" class="dots"><button v-for="(_,i) in slides" :key="i" type="button" :class="{ on:i===index }" :aria-label="`转到第 ${i+1} 张`" :aria-current="i===index ? 'true' : undefined" @click="go(i)" /></div></template>
  <div v-else class="component-empty">尚未配置轮播图片</div><p class="sr-only" aria-live="polite">第 {{ index + 1 }} 张，共 {{ slides.length }} 张</p>
</div></section></template>
