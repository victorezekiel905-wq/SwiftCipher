import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { TenantAccessGuard } from '../common/tenant-access.guard';
import { RequestUser } from '../common/request-user';
import {
  AutosaveLessonDto,
  CreateLessonDto,
  InstantiateLessonTemplateDto,
  LessonEditorSessionDto,
  PublishLessonTemplateDto,
  ReorderLessonBlocksDto,
  UpdateLessonDto,
} from './dto';
import { LessonsService } from './lessons.service';

@Controller('lessons')
@UseGuards(JwtAuthGuard, TenantAccessGuard, RolesGuard)
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Get('studio/bootstrap')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher')
  studioBootstrap() {
    return this.lessonsService.getStudioBootstrap();
  }

  @Get('templates')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher')
  listTemplates(@Query('classRoomId') classRoomId?: string) {
    return this.lessonsService.listTemplates(classRoomId);
  }

  @Get()
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher')
  list(@Query('classRoomId') classRoomId?: string) {
    return this.lessonsService.list(classRoomId);
  }

  @Get(':id')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'student', 'parent')
  getById(@Param('id') id: string) {
    return this.lessonsService.getById(id);
  }

  @Get(':id/revisions')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher')
  revisions(@Param('id') id: string) {
    return this.lessonsService.listRevisions(id);
  }

  @Post()
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher')
  create(@Body() dto: CreateLessonDto, @CurrentUser() user: RequestUser) {
    return this.lessonsService.create(dto, user.sub);
  }

  @Patch(':id')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher')
  update(@Param('id') id: string, @Body() dto: UpdateLessonDto, @CurrentUser() user: RequestUser) {
    return this.lessonsService.update(id, dto, user.sub);
  }

  @Post(':id/autosave')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher')
  autosave(@Param('id') id: string, @Body() dto: AutosaveLessonDto, @CurrentUser() user: RequestUser) {
    return this.lessonsService.autosave(id, dto, user.sub);
  }

  @Post(':id/reorder-blocks')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher')
  reorder(@Param('id') id: string, @Body() dto: ReorderLessonBlocksDto, @CurrentUser() user: RequestUser) {
    return this.lessonsService.reorderBlocks(id, dto, user.sub);
  }

  @Post(':id/create-version')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher')
  createVersion(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.lessonsService.createVersion(id, user.sub);
  }

  @Post(':id/publish-template')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher')
  publishTemplate(@Param('id') id: string, @Body() dto: PublishLessonTemplateDto, @CurrentUser() user: RequestUser) {
    return this.lessonsService.publishTemplate(id, dto, user.sub);
  }

  @Post('templates/:id/instantiate')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher')
  instantiateTemplate(@Param('id') id: string, @Body() dto: InstantiateLessonTemplateDto, @CurrentUser() user: RequestUser) {
    return this.lessonsService.instantiateTemplate(id, dto, user.sub);
  }

  @Post(':id/revisions/:revisionId/restore')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher')
  restoreRevision(@Param('id') id: string, @Param('revisionId') revisionId: string, @CurrentUser() user: RequestUser) {
    return this.lessonsService.restoreRevision(id, revisionId, user.sub);
  }

  @Post(':id/editor-sessions')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher')
  registerEditorSession(@Param('id') id: string, @Body() dto: LessonEditorSessionDto, @CurrentUser() user: RequestUser) {
    return this.lessonsService.registerEditorSession(id, dto, user.sub);
  }

  @Post(':id/editor-sessions/:sessionId/heartbeat')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher')
  heartbeatEditorSession(@Param('id') id: string, @Param('sessionId') sessionId: string) {
    return this.lessonsService.heartbeatEditorSession(id, sessionId);
  }

  @Delete(':id/editor-sessions/:sessionId')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher')
  closeEditorSession(@Param('id') id: string, @Param('sessionId') sessionId: string) {
    return this.lessonsService.closeEditorSession(id, sessionId);
  }
}
