<script setup lang="ts">
import type { Block } from '../../types';
defineProps<{ block: Block }>();
</script>
<template><section class="block block-button" :class="`align-${block.props.align || 'center'}`"><a :class="['action',`action-${block.props.variant || 'primary'}`]" :href="block.props.url || '#'" :target="block.props.openInNewWindow ? '_blank' : undefined" :rel="block.props.openInNewWindow ? 'noopener noreferrer' : undefined">{{ block.props.text }}<span aria-hidden="true" v-if="block.props.openInNewWindow"> ↗</span><span class="sr-only" v-if="block.props.openInNewWindow">（在新窗口打开）</span></a></section></template>
