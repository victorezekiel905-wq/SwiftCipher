import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { RequestUser } from '../common/request-user';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { TenantAccessGuard } from '../common/tenant-access.guard';
import { BehaviourService } from './behaviour.service';
import { CreateBehaviourEventDto, CreateRewardDto } from './dto';

@Controller('behaviour')
@UseGuards(JwtAuthGuard, TenantAccessGuard, RolesGuard)
export class BehaviourController {
  constructor(private readonly behaviourService: BehaviourService) {}

  @Post('events')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher')
  createEvent(@Body() dto: CreateBehaviourEventDto, @CurrentUser() user: RequestUser) {
    return this.behaviourService.createEvent(dto, user.sub);
  }

  @Get('students/:studentId/timeline')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'student', 'parent')
  studentTimeline(@Param('studentId') studentId: string) {
    return this.behaviourService.studentTimeline(studentId);
  }

  @Get('summary')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'parent')
  summary(@Query('classRoomId') classRoomId?: string) {
    return this.behaviourService.summary(classRoomId);
  }

  @Get('rewards')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'student', 'parent')
  listRewards() {
    return this.behaviourService.listRewards();
  }

  @Post('rewards')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher')
  createReward(@Body() dto: CreateRewardDto, @CurrentUser() user: RequestUser) {
    return this.behaviourService.createReward(dto, user.sub);
  }
}
