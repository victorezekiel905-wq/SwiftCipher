import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { RequestUser } from '../common/request-user';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { TenantAccessGuard } from '../common/tenant-access.guard';
import {
  AddSupportTicketCommentDto,
  AssignSupportTicketDto,
  CreateSupportTicketDto,
  TransitionSupportTicketDto,
} from './dto';
import { SupportService } from './support.service';

@Controller('support')
@UseGuards(JwtAuthGuard, TenantAccessGuard, RolesGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get('tickets')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'support_staff', 'finance', 'teacher', 'co_teacher', 'student', 'parent')
  list(@CurrentUser() user: RequestUser) {
    return this.supportService.list(user);
  }

  @Get('summary')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'support_staff', 'finance', 'teacher', 'co_teacher', 'student', 'parent')
  summary(@CurrentUser() user: RequestUser) {
    return this.supportService.summary(user);
  }

  @Post('tickets')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'support_staff', 'finance', 'teacher', 'co_teacher', 'student', 'parent')
  create(@Body() dto: CreateSupportTicketDto, @CurrentUser() user: RequestUser) {
    return this.supportService.create(dto, user);
  }

  @Patch('tickets/:id/assign')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'support_staff')
  assign(@Param('id') id: string, @Body() dto: AssignSupportTicketDto, @CurrentUser() user: RequestUser) {
    return this.supportService.assign(id, dto, user);
  }

  @Patch('tickets/:id/status')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'support_staff', 'finance', 'teacher', 'co_teacher', 'student', 'parent')
  transition(@Param('id') id: string, @Body() dto: TransitionSupportTicketDto, @CurrentUser() user: RequestUser) {
    return this.supportService.transition(id, dto, user);
  }

  @Post('tickets/:id/comments')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'support_staff', 'finance', 'teacher', 'co_teacher', 'student', 'parent')
  addComment(@Param('id') id: string, @Body() dto: AddSupportTicketCommentDto, @CurrentUser() user: RequestUser) {
    return this.supportService.addComment(id, dto, user);
  }
}
