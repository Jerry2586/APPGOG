import {BadRequestException,HttpException,Injectable} from '@nestjs/common';
import type {Request} from 'express';
import {isIP} from 'node:net';
import {KnowledgeService} from './knowledge.service';
import {AiGatewayService} from './ai-gateway.service';
import {AiPolicyService} from './ai-policy.service';
import {parseGroundedAnswer,questionBlockReason,safeSource,type RetrievedDocument} from './ai-content';

export function aiClientAddress(req:Pick<Request,'socket'|'headers'>){
  const normalize=(value:string)=>value.replace(/^::ffff:/,'');const remote=normalize(req.socket.remoteAddress||'unknown');
  const trusted=(process.env.AI_TRUSTED_PROXY_IPS||'').split(',').map(value=>normalize(value.trim())).filter(value=>isIP(value));
  if(trusted.includes(remote)){const header=req.headers['x-forwarded-for'];const candidate=normalize(String(Array.isArray(header)?header[0]:header||'').split(',').at(-1)?.trim()||'');if(isIP(candidate))return candidate}
  return remote;
}
@Injectable()
export class AiService {
  private active=0;
  constructor(private knowledge:KnowledgeService,private gateway:AiGatewayService,private policy:AiPolicyService){}
  private response(mode:string,answer:string,docs:RetrievedDocument[],ticketUrl:string,retrievalMode='keyword'){
    return {mode,answer,sources:docs.map(safeSource).filter(Boolean),ticketUrl,unresolved:mode!=='answer',retrievalMode};
  }
  async search(input:string,ip:string){
    const question=input.normalize('NFKC').trim();if(!question||question.length>2000)throw new BadRequestException('问题必须为 1 至 2000 字符');
    const settings=await this.policy.requestQuota(ip),config=await this.policy.publicConfig();
    if(!settings.enabled)return this.response('disabled','AI 助手已暂停，请查阅帮助文档或提交工单。',[],config.ticketUrl);
    const blocked=questionBlockReason(question);if(blocked)return this.response('blocked',blocked,[],config.ticketUrl);
    if(this.active>=8)throw new HttpException({message:'AI 正在处理较多问题，请稍后重试',retryAfterSeconds:10},429);
    this.active++;
    try{
      const result=await this.knowledge.search(question,settings.topK,settings.minimumScore);
      let docs=await this.knowledge.stillPublic(result.documents);
      if(!docs.length)return this.response('documents','没有找到能够确认答案的公开知识资料，请换一种描述或提交工单。',[],config.ticketUrl,result.mode);
      if(!this.gateway.status().configured)return this.response('documents','AI 模型未启用或未配置，以下是相关文档搜索结果，并非模型生成的答案。',docs,config.ticketUrl,result.mode);
      try{
        const raw=await this.gateway.answer(question,docs),answer=parseGroundedAnswer(raw,docs);
        if(!(await this.policy.settings()).enabled)return this.response('disabled','AI 助手已暂停，请查阅帮助文档或提交工单。',[],config.ticketUrl);
        const current=await this.knowledge.stillPublic(docs);
        if(current.length!==docs.length){docs=current;return this.response('documents','知识资料在处理期间已更新，请查阅当前可用文档或重新提问。',docs,config.ticketUrl,result.mode)}
        if(answer.unresolved)return this.response('documents','知识库资料不足以确认答案，请查阅相关文档或提交工单。',docs,config.ticketUrl,result.mode);
        return this.response('answer',answer.answer,docs.filter(doc=>answer.sourceIds.includes(doc.id)),config.ticketUrl,result.mode);
      }catch{docs=await this.knowledge.stillPublic(docs);return this.response('documents','模型暂时不可用、额度不足或返回内容未通过校验，请先查看这些相关文档。',docs,config.ticketUrl,result.mode)}
    }finally{this.active--}
  }
}
