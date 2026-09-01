import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
export class OperationRevisionDto { @IsInt() @Min(1) baseRevision!: number; }
export class OperationSaveDto {
  @IsInt() @Min(0) baseRevision!: number;
  @IsObject() data!: Record<string, unknown>;
}
export class OperationListDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(1000000) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}
export class ThemeActivateDto extends OperationRevisionDto { @IsInt() @Min(0) baseStateRevision!: number; }
export class PluginRestoreDto extends OperationRevisionDto {
  @IsString() @MaxLength(100) versionId!: string;
  @IsString() @MaxLength(500) changeNote!: string;
  @IsBoolean() acknowledgeRisk!: boolean;
}
