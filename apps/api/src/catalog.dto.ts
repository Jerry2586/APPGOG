import {Type} from 'class-transformer';
import {ArrayMaxSize,ArrayUnique,IsArray,IsIn,IsInt,IsOptional,IsString,Matches,Max,MaxLength,Min,ValidateBy} from 'class-validator';
export const MONEY_PATTERN=/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;
const Money=(optional=false)=>ValidateBy({name:'money',validator:{validate:(value:unknown)=>(optional&&value==='')||((typeof value==='string'||typeof value==='number')&&MONEY_PATTERN.test(String(value))),defaultMessage:()=> '金额必须是非负数字，最多 10 位整数和 2 位小数'}});
export class CatalogWriteDto {
  @IsOptional() @IsInt() @Min(1) baseRevision?:number;
  @IsIn(['ACCOUNT','SERVICE','DEVICE','OTHER']) kind:'ACCOUNT'|'SERVICE'|'DEVICE'|'OTHER'='OTHER';
  @IsString() @MaxLength(200) name:string;
  @IsString() @MaxLength(160) slug:string;
  @IsString() @MaxLength(100) sku='';
  @IsString() @MaxLength(1000) summary='';
  @IsString() @MaxLength(100000) description='';
  @IsString() @Matches(/^[A-Z]{3}$/) currency='USD';
  @Money() price:string|number;
  @Money(true) compareAtPrice:string|number='';
  @IsInt() @Min(0) @Max(2147483647) stock=0;
  @IsInt() @Min(0) @Max(2147483647) sales=0;
  @IsString() @MaxLength(2000) coverUrl='';
  @IsArray() @ArrayMaxSize(30) @ArrayUnique() @IsString({each:true}) @MaxLength(2000,{each:true}) gallery:string[]=[];
  @IsString() @MaxLength(2000) externalUrl='';
  @IsString() @MaxLength(100) categoryId='';
  @IsString() @MaxLength(200) seoTitle='';
  @IsString() @MaxLength(500) seoDescription='';
  @IsString() @MaxLength(500) seoKeywords='';
  @IsString() @MaxLength(2000) ogImage='';
}
export class CatalogQueryDto {
  @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(1000000) page=1;
  @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
  @IsOptional() @IsString() @MaxLength(100) search?:string;
  @IsOptional() @IsString() @MaxLength(100) categoryId?:string;
  @IsOptional() @IsIn(['DRAFT','PUBLISHED','OFFLINE','ARCHIVED']) status?:'DRAFT'|'PUBLISHED'|'OFFLINE'|'ARCHIVED';
  @IsOptional() @IsIn(['salesDesc','priceAsc','priceDesc','newest','oldest']) sort='salesDesc';
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) currency?:string;
}
export class CatalogResolveDto {
  @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsString({each:true}) @MaxLength(100,{each:true}) ids:string[];
}
