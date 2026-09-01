import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import {BlockList,isIP} from 'node:net';

const privateV4=new BlockList();
for(const [network,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const)privateV4.addSubnet(network,bits,'ipv4');
export function publicProviderAddress(address:string){if(isIP(address)===4)return !privateV4.check(address,'ipv4');return isIP(address)===6&&/^[23]/i.test(address)&&!/^2001:(?:0:|db8:)/i.test(address)&&!/^2002:/i.test(address)}
export function providerBaseUrl(value:string){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.port&&url.port!=='443'||/[\s\\]/.test(value))throw new Error('INVALID_PROVIDER_URL');const host=url.hostname.replace(/^\[|\]$/g,'');if(host==='localhost'||/\.(local|internal|localhost)$/i.test(host)||(isIP(host)&&!publicProviderAddress(host)))throw new Error('INVALID_PROVIDER_URL');return url.href.replace(/\/$/,'')}

// Pin the validated DNS result in the TLS request, block redirects, cap bytes.
// Only this server-configured provider is contacted; document URLs are never fetched.
export function providerFetch(base:string):typeof fetch {
  return (async(input:any,init:RequestInit={})=>{
    const url=new URL(String(input)),expected=new URL(base);
    if(url.origin!==expected.origin||!['embeddings','chat/completions'].some(path=>url.pathname===`${expected.pathname.replace(/\/$/,'')}/${path}`)||url.search||url.hash||init.method!=='POST')throw new Error('INVALID_PROVIDER_REQUEST');
    const addresses=await new Promise<{address:string;family:number}[]>((resolve,reject)=>{
      const finish=()=>{clearTimeout(timer);init.signal?.removeEventListener('abort',abort)},abort=()=>{finish();reject(new Error('PROVIDER_ABORTED'))};
      const timer=setTimeout(()=>{finish();reject(new Error('PROVIDER_DNS_TIMEOUT'))},5000);
      if(init.signal?.aborted){abort();return}init.signal?.addEventListener('abort',abort,{once:true});
      lookup(url.hostname.replace(/^\[|\]$/g,''),{all:true}).then(rows=>{finish();resolve(rows)},error=>{finish();reject(error)});
    });if(!addresses.length||addresses.some(row=>!publicProviderAddress(row.address)))throw new Error('PROVIDER_PRIVATE_ADDRESS');
    const selected=addresses[0],body=init.body;if(typeof body!=='string'||Buffer.byteLength(body)>512*1024)throw new Error('INVALID_PROVIDER_BODY');
    return new Promise<Response>((resolve,reject)=>{
      const req=request(url,{method:'POST',headers:Object.fromEntries(new Headers(init.headers).entries()),signal:init.signal||undefined,
        lookup:((_host:any,options:any,callback:any)=>options?.all?callback(null,[selected]):callback(null,selected.address,selected.family)) as any},res=>{
        if((res.statusCode||0)>=300&&(res.statusCode||0)<400){res.resume();reject(new Error('PROVIDER_REDIRECT_BLOCKED'));return}
        const parts:Buffer[]=[];let size=0;
        res.on('data',(part:Buffer)=>{size+=part.length;if(size>2*1024*1024){req.destroy(new Error('PROVIDER_RESPONSE_TOO_LARGE'));return}parts.push(part)});
        res.on('error',reject);res.on('end',()=>{try{const headers=new Headers();for(const [key,value] of Object.entries(res.headers))if(value)headers.set(key,Array.isArray(value)?value.join(','):value);const status=res.statusCode||502;resolve(new Response([204,205,304].includes(status)?null:Buffer.concat(parts),{status,headers}))}catch(error){reject(error)}});
      });
      req.setTimeout(15000,()=>req.destroy(new Error('PROVIDER_TIMEOUT')));req.on('error',reject);req.end(body);
    });
  }) as typeof fetch;
}
