import {ConflictException,HttpException,Injectable} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {createHmac} from 'node:crypto';
import {PrismaService} from './prisma.service';
import type {AdminPrincipal} from './auth.types';
import type {AiSettingsDto} from './ai.dto';

export const AI_DEFAULTS={id:'main',revision:0,enabled:true,autoIndexEnabled:true,globalAssistantEnabled:false,topK:6,minimumScore:0.45,perMinute:8,globalPerMinute:60};
export function boundedEnv(name:string,fallback:number,max:number){const value=Number(process.env[name]);return Number.isInteger(value)&&value>0&&value<=max?value:fallback}
export function plainTicketUrl(value:unknown){if(typeof value!=='string'||/[\u0000-\u0020\u007f\\]/.test(value))return '';try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&!url.search&&!url.hash?url.href:''}catch{return ''}}

@Injectable()
export class AiPolicyService {
  constructor(private db:PrismaService){}
  async settings(tx:Prisma.TransactionClient=this.db){return await tx.aiConfiguration.findUnique({where:{id:'main'}})||{...AI_DEFAULTS}}
  async publicConfig(){const settings=await this.settings(),link=await this.db.outboundLink.findFirst({where:{kind:'TICKET',enabled:true}});return {enabled:settings.enabled,globalAssistantEnabled:settings.enabled&&settings.globalAssistantEnabled,maxQuestionLength:2000,ticketUrl:plainTicketUrl(link?.destinationUrl)}}
  async save(dto:AiSettingsDto,actor:AdminPrincipal){try{return await this.db.$transaction(async tx=>{const current=await this.settings(tx);if(current.revision!==dto.baseRevision)throw new ConflictException('AI 设置已更新，请刷新重试');const {baseRevision,...values}=dto;
    const row=current.revision?await tx.aiConfiguration.update({where:{id:'main'},data:{...values,revision:{increment:1}}}):await tx.aiConfiguration.create({data:{id:'main',...values}});
    await tx.auditLog.create({data:{adminUserId:actor.id,action:'AI_SETTINGS_UPDATED',resource:'AI',resourceId:'main',detail:{revision:row.revision,...values}}});return row;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}catch(error){if(['P2002','P2034'].includes((error as any)?.code))throw new ConflictException('AI 设置并发变化，请刷新重试');throw error}}
  private async reserve(entries:{key:string;limit:number;expiresAt:Date}[]){
    for(let attempt=0;attempt<3;attempt++)try{return await this.db.$transaction(async tx=>{for(const entry of entries.sort((a,b)=>a.key.localeCompare(b.key))){const row=await tx.aiRateBucket.upsert({where:{key:entry.key},create:{key:entry.key,count:1,expiresAt:entry.expiresAt},update:{count:{increment:1}}});if(row.count>entry.limit)throw new HttpException({message:'请求额度已达上限，请稍后再试',retryAfterSeconds:Math.max(1,Math.ceil((entry.expiresAt.getTime()-Date.now())/1000))},429)}},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}catch(error){if(['P2002','P2034'].includes((error as any)?.code)&&attempt<2)continue;throw error}
  }
  async requestQuota(ip:string){const settings=await this.settings(),window=Math.floor(Date.now()/60000),expiresAt=new Date((window+1)*60000);
    // Do not trust caller-supplied identity or store a raw address; rotate with each minute.
    const key=createHmac('sha256',process.env.JWT_SECRET||'local-test-only').update(`${window}:${ip}`).digest('hex');
    await this.reserve([{key:`request:${window}:global`,limit:settings.globalPerMinute,expiresAt},{key:`request:${window}:${key}`,limit:settings.perMinute,expiresAt}]);return settings;
  }
  async modelQuota(){const day=Math.floor(Date.now()/86400000);await this.reserve([{key:`model:${day}`,limit:boundedEnv('AI_DAILY_MODEL_CALL_LIMIT',200,100000),expiresAt:new Date((day+1)*86400000)}])}
  async usage(){const day=Math.floor(Date.now()/86400000),row=await this.db.aiRateBucket.findUnique({where:{key:`model:${day}`}});return {modelCallsToday:row?.count||0,dailyModelCallLimit:boundedEnv('AI_DAILY_MODEL_CALL_LIMIT',200,100000),resetsAt:new Date((day+1)*86400000)}}
}
