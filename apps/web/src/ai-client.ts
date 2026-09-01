import {ref} from 'vue';
export type AiSource={id:string;title:string;slug:string;url:string;excerpt:string};
export type AiResult={answer:string;mode:string;retrievalMode:string;unresolved:boolean;sources:AiSource[];ticketUrl:string};
export function aiTicketUrl(value:unknown){if(typeof value!=='string'||/[\u0000-\u0020\u007f\\]/.test(value))return '';try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&!url.search&&!url.hash?url.href:''}catch{return ''}}
export function aiSources(value:unknown):AiSource[]{if(!Array.isArray(value))return [];const ids=new Set<string>();return value.flatMap(row=>{if(!row||typeof row.id!=='string'||typeof row.title!=='string'||typeof row.slug!=='string'||!/^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)*$/.test(row.slug)||ids.has(row.id))return [];ids.add(row.id);return [{id:row.id,title:row.title.slice(0,200),slug:row.slug,url:'/content/'+row.slug,excerpt:typeof row.excerpt==='string'?row.excerpt.slice(0,240):''}]}).slice(0,10)}
export function createAiSearch(transport:(question:string,signal:AbortSignal)=>Promise<any>){
  const question=ref(''),result=ref<AiResult|null>(null),loading=ref(false),error=ref('');let generation=0,controller:AbortController|undefined;
  function cancel(){generation++;controller?.abort();loading.value=false}
  function clear(){cancel();question.value='';result.value=null;error.value=''}
  async function ask(){const text=question.value.normalize('NFKC').trim();if(!text||text.length>2000){error.value='请输入 1～2000 字的问题';return}cancel();const request=++generation;controller=new AbortController();loading.value=true;error.value='';result.value=null;
    try{const data=await transport(text,controller.signal);if(request!==generation)return;if(typeof data.answer!=='string'||data.answer.length>6000)throw new Error('INVALID_RESPONSE');result.value={answer:data.answer,mode:String(data.mode||'documents'),retrievalMode:String(data.retrievalMode||'keyword'),unresolved:data.unresolved!==false,sources:aiSources(data.sources),ticketUrl:aiTicketUrl(data.ticketUrl)}}
    catch(failure:any){if(request===generation)error.value=failure.response?.status===429?'提问过于频繁或服务繁忙，请稍后再试。':'AI 服务暂时不可用，请重试，或通过帮助文档和工单继续联系。'}finally{if(request===generation)loading.value=false}
  }
  return {question,result,loading,error,ask,cancel,clear};
}
