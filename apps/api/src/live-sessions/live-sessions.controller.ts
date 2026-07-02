import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { RequestUser } from '../common/request-user';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { TenantAccessGuard } from '../common/tenant-access.guard';
import { CreateLiveSessionDto, EndLiveSessionDto } from './dto';
import { LiveSessionsService } from './live-sessions.service';

@Controller('live-sessions')
@UseGuards(JwtAuthGuard, TenantAccessGuard, RolesGuard)
export class LiveSessionsController {
  constructor(private readonly liveSessionsService: LiveSessionsService) {}

  @Get()
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher')
  list() {
    return this.liveSessionsService.list();
  }

  @Post()
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher')
  schedule(@Body() dto: CreateLiveSessionDto, @CurrentUser() user: RequestUser) {
    return this.liveSessionsService.schedule(dto, user.sub);
  }

  @Post(':id/start')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher')
  start(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.liveSessionsService.start(id, user.sub);
  }

  @Post(':id/end')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher')
  end(@Param('id') id: string, @Body() dto: EndLiveSessionDto, @CurrentUser() user: RequestUser) {
    return this.liveSessionsService.end(id, dto, user.sub);
  }

  @Get(':id/teacher-dashboard')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher')
  teacherDashboard(@Param('id') id: string) {
    return this.liveSessionsService.teacherDashboard(id);
  }

  @Get('join/:code')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'student')
  joinByCode(@Param('code') code: string) {
    return this.liveSessionsService.joinByCode(code);
  }
}
