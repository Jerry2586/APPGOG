<script setup lang="ts">
import {computed,nextTick,onMounted,onUnmounted,ref} from 'vue';
import {api} from '../api';
import {aiTicketUrl,createAiSearch} from '../ai-client';
const props=withDefaults(defineProps<{id:string;title?:string;placeholder?:string;ticketUrl?:string}>(),{title:'APPGOG 智能助手',placeholder:'描述你的问题'});
const state=createAiSearch(async(question,signal)=>(await api.post('/ai/search',{question},{signal,timeout:35000})).data);
const {question,result,loading,error}=state;
const field=ref<HTMLTextAreaElement>(),ready=ref(false),enabled=ref(true),configError=ref(''),configuredTicket=ref('');let mounted=true;
const ticket=computed(()=>aiTicketUrl(result.value?.ticketUrl)||configuredTicket.value||aiTicketUrl(props.ticketUrl));
async function loadConfig(){ready.value=false;configError.value='';try{const {data}=await api.get('/ai/config');if(!mounted)return;enabled.value=data.enabled===true;configuredTicket.value=aiTicketUrl(data.ticketUrl);ready.value=true}catch{if(mounted)configError.value='暂时无法读取助手配置，请重试'}}
let focusRequested=false;
defineExpose({focus:()=>{focusRequested=true;field.value?.focus()}});
onMounted(async()=>{await loadConfig();await nextTick();if(focusRequested&&mounted)field.value?.focus()});onUnmounted(()=>{mounted=false;state.cancel()});
</script>
<template><section class="ai-panel" :aria-labelledby="`${id}-title`"><h2 :id="`${id}-title`">{{title}}</h2><p class="ai-notice">仅依据 APPGOG 公开知识库；请勿输入密码、Token 或私密订阅地址。回答可能有误，请核对原文。</p>
<p v-if="configError" role="alert">{{configError}} <button @click="loadConfig">重试助手配置</button></p><p v-else-if="!ready" role="status">正在读取助手配置…</p><p v-else-if="!enabled" role="status">AI 助手已暂停。</p>
<form @submit.prevent="state.ask"><label :for="`${id}-question`">问题</label><textarea :id="`${id}-question`" ref="field" v-model="question" :placeholder="placeholder" maxlength="2000" rows="3" :disabled="!ready||!enabled" /><small>{{question.length}} / 2000</small><div class="ai-actions"><button :disabled="loading||!ready||!enabled||!question.trim()">{{loading?'正在检索与分析…':'发送问题'}}</button><button v-if="loading" type="button" @click="state.cancel">停止等待</button><button type="button" @click="state.clear">清空</button></div></form>
<p v-if="loading" role="status">正在查找公开知识资料…</p><p v-if="error" role="alert">{{error}} <button :disabled="loading" @click="state.ask">重试问题</button></p>
<section v-if="result" class="ai-answer" aria-label="AI 回答" aria-live="polite"><small>{{result.mode==='answer'?'知识库辅助回答':'文档搜索 / 服务提示'}} · {{result.retrievalMode==='keyword'?'关键词检索':result.retrievalMode==='hybrid'?'语义与关键词检索':'语义检索'}}</small><p>{{result.answer}}</p><ol v-if="result.sources.length" aria-label="参考资料"><li v-for="source in result.sources" :key="source.id"><a :href="source.url">{{source.title}}</a><p>{{source.excerpt}}</p></li></ol></section>
<a v-if="ticket&&(error||result||!enabled||configError)" class="ai-ticket" :href="ticket" target="_blank" rel="noopener noreferrer">仍未解决？提交 Xboard 工单 ↗</a><p v-else-if="(error||result?.unresolved)&&!ticket" class="ai-notice">工单入口尚未配置，请联系网站管理员。</p></section></template>
