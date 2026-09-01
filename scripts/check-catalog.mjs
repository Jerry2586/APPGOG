import {readFileSync,existsSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const failures=[];
for(const path of ['apps/api/src/catalog.controller.ts','apps/api/src/catalog.service.ts','apps/api/src/catalog.dto.ts','apps/api/src/catalog-content.ts','apps/api/src/catalog-content.spec.ts','apps/api/src/catalog.http.spec.ts','apps/web/src/components/ProductManager.vue','apps/web/src/components/ProductDetails.vue','apps/web/src/components/blocks/CatalogBlock.vue','apps/web/src/catalog-client.ts','apps/web/src/catalog-cart.ts','apps/web/src/catalog-cart.spec.ts','apps/web/src/catalog.css','scripts/catalog-browser.mjs','docs/09-INDEPENDENT-CATALOG.md'])if(!existsSync(new URL('../'+path,import.meta.url)))failures.push('缺少 '+path);
const check=(file,pattern,message)=>{if(!pattern.test(read(file)))failures.push(message)};
check('apps/api/src/catalog.service.ts',/publishedSnapshot:snapshot/,'商品发布未生成独立快照');
check('apps/api/src/catalog.service.ts',/Prisma\.TransactionIsolationLevel\.Serializable/,'商品变更未串行化');
check('apps/api/src/catalog.service.ts',/this\.revision\(/,'商品缺少乐观版本校验');
check('apps/api/src/catalog.service.ts',/PRODUCT_STATUS_CHANGED/,'商品缺少状态审计');
check('apps/api/src/catalog.service.ts',/publishedPrice/,'公开价格排序未隔离草稿');
check('apps/api/src/catalog.service.ts',/publishedSales/,'公开销量排序未隔离草稿');
check('apps/api/src/catalog.dto.ts',/\['ACCOUNT','SERVICE','DEVICE','OTHER'\]/,'缺少非流量商品类型限制');
check('apps/api/src/catalog-content.ts',/renderCmsBody\(snapshot\.description,'MARKDOWN'\)/,'商品正文未安全渲染');
check('apps/api/src/catalog-content.ts',/price:catalogMoney\(row\.price\)/,'公开价格未统一精度');
check('apps/api/src/catalog.controller.ts',/Post\('products\/resolve'\)/,'缺少购物车只读核验接口');
check('apps/web/src/component-registry.ts',/products: CatalogBlock, cart: CatalogBlock/,'商品与购物车未接入共用渲染器');
for(const path of ['apps/web/src/components/blocks/CatalogBlock.vue','apps/web/src/components/ProductDetails.vue']){
  const anchors=read(path).match(/<a\b[^>]*>/g)||[];
  if(!anchors.length||anchors.some(anchor=>!anchor.includes('target="_blank"')||!anchor.includes('rel="noopener noreferrer"')))failures.push(path+' 存在未安全新窗口外跳的购买入口');
  check(path,/canPurchase\(item\)/,'购买入口缺少售罄判断：'+path);
}
check('apps/web/src/catalog-cart.ts',/JSON\.stringify\(\{version:1,ids:ids\.value\}\)/,'购物车未仅持久保存商品 ID');
check('apps/web/src/catalog-cart.ts',/api\.post\('\/public\/products\/resolve',\{ids\}\)/,'购物车未重新核验公开商品');
check('apps/web/src/catalog-cart.ts',/items\.value=\[\];missing\.value=\[\];error\.value=/,'购物车核验失败未暂停旧购买链接');
check('apps/web/src/components/ProductManager.vue',/MediaPicker/,'商品后台缺少媒体选择器');
check('apps/web/src/components/PageEditor.vue',/categoryOptions/,'组件分类绑定未接入分类选项');
const models=read('apps/api/src/admin.controller.ts').match(/const models = \[([\s\S]*?)\] as const/)?.[1]||'';
if(/'product'/.test(models))failures.push('商品仍可绕过专用接口');
if(/model\s+(Order|Payment|Checkout|XboardUser)\s*\{/i.test(read('apps/api/prisma/schema.prisma')))failures.push('独立商品越界引入结算或共享身份数据');
const migration='apps/api/prisma/migrations/20260831090000_stage9_catalog/migration.sql';
for(const marker of ['Product_public_snapshot_check','Product_publishedSlug_key','Product_status_publishedPrice_idx','Product_status_publishedSales_idx','BEGIN;','COMMIT;'])check(migration,new RegExp(marker),'商品迁移缺少 '+marker);
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log('APPGOG 第九阶段静态守卫通过：商品专用接口、发布隔离、独立购物车、新窗口外购和迁移文件完整（不替代真实数据库/浏览器验收）。');
