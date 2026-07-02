import { QuizQuestionType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsObject, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class QuizQuestionDto {
  @IsEnum(QuizQuestionType)
  type!: QuizQuestionType;

  @IsString()
  prompt!: string;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  points?: number;
}

export class CreateQuizDto {
  @IsString()
  classRoomId!: string;

  @IsString()
  title!: string;

  @IsObject()
  settings!: Record<string, unknown>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizQuestionDto)
  questions!: QuizQuestionDto[];
}

export class UpdateQuizDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizQuestionDto)
  questions?: QuizQuestionDto[];
}

export class AttemptAnswerDto {
  @IsString()
  questionId!: string;

  answer!: unknown;
}

export class SubmitQuizAttemptDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttemptAnswerDto)
  answers!: AttemptAnswerDto[];
}
