import {BadRequestException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {cmsSlug,cmsUrl,renderCmsBody} from './cms-content';
import {MONEY_PATTERN,type CatalogWriteDto} from './catalog.dto';
export function catalogMoney(value:string|number){if(!MONEY_PATTERN.test(String(value)))throw new BadRequestException('金额超限或小数超过两位');return new Prisma.Decimal(String(value)).toFixed(2)}
export function purchaseUrl(value:string,required=false){
  if(!value.trim()){if(required)throw new BadRequestException('发布商品必须填写外部购买链接');return ''}
  const url=cmsUrl(value)!;if(!/^https?:\/\//i.test(url))throw new BadRequestException('购买地址必须是完整 HTTP/HTTPS 外链');return url;
}
export function normalizeProduct(input:CatalogWriteDto){
  const name=input.name.trim();if(!name)throw new BadRequestException('商品名称不能为空');
  const price=catalogMoney(input.price),compareAtPrice=input.compareAtPrice===''?null:catalogMoney(input.compareAtPrice);
  if(compareAtPrice&&new Prisma.Decimal(compareAtPrice).lessThan(price))throw new BadRequestException('划线价不能低于售价');
  const gallery=input.gallery.map(url=>cmsUrl(url));if(gallery.some(url=>!url))throw new BadRequestException('相册地址不能为空');
  if(new Set(gallery).size!==gallery.length)throw new BadRequestException('相册图片重复');
  return {kind:input.kind,name,slug:cmsSlug(input.slug),sku:input.sku.trim()||null,summary:input.summary.trim()||null,description:input.description,
    currency:input.currency,price,compareAtPrice,stock:input.stock,sales:input.sales,coverUrl:cmsUrl(input.coverUrl),gallery:gallery as string[],
    externalUrl:purchaseUrl(input.externalUrl),categoryId:input.categoryId||null,seoTitle:input.seoTitle.trim()||null,seoDescription:input.seoDescription.trim()||null,seoKeywords:input.seoKeywords.trim()||null,ogImage:cmsUrl(input.ogImage)};
}
export function productSnapshot(row:any,publishing=false){
  const safeImage=(value:string|null)=>{try{return cmsUrl(value)}catch(error){if(publishing)throw error;return null}};
  let externalUrl='';try{externalUrl=purchaseUrl(row.externalUrl||'',publishing)}catch(error){if(publishing)throw error}
  const snapshot={kind:row.kind,sku:row.sku,name:row.name,slug:row.slug,summary:row.summary,description:row.description||'',currency:row.currency,
    price:catalogMoney(row.price),compareAtPrice:row.compareAtPrice==null?null:catalogMoney(row.compareAtPrice),stock:row.stock,sales:row.sales,
    coverUrl:safeImage(row.coverUrl),gallery:(Array.isArray(row.gallery)?row.gallery:[]).map(safeImage).filter(Boolean) as string[],externalUrl,
    categoryId:row.categoryId,seoTitle:row.seoTitle,seoDescription:row.seoDescription,seoKeywords:row.seoKeywords,ogImage:safeImage(row.ogImage)};
  return {snapshot,html:renderCmsBody(snapshot.description,'MARKDOWN'),available:Number.isInteger(snapshot.stock)&&snapshot.stock>0&&!!externalUrl};
}
