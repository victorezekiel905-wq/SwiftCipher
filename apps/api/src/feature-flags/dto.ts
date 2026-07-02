import { IsArray, IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class UpsertFeatureFlagDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class EvaluateFeatureFlagsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keys?: string[];
}
