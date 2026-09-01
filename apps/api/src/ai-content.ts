import sanitizeHtml = require('sanitize-html');
export type RetrievedDocument={id:string;title:string;slug:string;text:string;hash:string;score:number};
export const questionTerms=(question:string)=>{
  const text=question.normalize('NFKC').toLowerCase(),stop=new Set(['的','了','我','请','怎么','如何','什么','是','有','吗','呢','一下','帮我','请问','怎么办']);
  const words=Array.from(new Intl.Segmenter('zh-CN',{granularity:'word'}).segment(text)).filter(part=>part.isWordLike).map(part=>part.segment).filter(word=>!stop.has(word)&&word.length>1);
  // Keyword fallback only; these aliases are not advertised as vector semantics.
  const aliases=[['小火箭','shadowrocket'],['苹果','ios'],['iphone','ios'],['安卓','android'],['电脑','windows']];
  for(const [word,alias] of aliases)if(text.includes(word))words.push(alias);
  return [...new Set(words)].slice(0,24);
};
export function keywordScore(question:string,title:string,text:string){const terms=questionTerms(question),haystack=text.toLowerCase(),name=title.toLowerCase();return terms.reduce((sum,term)=>sum+(haystack.includes(term)?1:0)+(name.includes(term)?2:0),0)+(haystack.includes(question.trim().toLowerCase())?2:0)}
export function questionBlockReason(question:string){
  if(/(?:ignore|disregard|reveal|print).{0,60}(?:previous instructions|system prompt|developer message|api key)|忽略.{0,20}(?:指令|规则)|(?:泄露|输出|显示).{0,15}(?:系统提示|密钥)|越狱|jailbreak/i.test(question))return '请仅询问 APPGOG 公开知识库内容，不能修改助手规则或读取秘密信息。';
  if(/Bearer\s+[a-z\d._-]+|sk-[a-z\d_-]{12,}|[?&](?:token|access_token|key|password|secret)=[^\s&]+/i.test(question))return '请移除密码、Token、密钥或带凭据的订阅地址后重新提问；这些信息不会发送给模型。';
  if(/(?:查询|查看|获取|检查|帮我查|check|show).{0,25}(?:我的|当前用户|my).{0,20}(?:余额|订单|流量|套餐|订阅地址|balance|order|account)/i.test(question))return 'APPGOG 无法读取个人账号或 Xboard 业务数据，请前往 Xboard 面板或提交工单。';
  return '';
}
export function safeSource(doc:RetrievedDocument){if(!/^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)*$/.test(doc.slug))return null;return {id:doc.id,title:doc.title,slug:doc.slug,url:`/content/${doc.slug.split('/').map(encodeURIComponent).join('/')}`,excerpt:doc.text.slice(0,240)}}
export function parseGroundedAnswer(raw:string,docs:RetrievedDocument[]){
  if(raw.length>20000)throw new Error('ANSWER_TOO_LONG');const value=JSON.parse(raw);
  if(!value||typeof value.answer!=='string'||!value.answer.trim()||value.answer.length>6000||typeof value.unresolved!=='boolean'||!Array.isArray(value.sourceIds)||value.sourceIds.length>10||value.sourceIds.some((id:unknown)=>typeof id!=='string'||!docs.some(doc=>doc.id===id))||(!value.unresolved&&!value.sourceIds.length))throw new Error('INVALID_ANSWER');
  const answer=sanitizeHtml(value.answer,{allowedTags:[],allowedAttributes:{}}).replace(/https?:\/\/\S+|javascript:\S+|data:\S+/gi,'[外部地址已移除]').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim();
  if(!answer)throw new Error('EMPTY_ANSWER');return {answer,unresolved:value.unresolved as boolean,sourceIds:[...new Set(value.sourceIds)] as string[]};
}
