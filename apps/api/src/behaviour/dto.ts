import { BehaviourPolarity } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateBehaviourEventDto {
  @IsString()
  studentId!: string;

  @IsString()
  category!: string;

  @IsInt()
  points!: number;

  @IsEnum(BehaviourPolarity)
  polarity!: BehaviourPolarity;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateRewardDto {
  @IsString()
  name!: string;

  @IsInt()
  pointsCost!: number;

  @IsOptional()
  @IsInt()
  inventory?: number;
}
