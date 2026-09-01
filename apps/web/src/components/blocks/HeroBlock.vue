<script setup lang="ts">
import { computed, inject } from 'vue';
import type { Block } from '../../types';
const props = defineProps<{ block: Block }>();
const preview = inject('appgog-preview', false);
const heading = computed(() => ['h1', 'h2', 'h3'].includes(props.block.props.headingLevel) ? props.block.props.headingLevel : 'h1');
const heroStyle = computed(() => props.block.props.imageUrl ? { backgroundImage: `linear-gradient(#090b1688,#090b16bb),url("${String(props.block.props.imageUrl).replace(/["\\]/g, '')}")` } : {});
const buttons = computed(() => Array.isArray(props.block.props.buttons) ? props.block.props.buttons : []);
</script>
<template><section class="block block-hero" :class="{ 'compact-hero': block.props.compact }"><div class="hero" :class="`align-${block.props.align || 'center'}`" :style="heroStyle"><small v-if="block.props.eyebrow">{{ block.props.eyebrow }}</small><component :is="heading">{{ block.props.title }}</component><p>{{ block.props.text }}</p><p v-if="preview && block.props.publicationRequirement" class="publication-notice">待核实：{{ block.props.publicationRequirement }}</p><div v-if="buttons.length" class="hero-actions"><template v-for="(button,index) in buttons" :key="index"><a v-if="button.url" :class="['action',`action-${button.variant || 'primary'}`]" :href="button.url" rel="noreferrer">{{ button.label || button.text }}</a><span v-else class="action action-unavailable" aria-disabled="true">{{ button.label || button.text }} · 待配置</span></template></div></div></section></template>
