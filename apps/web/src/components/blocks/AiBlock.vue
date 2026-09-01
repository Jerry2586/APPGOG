<script setup lang="ts">
import type {Block} from '../../types';import AiPanel from '../AiPanel.vue';defineProps<{block:Block}>();
</script>
<template><section class="block data-block block-ai"><AiPanel :id="`ai-${block.id}`" :title="String(block.props.title||'APPGOG 智能助手')" :placeholder="String(block.props.placeholder||'描述你的问题')" /></section></template>
