<script setup lang="ts">
import { computed } from 'vue';
import { componentRenderers } from '../component-registry';
import type { Block } from '../types';
const props = defineProps<{ block: Block }>();
const renderer = computed(() => componentRenderers[props.block.type]);
</script>
<template><component :is="renderer" v-if="renderer" :block="block" /><section v-else class="block component-error" role="alert">无法渲染未注册组件：{{ block.type }}</section></template>
