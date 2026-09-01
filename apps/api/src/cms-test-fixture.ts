// Opt-in test fixture; never registered in AppModule. It cannot validate SQL,
// PostgreSQL isolation or migrations. HTTP tests exercise real service/guards.
import { randomUUID } from 'node:crypto';
import { ADMIN_ROLES } from './auth.types';
export function cmsDatabaseFixture() {
  let state:Record<string,any[]>={content:[],category:[],product:[],knowledgeChunk:[],knowledgeIndexJob:[],auditLog:[],aiConfiguration:[],aiRateBucket:[],outboundLink:[],theme:[],themeState:[],themeSchedule:[],marketingCampaign:[],pluginSnippet:[],pluginSnippetVersion:[],globalSetting:[]};
  const sessions=new Map(ADMIN_ROLES.map(role=>[role,{id:role,adminUserId:role,expiresAt:new Date(Date.now()+3600000),revokedAt:null,adminUser:{id:role,role,enabled:true,displayName:role,email:`${role}@example.invalid`}}]));
  function matches(row:any,where:any={}):boolean {
    return Object.entries(where).every(([key,value]:any)=>{
      if(value===undefined)return true;
      if(key==='AND')return value.every((part:any)=>matches(row,part));
      if(key==='OR')return value.some((part:any)=>matches(row,part));
      if(value&&typeof value==='object'&&!Array.isArray(value)){
        if(value.path){const found=value.path.reduce((item:any,field:string)=>item?.[field],row[key]);return 'string_contains' in value?String(found||'').toLowerCase().includes(value.string_contains.toLowerCase()):found===value.equals;}
        if('contains' in value)return String(row[key]||'').toLowerCase().includes(value.contains.toLowerCase());
        if('in' in value)return value.in.includes(row[key]);
        if('not' in value&&row[key]===value.not)return false;
        if('gt' in value&&!(row[key]>value.gt))return false;
        if('gte' in value&&!(row[key]>=value.gte))return false;
        if('lt' in value&&!(row[key]<value.lt))return false;
        if('lte' in value&&!(row[key]<=value.lte))return false;
        if(['not','gt','gte','lt','lte'].some(operator=>operator in value))return true;
      }
      return row[key]===value;
    });
  }
  const db:any={failAudit:false,failChunk:false, beforeTransaction:undefined,rows:(name:string)=>state[name],reset:()=>{for(const key of Object.keys(state))state[key]=[];db.failAudit=false;db.failChunk=false;db.beforeTransaction=undefined},
    adminSession:{findUnique:async({where}:any)=>sessions.get(where.id),update:async({where,data}:any)=>Object.assign(sessions.get(where.id)!,data)},
    $transaction:async(action:any)=>{if(Array.isArray(action))return Promise.all(action);if(db.beforeTransaction){const hook=db.beforeTransaction;db.beforeTransaction=undefined;hook()}
      const before=structuredClone(state);try{return await action(db)}catch(error){state=before;throw error}},
    $executeRawUnsafe:async()=>1,$queryRawUnsafe:async()=>[]
  };
  for(const name of Object.keys(state)){
    const unique=(next:any,id?:string)=>{if(name==='knowledgeIndexJob'&&next.activeKey&&state[name].some(row=>row.id!==id&&row.activeKey===next.activeKey))throw Object.assign(new Error('duplicate active job'),{code:'P2002'});if(!['content','category','product'].includes(name))return;const conflict=state[name].some(row=>row.id!==id&&((row.slug===next.slug&&(name!=='category'||row.scope===next.scope))||(['content','product'].includes(name)&&next.publishedSlug&&row.publishedSlug===next.publishedSlug)||(name==='product'&&next.sku&&row.sku===next.sku)));if(conflict)throw Object.assign(new Error('duplicate'),{code:'P2002'})};
    db[name]={
      findMany:async({where={},orderBy=[],skip=0,take,include}:any={})=>{let rows=state[name].filter(row=>matches(row,where)).map(row=>structuredClone(row));for(const sort of [...(Array.isArray(orderBy)?orderBy:[orderBy])].reverse()){const [key,direction]=Object.entries(sort)[0]||[];rows.sort((a,b)=>((key==='price'||key==='publishedPrice')?(Number(a[key])-Number(b[key])):(a[key]<b[key]?-1:a[key]>b[key]?1:0))*(direction==='desc'?-1:1))}return rows.slice(skip,take===undefined?undefined:skip+take)},
      findUnique:async({where,include}:any)=>{const row=state[name].find(row=>matches(row,where));if(!row)return null;return {...structuredClone(row),...(include?.indexJobs?{indexJobs:state.knowledgeIndexJob.filter(job=>job.contentId===row.id).slice(-5).reverse()}: {})}},
      findFirst:async(args:any)=>(await db[name].findMany({...args,take:1}))[0]||null,
      count:async({where}:any)=>state[name].filter(row=>matches(row,where)).length,
      create:async({data}:any)=>{if(name==='auditLog'&&db.failAudit)throw new Error('audit failed');if(name==='knowledgeChunk'&&db.failChunk)throw new Error('chunk failed');
        const row={id:randomUUID(),createdAt:new Date(),updatedAt:new Date(),...(name==='content'?{status:'DRAFT',revision:1,publishedSlug:null,publishedSnapshot:null,publishedHash:null,publishedSearchText:null,publishedAt:null,ragIndexedAt:null,viewCount:0}:name==='category'?{revision:1}:name==='product'?{revision:1,status:'DRAFT',publishedSlug:null,publishedSnapshot:null,publishedPrice:null,publishedSales:null,publishedAt:null}:name==='knowledgeIndexJob'?{status:'PENDING',attemptCount:0,activeKey:null,leaseToken:null,leaseUntil:null,finishedAt:null,startedAt:null,errorMessage:null,availableAt:new Date(),indexProfile:'legacy'}:name==='aiConfiguration'?{revision:1}:{}),...structuredClone(data)};unique(row);state[name].push(row);return structuredClone(row)},
      upsert:async({where,create,update}:any)=>state[name].some(row=>matches(row,where))?db[name].update({where,data:update}):db[name].create({data:create}),
      update:async({where,data}:any)=>{const row=state[name].find(row=>matches(row,where));if(!row)throw new Error('record missing');const next={...row,...data};for(const key of Object.keys(data))if(data[key]&&typeof data[key]==='object'&&'increment' in data[key])next[key]=row[key]+data[key].increment;unique(next,row.id);Object.assign(row,structuredClone(next),{updatedAt:new Date()});return structuredClone(row)},
      updateMany:async({where,data}:any)=>{const rows=state[name].filter(row=>matches(row,where));for(const row of rows)await db[name].update({where:{id:row.id},data});return {count:rows.length}},
      deleteMany:async({where}:any)=>{const before=state[name].length;state[name]=state[name].filter(row=>!matches(row,where));return {count:before-state[name].length}},
      delete:async({where}:any)=>{const row=state[name].find(row=>matches(row,where));state[name]=state[name].filter(row=>!matches(row,where));return structuredClone(row)}
    };
  }
  return db;
}
