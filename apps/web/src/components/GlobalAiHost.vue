<script setup lang="ts">
import {computed,onMounted,onUnmounted,ref,watch} from 'vue';
import {useRoute} from 'vue-router';
import {api} from '../api';
import {aiTicketUrl} from '../ai-client';
import GlobalAssistant from './GlobalAssistant.vue';
const route=useRoute(),enabled=ref(false),ticket=ref('');
const isPublic=computed(()=>!route.path.startsWith('/admin')&&!route.meta.admin);
let generation=0,alive=true,timer:ReturnType<typeof setInterval>|undefined,inflight=false;
async function refresh(reset=false){if(reset){generation++;enabled.value=false}if(!isPublic.value)return;const request=++generation;inflight=true;try{const {data}=await api.get('/ai/config');if(!alive||request!==generation)return;enabled.value=data.enabled===true&&data.globalAssistantEnabled===true;ticket.value=aiTicketUrl(data.ticketUrl)}catch{if(request===generation)enabled.value=false}finally{if(request===generation)inflight=false}}
watch(()=>route.fullPath,()=>refresh(true),{immediate:true});
onMounted(()=>{timer=setInterval(()=>{if(!inflight)refresh()},30000)});onUnmounted(()=>{alive=false;generation++;clearInterval(timer)});
</script>
<template><GlobalAssistant v-if="isPublic&&enabled" :ticket-url="ticket" /></template>
