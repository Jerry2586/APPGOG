<script setup lang="ts">
import { onMounted,onUnmounted,ref,watch } from 'vue';
import type Hls from 'hls.js';
import { validHlsUrl } from '../video-source';
const props=defineProps<{src:string;poster?:string}>(), el=ref<HTMLVideoElement>(), error=ref(''), loading=ref(false);
let hls:Hls|undefined, generation=0;
function stop(){hls?.destroy();hls=undefined;if(el.value){el.value.pause();el.value.removeAttribute('src');el.value.load()}}
async function start(){
  const request=++generation;stop();error.value='';loading.value=false;
  if(!el.value)return;
  if(!validHlsUrl(props.src)){error.value='视频地址无效，需要 HTTP/HTTPS m3u8 直链';return}
  loading.value=true;
  if(el.value.canPlayType('application/vnd.apple.mpegurl')){el.value.src=props.src;return}
  try{
    const {default:Driver}=await import('hls.js');if(request!==generation)return;
    if(!Driver.isSupported()){error.value='当前浏览器不支持 HLS 视频，请更换支持的浏览器';loading.value=false;return}
    hls=new Driver();hls.on(Driver.Events.ERROR,(_event,data)=>{if(request===generation&&data.fatal){error.value='视频加载失败，请检查视频源、跨域权限或网络后重试';loading.value=false;hls?.destroy();hls=undefined}});
    hls.loadSource(props.src);hls.attachMedia(el.value!);
  }catch{if(request===generation){loading.value=false;error.value='播放器加载失败，请重试'}}
}
function ready(){loading.value=false;error.value=''}
function failed(){loading.value=false;error.value='视频播放失败，请检查视频源或网络后重试'}
watch(()=>props.src,start);onMounted(start);onUnmounted(()=>{generation++;stop()});
</script>
<template><section class="cms-video" aria-label="HLS 视频播放器"><video ref="el" controls playsinline preload="metadata" :poster="poster" @loadedmetadata="ready" @canplay="ready" @error="failed"></video><p v-if="loading" role="status">正在加载视频…</p><p v-if="error" role="alert">{{error}} <button type="button" @click="start">重试视频</button></p></section></template>
