import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class AudienceDto {
  @IsOptional()
  @IsBoolean()
  includeAll?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  userIds?: string[];
}

class StoryMediaDto {
  @IsString()
  @IsIn(['image', 'video', 'document'])
  type!: 'image' | 'video' | 'document';

  @IsUrl({ require_tld: false })
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  caption?: string;
}

export class CreateThreadDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  subject?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  participantIds!: string[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body!: string;
}

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body!: string;
}

export class CreateAnnouncementDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AudienceDto)
  audience?: AudienceDto;
}

export class CreateStoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => StoryMediaDto)
  media!: StoryMediaDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => AudienceDto)
  visibility?: AudienceDto;
}

export class BroadcastNotificationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AudienceDto)
  audience?: AudienceDto;
}

export type AudienceInput = {
  includeAll?: boolean;
  roles?: string[];
  userIds?: string[];
};

export type StoryMediaInput = {
  type: 'image' | 'video' | 'document';
  url: string;
  caption?: string;
};
