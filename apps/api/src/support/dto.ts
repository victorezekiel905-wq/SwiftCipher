import { SupportTicketPriority, SupportTicketStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateSupportTicketDto {
  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @IsString()
  category!: string;

  @IsOptional()
  @IsEnum(SupportTicketPriority)
  priority?: SupportTicketPriority;

  @IsOptional()
  @IsString()
  relatedEntityType?: string;

  @IsOptional()
  @IsString()
  relatedEntityId?: string;
}

export class AddSupportTicketCommentDto {
  @IsString()
  body!: string;

  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}

export class AssignSupportTicketDto {
  @IsString()
  assignedToId!: string;
}

export class TransitionSupportTicketDto {
  @IsEnum(SupportTicketStatus)
  status!: SupportTicketStatus;
}
