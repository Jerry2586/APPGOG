import {Injectable,Optional} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {PrismaService} from './prisma.service';
import {cmsSnapshot} from './cms-content';
import {AiGatewayService} from './ai-gateway.service';
import {AiPolicyService} from './ai-policy.service';
import {keywordScore,questionTerms,type RetrievedDocument} from './ai-content';

@Injectable()
export class KnowledgeService {
  private gateway:AiGatewayService;
  private policy:AiPolicyService;
  constructor(private db:PrismaService,@Optional() gateway?:AiGatewayService){this.gateway=gateway||new AiGatewayService(db);this.policy=new AiPolicyService(db)}
  chunks(text:string,size=1200,overlap=150){const clean=text.replace(/\s+/g,' ').trim(),out:string[]=[];for(let i=0;i<clean.length;i+=size-overlap)out.push(clean.slice(i,i+size));return out.filter(Boolean)}
  async cancel(tx:Prisma.TransactionClient,contentId:string){
    await tx.knowledgeIndexJob.updateMany({where:{contentId,status:{in:['PENDING','RUNNING']}},data:{status:'FAILED',activeKey:null,leaseToken:null,leaseUntil:null,finishedAt:new Date(),errorMessage:'来源关闭、下线或版本变化，任务已取消'}});
  }
  async enqueue(tx:Prisma.TransactionClient,contentId:string,force=false,automatic=true){
    const doc=await tx.content.findUnique({where:{id:contentId}});
    if(!doc||!doc.ragEnabled||doc.status!=='PUBLISHED'||!doc.publishedSlug||!doc.publishedSnapshot)return {status:'SKIPPED'};
    if(automatic&&!(await this.policy.settings(tx)).autoIndexEnabled)return {status:'SKIPPED'};
    const source=cmsSnapshot(doc.publishedSnapshot),profile=this.gateway.profile();
    const active=await tx.knowledgeIndexJob.findFirst({where:{activeKey:contentId}});
    if(active?.contentHash===source.hash&&active.indexProfile===profile)return {status:active.status,jobId:active.id};
    if(active)await this.cancel(tx,contentId);
    if(!force&&doc.ragIndexedAt&&await tx.knowledgeIndexJob.findFirst({where:{contentId,contentHash:source.hash,indexProfile:profile,status:'SUCCEEDED'}}))return {status:'SKIPPED'};
    const job=await tx.knowledgeIndexJob.create({data:{contentId,contentHash:source.hash,indexProfile:profile,activeKey:contentId,status:'PENDING',attemptCount:0,availableAt:new Date()}});
    return {status:'PENDING',jobId:job.id};
  }
  async indexContent(contentId:string,force=false){
    return this.db.$transaction(tx=>this.enqueue(tx,contentId,force,false),{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }
  async reindexAll(afterId?:string){
    const docs=await this.db.content.findMany({where:{ragEnabled:true,status:'PUBLISHED',publishedSlug:{not:null},...(afterId?{id:{gt:afterId}}:{})},orderBy:{id:'asc'},take:100});
    let queued=0,skipped=0;
    for(const doc of docs){const result=await this.indexContent(doc.id,true);if(result.status==='SKIPPED')skipped++;else queued++}
    return {queued,skipped,nextCursor:docs.length===100?docs[docs.length-1].id:null};
  }
  async reconcile(afterId?:string){
    if(!(await this.policy.settings()).autoIndexEnabled)return null;
    const docs=await this.db.content.findMany({where:{ragEnabled:true,status:'PUBLISHED',publishedSlug:{not:null},...(afterId?{id:{gt:afterId}}:{})},orderBy:{id:'asc'},take:50});
    for(const doc of docs){
      // A terminal failure is visible and requires explicit retry, not an endless cost loop.
      const hash=doc.publishedSnapshot?cmsSnapshot(doc.publishedSnapshot).hash:null;
      const failed=await this.db.knowledgeIndexJob.findFirst({where:{contentId:doc.id,contentHash:hash,indexProfile:this.gateway.profile(),status:'FAILED',attemptCount:{gte:3}}});
      if(!failed)await this.db.$transaction(tx=>this.enqueue(tx,doc.id),{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}).catch(()=>undefined);
    }
    return docs.length===50?docs[docs.length-1].id:null;
  }
  async claim(){
    const now=new Date();
    try{return await this.db.$transaction(async tx=>{
      const job=await tx.knowledgeIndexJob.findFirst({where:{OR:[{status:'PENDING',availableAt:{lte:now}},{status:'RUNNING',leaseUntil:{lt:now}}]},orderBy:[{availableAt:'asc'},{createdAt:'asc'}]});
      if(!job)return null;
      if(job.attemptCount>=3){await tx.knowledgeIndexJob.update({where:{id:job.id},data:{status:'FAILED',activeKey:null,leaseToken:null,leaseUntil:null,finishedAt:now,errorMessage:'重试次数已达上限，请手动重试'}});return null}
      const leaseToken=randomUUID();
      const result=await tx.knowledgeIndexJob.updateMany({where:{id:job.id,status:job.status,attemptCount:job.attemptCount,leaseToken:job.leaseToken},data:{status:'RUNNING',attemptCount:{increment:1},leaseToken,leaseUntil:new Date(Date.now()+600000),startedAt:now,errorMessage:null}});
      return result.count?{...job,status:'RUNNING',attemptCount:job.attemptCount+1,leaseToken}:null;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}catch(error){if(['P2002','P2034'].includes((error as any)?.code))return null;throw error}
  }
  async processNext(){
    const job=await this.claim();if(!job)return {status:'IDLE'};
    let terminal=false;
    try{
      const doc=await this.db.content.findUnique({where:{id:job.contentId}});
      if(!doc||!doc.ragEnabled||doc.status!=='PUBLISHED'||!doc.publishedSlug||!doc.publishedSnapshot||cmsSnapshot(doc.publishedSnapshot).hash!==job.contentHash||this.gateway.profile()!==job.indexProfile){terminal=true;throw new Error('STALE_SOURCE')}
      const source=cmsSnapshot(doc.publishedSnapshot),pieces=this.chunks(source.searchText),vectors:number[][]=[];
      if(job.indexProfile!=='text-only-v1')for(let start=0;start<pieces.length;start+=16)vectors.push(...await this.gateway.embed(pieces.slice(start,start+16)));
      await this.db.$transaction(async tx=>{
        const current=await tx.content.findUnique({where:{id:doc.id}}),lease=await tx.knowledgeIndexJob.findUnique({where:{id:job.id}});
        if(!lease||lease.status!=='RUNNING'||lease.leaseToken!==job.leaseToken||!lease.leaseUntil||lease.leaseUntil.getTime()<=Date.now())throw new Error('LOST_LEASE');
        if(!current||!current.ragEnabled||current.status!=='PUBLISHED'||!current.publishedSlug||!current.publishedSnapshot||cmsSnapshot(current.publishedSnapshot).hash!==source.hash||this.gateway.profile()!==job.indexProfile){terminal=true;throw new Error('STALE_SOURCE')}
        await tx.knowledgeChunk.deleteMany({where:{contentId:doc.id}});
        for(const [chunkIndex,text] of pieces.entries()){
          const row=await tx.knowledgeChunk.create({data:{contentId:doc.id,chunkIndex,text,contentHash:source.hash,indexProfile:job.indexProfile,embeddingModel:vectors.length?this.gateway.status().embeddingModel:null,tokenCount:Math.ceil(text.length/3)}});
          if(vectors.length)await tx.$executeRawUnsafe('UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = $2',JSON.stringify(vectors[chunkIndex]),row.id);
        }
        await tx.content.update({where:{id:doc.id},data:{publishedHash:source.hash,ragIndexedAt:new Date()}});
        await tx.knowledgeIndexJob.update({where:{id:job.id},data:{status:'SUCCEEDED',activeKey:null,leaseToken:null,leaseUntil:null,finishedAt:new Date(),errorMessage:vectors.length?null:'本地文本索引成功；外部向量服务未启用或未配置'}});
      },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:15000});
      return {status:'SUCCEEDED',jobId:job.id};
    }catch{
      const failed=terminal||job.attemptCount>=3;
      await this.db.knowledgeIndexJob.updateMany({where:{id:job.id,status:'RUNNING',leaseToken:job.leaseToken},data:{status:failed?'FAILED':'PENDING',...(failed?{activeKey:null,finishedAt:new Date()}:{}),leaseToken:null,leaseUntil:null,availableAt:new Date(Date.now()+5000*2**job.attemptCount),errorMessage:terminal?'来源版本变化，结果已丢弃':failed?'索引服务失败达到重试上限，请检查配置或额度后手动重试':'索引暂时失败，等待自动重试'}}).catch(()=>undefined);
      return {status:failed?'FAILED':'PENDING',jobId:job.id};
    }
  }
  async search(question:string,limit=6,minimumScore=0.45){
    limit=Math.max(1,Math.min(10,limit));const terms=questionTerms(question),lexical:RetrievedDocument[]=[];
    if(terms.length){
      const docs=await this.db.content.findMany({where:{ragEnabled:true,status:'PUBLISHED',publishedSlug:{not:null},OR:terms.map(term=>({publishedSearchText:{contains:term,mode:'insensitive' as const}}))},orderBy:[{publishedAt:'desc'},{id:'asc'}],take:200});
      for(const doc of docs)if(doc.publishedSnapshot){const source=cmsSnapshot(doc.publishedSnapshot),score=keywordScore(question,source.snapshot.title,source.searchText);if(score>0){const chunks=this.chunks(source.searchText);chunks.sort((a,b)=>keywordScore(question,source.snapshot.title,b)-keywordScore(question,source.snapshot.title,a));lexical.push({id:doc.id,title:source.snapshot.title,slug:doc.publishedSlug!,text:chunks[0]||source.searchText,hash:source.hash,score})}}
      lexical.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
    }
    let semantic:RetrievedDocument[]=[],degraded=!this.gateway.status().configured;
    if(!degraded)try{
      const [vector]=await this.gateway.embed([question]);
      const rows=await this.db.$queryRawUnsafe<any[]>('SELECT c.id, k.text, c."publishedSnapshot"->>\'title\' AS title, c."publishedSlug" AS slug, c."publishedHash" AS hash, 1-(k.embedding <=> $1::vector) AS score FROM "KnowledgeChunk" k JOIN "Content" c ON c.id=k."contentId" WHERE k.embedding IS NOT NULL AND c.status=\'PUBLISHED\' AND c."ragEnabled"=true AND c."publishedSlug" IS NOT NULL AND k."contentHash"=c."publishedHash" AND k."indexProfile"=$2 AND 1-(k.embedding <=> $1::vector)>=$3 ORDER BY k.embedding <=> $1::vector, k.id LIMIT $4',JSON.stringify(vector),this.gateway.profile(),minimumScore,Math.min(60,limit*6));
      const seen=new Set<string>();semantic=rows.filter(row=>{if(seen.has(row.id)||!Number.isFinite(Number(row.score)))return false;seen.add(row.id);return true});
      if(!semantic.length)degraded=true;
    }catch{degraded=true}
    // Reciprocal rank fusion: vector similarity is primary, keyword matches help ordering.
    const merged=new Map<string,{doc:RetrievedDocument;rank:number}>();
    for(const [list,weight] of [[semantic,1],[lexical,0.65]] as const)list.forEach((doc,index)=>{const previous=merged.get(doc.id);merged.set(doc.id,{doc:previous?.doc||doc,rank:(previous?.rank||0)+weight/(20+index+1)})});
    const documents=[...merged.values()].sort((a,b)=>b.rank-a.rank||a.doc.id.localeCompare(b.doc.id)).slice(0,limit).map(row=>row.doc);
    return {documents,mode:semantic.length?(lexical.length?'hybrid':'semantic'):'keyword',degraded};
  }
  async retrieve(question:string,limit=6){return (await this.search(question,limit)).documents}
  async stillPublic(docs:RetrievedDocument[]){
    if(!docs.length)return [];
    const current=await this.db.content.findMany({where:{id:{in:docs.map(doc=>doc.id)},ragEnabled:true,status:'PUBLISHED',publishedSlug:{not:null}}});
    return docs.filter(doc=>current.some(row=>row.id===doc.id&&row.publishedSnapshot&&cmsSnapshot(row.publishedSnapshot).hash===doc.hash&&row.publishedSlug===doc.slug));
  }
}
