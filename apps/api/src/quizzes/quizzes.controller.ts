import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { RequestUser } from '../common/request-user';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { TenantAccessGuard } from '../common/tenant-access.guard';
import { CreateQuizDto, SubmitQuizAttemptDto, UpdateQuizDto } from './dto';
import { QuizzesService } from './quizzes.service';

@Controller('quizzes')
@UseGuards(JwtAuthGuard, TenantAccessGuard, RolesGuard)
export class QuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}

  @Get()
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'student', 'parent')
  list(@Query('classRoomId') classRoomId?: string) {
    return this.quizzesService.list(classRoomId);
  }

  @Get(':id')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'student', 'parent')
  getById(@Param('id') id: string) {
    return this.quizzesService.getById(id);
  }

  @Post()
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher')
  create(@Body() dto: CreateQuizDto, @CurrentUser() user: RequestUser) {
    return this.quizzesService.create(dto, user.sub);
  }

  @Patch(':id')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher')
  update(@Param('id') id: string, @Body() dto: UpdateQuizDto, @CurrentUser() user: RequestUser) {
    return this.quizzesService.update(id, dto, user.sub);
  }

  @Post(':id/attempts')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'student')
  submitAttempt(@Param('id') id: string, @Body() dto: SubmitQuizAttemptDto, @CurrentUser() user: RequestUser) {
    return this.quizzesService.submitAttempt(id, user.sub, dto);
  }

  @Get(':id/analytics')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher')
  analytics(@Param('id') id: string) {
    return this.quizzesService.analytics(id);
  }
}
