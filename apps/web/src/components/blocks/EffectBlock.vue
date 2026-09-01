<script setup lang="ts">
import { computed } from 'vue';
import type { Block } from '../../types';
const props = defineProps<{ block: Block }>();
const count = computed(() => Math.min(80, Math.max(0, Number(props.block.props.density || 0))));
const lowPower = matchMedia('(prefers-reduced-motion: reduce)').matches || (navigator.hardwareConcurrency || 8) <= 4;
const degraded = computed(() => lowPower || props.block.props.quality === 'low');
</script>
<template><section class="block effect-block" :class="{ 'disable-mobile': block.props.disabledOnMobile }" aria-hidden="true">
  <div v-if="block.type === 'particles' && block.props.enabled !== false" class="particles" :class="{ static: lowPower }"><i v-for="n in (lowPower ? Math.min(8,count) : count)" :key="n" :style="{ left: `${n * 37 % 100}%`, animationDelay: `${n % 7}s` }">✦</i></div>
  <div v-else class="fx" :class="{ degraded }"><div class="globe"></div><h2>{{ block.props.title }}</h2><p>{{ block.props.text }}</p></div>
</section></template>
