import { LessonBlockType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class LessonBlockDto {
  @IsEnum(LessonBlockType)
  type!: LessonBlockType;

  @IsString()
  @MaxLength(160)
  title!: string;

  @IsObject()
  content!: Record<string, unknown>;
}

export class CreateLessonDto {
  @IsString()
  classRoomId!: string;

  @IsString()
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isTemplate?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LessonBlockDto)
  blocks!: LessonBlockDto[];
}

export class UpdateLessonDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isTemplate?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LessonBlockDto)
  blocks?: LessonBlockDto[];

  @IsOptional()
  @IsString()
  summary?: string;
}

export class AutosaveLessonDto extends UpdateLessonDto {}

export class ReorderLessonBlocksDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderLessonBlockItemDto)
  blocks!: ReorderLessonBlockItemDto[];

  @IsOptional()
  @IsString()
  summary?: string;
}

export class ReorderLessonBlockItemDto {
  @IsString()
  id!: string;

  @IsInt()
  @Min(0)
  position!: number;
}

export class PublishLessonTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class InstantiateLessonTemplateDto {
  @IsString()
  classRoomId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;
}

export class LessonEditorSessionDto {
  @IsString()
  sessionKey!: string;

  @IsOptional()
  @IsString()
  deviceLabel?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;
}
