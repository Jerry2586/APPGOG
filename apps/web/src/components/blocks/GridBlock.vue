<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import type { Block } from '../../types';
const props = defineProps<{ block: Block }>();
const BlockRenderer = defineAsyncComponent(() => import('../BlockRenderer.vue'));
const style = computed(() => ({ '--cols': String(Math.min(4, Math.max(1, Number(props.block.props.columns || 1)))), '--gap': `${Math.min(80, Math.max(0, Number(props.block.props.gap || 0)))}px` }));
</script>
<template><section class="block block-grid"><div class="grid component-grid" :class="`stack-${block.props.stackAt || 'tablet'}`" :style="style"><BlockRenderer v-for="child in block.children" :key="child.id" :block="child" /></div></section></template>
