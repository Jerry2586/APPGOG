import { Type } from 'class-transformer';
import { Equals, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class MediaListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 30;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsString() @Matches(/^[a-z0-9][a-z0-9_-]{0,49}$/) folder?: string;
  @IsOptional() @IsIn(['active', 'archived', 'all']) state: 'active' | 'archived' | 'all' = 'active';
}

export class MediaUploadDto {
  @IsOptional() @IsString() @MaxLength(300) altText?: string;
  @IsOptional() @IsString() @Matches(/^[a-z0-9][a-z0-9_-]{0,49}$/) folder?: string;
}

export class UpdateMediaDto {
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(300) altText?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @Matches(/^[a-z0-9][a-z0-9_-]{0,49}$/) folder?: string;
}

export class RestoreMediaDto {
  @ValidateIf((_object, value) => value !== undefined) @Equals(true) restore = true;
}
