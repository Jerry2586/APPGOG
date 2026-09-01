import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class CmsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsString() @MaxLength(100) categoryId?: string;
  @IsOptional() @IsIn(['ARTICLE', 'FAQ', 'VIDEO']) type?: 'ARTICLE' | 'FAQ' | 'VIDEO';
  @IsOptional() @IsIn(['DRAFT', 'PUBLISHED', 'OFFLINE', 'ARCHIVED']) status?: 'DRAFT' | 'PUBLISHED' | 'OFFLINE' | 'ARCHIVED';
  @IsOptional() @IsIn(['newest', 'oldest', 'viewsDesc']) sort: string = 'newest';
}
export class CategoryQueryDto {
  @IsOptional() @IsIn(['CONTENT', 'PRODUCT']) scope?: 'CONTENT' | 'PRODUCT';
}
export class CmsWriteDto {
  @IsOptional() @IsInt() @Min(1) baseRevision?: number;
  @IsIn(['ARTICLE', 'FAQ', 'VIDEO']) type: 'ARTICLE' | 'FAQ' | 'VIDEO';
  @IsIn(['MARKDOWN', 'RICH_TEXT']) format: 'MARKDOWN' | 'RICH_TEXT';
  @IsString() @MaxLength(200) title: string;
  @IsString() @MaxLength(160) slug: string;
  @IsString() @MaxLength(1000) summary = '';
  @IsString() @MaxLength(100000) body = '';
  @IsString() @MaxLength(1000) faqQuestion = '';
  @IsString() @MaxLength(100000) faqAnswer = '';
  @IsString() @MaxLength(2000) coverUrl = '';
  @IsString() @MaxLength(2000) videoUrl = '';
  @IsString() @MaxLength(100) categoryId = '';
  @IsBoolean() ragEnabled = false;
  @IsString() @MaxLength(200) seoTitle = '';
  @IsString() @MaxLength(500) seoDescription = '';
  @IsString() @MaxLength(500) seoKeywords = '';
  @IsString() @MaxLength(2000) ogImage = '';
}
export class CmsRevisionDto {
  @IsInt() @Min(1) baseRevision: number;
}
export class CmsStatusDto extends CmsRevisionDto {
  @IsIn(['DRAFT', 'OFFLINE', 'ARCHIVED']) status: 'DRAFT' | 'OFFLINE' | 'ARCHIVED';
}
export class CategoryWriteDto {
  @IsOptional() @IsInt() @Min(1) baseRevision?: number;
  @IsIn(['CONTENT', 'PRODUCT']) scope: 'CONTENT' | 'PRODUCT' = 'CONTENT';
  @IsString() @MaxLength(100) name: string;
  @IsString() @MaxLength(160) slug: string;
  @IsString() @MaxLength(1000) description = '';
  @ValidateIf((_object, value) => value !== null) @IsString() @MaxLength(100) parentId: string | null = null;
  @IsInt() @Min(-1000000) @Max(1000000) sort = 0;
}
