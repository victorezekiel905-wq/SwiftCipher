import { IsDateString, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateLiveSessionDto {
  @IsString()
  lessonId!: string;

  @IsOptional()
  @IsDateString()
  scheduledStartAt?: string;
}

export class EndLiveSessionDto {
  @IsOptional()
  @IsObject()
  metrics?: Record<string, unknown>;
}
