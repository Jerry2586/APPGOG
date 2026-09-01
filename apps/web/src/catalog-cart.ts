import {computed,onMounted,onUnmounted,ref} from 'vue';
import {api} from './api';
import {canPurchase,cartIds,cartTotals,type PublicProduct} from './catalog-client';
export const CART_KEY='appgog_catalog_cart_v1';
type CartStorage=Pick<Storage,'getItem'|'setItem'>;
type Resolver=(ids:string[])=>Promise<{items:PublicProduct[];unavailableIds:string[]}>;
export function createCatalogCart(resolve:Resolver,storage?:CartStorage){
  const ids=ref<string[]>([]),items=ref<PublicProduct[]>([]),missing=ref<string[]>([]),loading=ref(false),error=ref(''),storageWarning=ref('');let generation=0;
  function read(){if(!storage){storageWarning.value='浏览器存储不可用，购物车仅在当前页面会话保留';return}try{ids.value=cartIds(storage.getItem(CART_KEY)??storage.getItem('appgog_cart'))}catch{storageWarning.value='浏览器存储不可用，购物车仅在当前页面会话保留'}}
  function persist(){try{storage?.setItem(CART_KEY,JSON.stringify({version:1,ids:ids.value}))}catch{storageWarning.value='无法持久保存购物车，当前会话仍可使用'}}
  async function refresh(){const request=++generation;error.value='';if(!ids.value.length){items.value=[];missing.value=[];loading.value=false;return}loading.value=true;try{const result=await resolve([...ids.value]);if(request!==generation)return;items.value=result.items.filter(item=>ids.value.includes(item.id));missing.value=ids.value.filter(id=>!items.value.some(item=>item.id===id))}catch{if(request===generation){items.value=[];missing.value=[];error.value='商品信息暂时无法核验，购买链接已暂停，请重试'}}finally{if(request===generation)loading.value=false}}
  function add(item:PublicProduct){if(!canPurchase(item))return '商品已售罄或无法购买';if(ids.value.includes(item.id))return '商品已在购物车中';if(ids.value.length>=100)return '购物车最多收录 100 种商品';ids.value=[...ids.value,item.id];persist();void refresh();return ''}
  function remove(id:string){ids.value=ids.value.filter(value=>value!==id);items.value=items.value.filter(item=>item.id!==id);persist();void refresh()}
  function clear(){ids.value=[];persist();void refresh()}
  function sync(value:string|null){ids.value=cartIds(value);void refresh()}
  return {ids,items,missing,loading,error,storageWarning,totals:computed(()=>cartTotals(items.value)),read,refresh,add,remove,clear,sync};
}
let singleton:ReturnType<typeof createCatalogCart>|undefined,users=0,timer:ReturnType<typeof setInterval>|undefined;
const onStorage=(event:StorageEvent)=>{if(event.key===CART_KEY||event.key===null)singleton?.sync(event.newValue)};
const onFocus=()=>{void singleton?.refresh()};
export function useCatalogCart(){
  if(!singleton){let storage:Storage|undefined;try{storage=window.localStorage}catch{}singleton=createCatalogCart(async ids=>(await api.post('/public/products/resolve',{ids})).data,storage)}
  const cart=singleton;
  onMounted(()=>{if(users++===0){cart.read();void cart.refresh();window.addEventListener('storage',onStorage);window.addEventListener('focus',onFocus);timer=setInterval(onFocus,60000)}});
  onUnmounted(()=>{if(--users===0){window.removeEventListener('storage',onStorage);window.removeEventListener('focus',onFocus);clearInterval(timer)}});
  return cart;
}
