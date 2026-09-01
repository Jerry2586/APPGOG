import {Type} from 'class-transformer';
import {IsBoolean,IsIn,IsInt,IsNumber,IsOptional,IsString,Length,Matches,Max,MaxLength,Min} from 'class-validator';
export class AiQuestionDto {
  @IsString() @Length(1,2000) @Matches(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/) question:string;
}
export class AiSettingsDto {
  @IsInt() @Min(0) baseRevision:number;
  @IsBoolean() enabled:boolean;
  @IsBoolean() autoIndexEnabled:boolean;
  @IsBoolean() globalAssistantEnabled:boolean;
  @IsInt() @Min(1) @Max(10) topK:number;
  @IsNumber() @Min(0) @Max(1) minimumScore:number;
  @IsInt() @Min(1) @Max(60) perMinute:number;
  @IsInt() @Min(1) @Max(600) globalPerMinute:number;
}
export class AiDocumentQueryDto {
  @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(1000000) page=1;
  @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
  @IsOptional() @IsString() @MaxLength(100) contentId?:string;
}
export class AiJobQueryDto extends AiDocumentQueryDto {
  @IsOptional() @IsIn(['PENDING','RUNNING','SUCCEEDED','FAILED']) status?:'PENDING'|'RUNNING'|'SUCCEEDED'|'FAILED';
}
export class AiEmptyDto {}
export class AiReindexDto { @IsOptional() @IsString() @MaxLength(100) afterId?:string; }
export class AiFeedDto { @IsInt() @Min(1) baseRevision:number; @IsBoolean() enabled:boolean; }
