import {KnowledgeService} from './knowledge.service';
import {cmsDatabaseFixture} from './cms-test-fixture';
import {cmsSnapshot} from './cms-content';
describe('stage 10 durable published-source indexing (in-memory DB fixture)',()=>{
  const db=cmsDatabaseFixture();
  const gateway:any={status:()=>({configured:false}),profile:()=> 'text-only-v1',embed:jest.fn()};
  const service=new KnowledgeService(db,gateway);
  beforeEach(()=>{db.reset();gateway.status=()=>({configured:false});gateway.profile=()=> 'text-only-v1';gateway.embed=jest.fn()});
  async function seed(extra:any={}){const source=cmsSnapshot({type:'ARTICLE',format:'MARKDOWN',title:'Windows 安装',slug:'public',body:'公开安装说明'});return db.content.create({data:{slug:'draft',title:'草稿',body:'秘密内容',ragEnabled:true,status:'PUBLISHED',publishedSlug:'public',publishedSnapshot:source.snapshot,publishedSearchText:source.searchText,publishedHash:source.hash,...extra}})}
  it('skips missing, drafts and disabled; queues once and indexes published hash only',async()=>{
    expect((await service.indexContent('missing')).status).toBe('SKIPPED');
    const doc=await seed({status:'DRAFT'});expect((await service.indexContent(doc.id)).status).toBe('SKIPPED');
    await db.content.update({where:{id:doc.id},data:{status:'PUBLISHED',ragEnabled:false}});expect((await service.indexContent(doc.id)).status).toBe('SKIPPED');
    await db.content.update({where:{id:doc.id},data:{ragEnabled:true}});
    const first=await service.indexContent(doc.id);expect(first.status).toBe('PENDING');expect(await service.indexContent(doc.id)).toEqual(first);expect(db.rows('knowledgeIndexJob')).toHaveLength(1);expect(db.rows('knowledgeChunk')).toHaveLength(0);
    expect((await service.processNext()).status).toBe('SUCCEEDED');expect(db.rows('knowledgeChunk')[0].contentHash).toBe(db.rows('content')[0].publishedHash);expect(db.rows('knowledgeChunk')[0].text).not.toContain('秘密');
    expect(await service.retrieve('秘密')).toHaveLength(0);expect((await service.retrieve('公开安装'))[0]).toMatchObject({slug:'public',title:'Windows 安装'});
    expect((await service.indexContent(doc.id)).status).toBe('SKIPPED');expect((await service.processNext()).status).toBe('IDLE');
  });
  it.each(['disabled','offline','republished','profile'])('discards in-flight %s results before commit',async(change)=>{
    gateway.status=()=>({configured:true,embeddingModel:'test'});gateway.profile=()=> 'vector-test';const doc=await seed();
    gateway.embed=jest.fn(async()=>{const row=db.rows('content')[0];if(change==='disabled')row.ragEnabled=false;else if(change==='offline')row.status='OFFLINE';else if(change==='profile')gateway.profile=()=> 'new-model';else row.publishedSnapshot.body='新公开正文';return [[1]]});
    await service.indexContent(doc.id);expect((await service.processNext()).status).toBe('FAILED');expect(db.rows('knowledgeChunk')).toHaveLength(0);expect(db.rows('knowledgeIndexJob')[0].activeKey).toBeNull();
  });
  it('preserves good chunks on failure, retries only three times and requires manual recovery',async()=>{
    const doc=await seed();await service.indexContent(doc.id);await service.processNext();const chunks=structuredClone(db.rows('knowledgeChunk'));await service.indexContent(doc.id,true);db.failChunk=true;
    for(let attempt=1;attempt<=3;attempt++){expect((await service.processNext()).status).toBe(attempt<3?'PENDING':'FAILED');expect(db.rows('knowledgeChunk')).toEqual(chunks);db.rows('knowledgeIndexJob').at(-1).availableAt=new Date(0)}
    await service.reconcile();expect(db.rows('knowledgeIndexJob')).toHaveLength(2);expect(db.rows('knowledgeIndexJob')[1]).toMatchObject({attemptCount:3,activeKey:null});
    db.failChunk=false;await service.indexContent(doc.id,true);expect((await service.processNext()).status).toBe('SUCCEEDED');
  });
  it('recovers expired leases and does not commit when another worker owns the lease',async()=>{
    gateway.status=()=>({configured:true,embeddingModel:'test'});gateway.profile=()=> 'vector-test';const doc=await seed();await service.indexContent(doc.id);const claimed=await service.claim();expect(claimed?.attemptCount).toBe(1);expect(await service.claim()).toBeNull();
    db.rows('knowledgeIndexJob')[0].leaseUntil=new Date(0);gateway.embed=jest.fn(async()=>{db.rows('knowledgeIndexJob')[0].leaseToken='other-worker';return [[1]]});
    await service.processNext();expect(db.rows('knowledgeChunk')).toHaveLength(0);expect(db.rows('knowledgeIndexJob')[0]).toMatchObject({status:'RUNNING',attemptCount:2,leaseToken:'other-worker'});
  });
  it('cancels queued tasks immediately and explicit indexing works with automatic indexing off',async()=>{
    const doc=await seed();await db.aiConfiguration.create({data:{id:'main',autoIndexEnabled:false}});expect((await service.enqueue(db,doc.id)).status).toBe('SKIPPED');expect((await service.indexContent(doc.id)).status).toBe('PENDING');await service.cancel(db,doc.id);expect((await service.processNext()).status).toBe('IDLE');expect(db.rows('knowledgeIndexJob')[0]).toMatchObject({status:'FAILED',attemptCount:0,activeKey:null,startedAt:null});expect(Number.isFinite(db.rows('knowledgeIndexJob')[0].finishedAt.getTime())).toBe(true);
  });
  it('finds keyword matches beyond the first 100 documents without leaking draft text',async()=>{
    for(let n=0;n<120;n++)await seed({id:String(n).padStart(3,'0'),slug:'draft-'+n,publishedSlug:'public-'+n,publishedSearchText:n===119?'Windows 安装 公开安装说明':'不相关内容'});
    expect((await service.retrieve('安装'))[0].id).toBe('119');
  });
  it('uses parameterized semantic matches even without keyword overlap and excludes stale citations',async()=>{
    const doc=await seed();gateway.status=()=>({configured:true});gateway.profile=()=> 'profile-abc';gateway.embed=jest.fn(async()=>[[1,0]]);
    db.$queryRawUnsafe=jest.fn(async()=>[{id:doc.id,title:'Windows 安装',slug:'public',hash:doc.publishedHash,text:'公开安装说明',score:0.9}]);
    const result=await service.search('连接失败',3,0.6);expect(result.mode).toBe('semantic');expect(result.documents).toHaveLength(1);
    const [sql,vector,profile,threshold,limit]=db.$queryRawUnsafe.mock.calls[0];expect(sql).toContain('k."contentHash"=c."publishedHash"');expect(sql).toContain('k."indexProfile"=$2');expect([vector,profile,threshold,limit]).toEqual(['[1,0]','profile-abc',0.6,18]);
    db.rows('content')[0].ragEnabled=false;expect(await service.stillPublic(result.documents)).toHaveLength(0);
  });
  it('falls back to ranked keyword results if vector provider fails',async()=>{await seed();gateway.status=()=>({configured:true});gateway.embed=jest.fn(async()=>{throw new Error('private key must not escape')});const result=await service.search('公开安装');expect(result).toMatchObject({mode:'keyword',degraded:true});expect(result.documents).toHaveLength(1)});
  it('batches reindex with a stable cursor and excludes non-public sources',async()=>{
    for(let n=0;n<102;n++)await seed({id:String(n).padStart(3,'0'),slug:'draft-'+n,publishedSlug:'public-'+n});
    await seed({id:'zzz',slug:'secret',publishedSlug:null,status:'DRAFT'});
    const batch=await service.reindexAll();expect(batch).toEqual({queued:100,skipped:0,nextCursor:'099'});expect(await service.reindexAll(batch.nextCursor!)).toEqual({queued:2,skipped:0,nextCursor:null});
  });
});
