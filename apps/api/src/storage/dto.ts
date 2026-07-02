import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class InitiateAssetUploadDto {
  @IsString()
  fileName!: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsString()
  contentType!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @IsOptional()
  @IsString()
  lessonId?: string;
}

export class CompleteAssetUploadDto {
  @IsOptional()
  @IsString()
  checksum?: string;
}
