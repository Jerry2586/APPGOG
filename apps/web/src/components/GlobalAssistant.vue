<script setup lang="ts">
import {nextTick,ref} from 'vue';import AiPanel from './AiPanel.vue';
defineProps<{ticketUrl?:string}>();
const open=ref(false),bubble=ref<HTMLButtonElement>(),panel=ref<InstanceType<typeof AiPanel>>();
async function toggle(){open.value=!open.value;await nextTick();if(open.value)panel.value?.focus();else bubble.value?.focus()}
async function close(){open.value=false;await nextTick();bubble.value?.focus()}
</script>
<template><div class="assistant"><button ref="bubble" class="assistant-bubble" :aria-expanded="open" aria-controls="global-ai-panel" @click="toggle">AI<span class="sr-only">智能客服</span></button><section v-if="open" id="global-ai-panel" aria-label="APPGOG 智能客服" @keydown.esc="close"><header><b>APPGOG 智能客服</b><button @click="close"><span aria-hidden="true">×</span><span class="sr-only">关闭客服</span></button></header><AiPanel ref="panel" id="global-ai" title="有什么可以帮你？" :ticket-url="ticketUrl"/></section></div></template>
