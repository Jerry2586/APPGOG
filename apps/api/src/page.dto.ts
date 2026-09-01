import { RouteType } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePageDto {
  @IsString() @MinLength(1) @MaxLength(100)
  name!: string;

  @IsString() @MinLength(1) @MaxLength(200)
  slug!: string;

  @IsEnum(RouteType)
  routeType!: RouteType;

  @IsOptional() @IsString() @MaxLength(2048)
  redirectUrl?: string | null;

  @IsOptional() @IsString() @MaxLength(200)
  seoTitle?: string | null;

  @IsOptional() @IsString() @MaxLength(500)
  seoDescription?: string | null;

  @IsOptional() @IsString() @MaxLength(500)
  seoKeywords?: string | null;

  @IsOptional() @IsString() @MaxLength(2048)
  ogImage?: string | null;

  @IsArray() @ArrayMaxSize(500)
  layout!: unknown[];

  @IsOptional() @Type(() => Number) @IsInt() @IsIn([1])
  schemaVersion = 1;

  @IsOptional() @IsString() @MaxLength(500)
  changeNote?: string;
}

export class SavePageDraftDto extends CreatePageDto {
  @IsString() @MinLength(1) @MaxLength(100)
  baseVersionId!: string;
}

export class PublishPageDto {
  @IsString() @MinLength(1) @MaxLength(100)
  draftVersionId!: string;
}

export class InstallSiteStarterDto {
  @IsInt() @IsIn([1])
  version!: number;
}

export class ChangePageStatusDto {
  @IsString() @IsIn(['DRAFT', 'OFFLINE', 'ARCHIVED'])
  status!: 'DRAFT' | 'OFFLINE' | 'ARCHIVED';
}

export class RestorePageVersionDto {
  @IsString() @MinLength(1) @MaxLength(100)
  versionId!: string;

  @IsString() @MinLength(1) @MaxLength(100)
  baseVersionId!: string;

  @IsOptional() @IsString() @MaxLength(500)
  changeNote?: string;
}
