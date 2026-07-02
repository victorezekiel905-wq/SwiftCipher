import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { RequestUser } from '../common/request-user';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { TenantAccessGuard } from '../common/tenant-access.guard';
import { CommunicationsService } from './communications.service';
import {
  BroadcastNotificationDto,
  CreateAnnouncementDto,
  CreateStoryDto,
  CreateThreadDto,
  SendMessageDto,
} from './dto';

@Controller('communications')
@UseGuards(JwtAuthGuard, TenantAccessGuard, RolesGuard)
export class CommunicationsController {
  constructor(private readonly communicationsService: CommunicationsService) {}

  @Get('overview')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'student', 'parent', 'support_staff', 'finance')
  overview(@CurrentUser() user: RequestUser) {
    return this.communicationsService.overview(user);
  }

  @Get('threads')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'student', 'parent', 'support_staff', 'finance')
  inbox(@CurrentUser() user: RequestUser) {
    return this.communicationsService.listInbox(user);
  }

  @Get('threads/:id')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'student', 'parent', 'support_staff', 'finance')
  thread(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.communicationsService.getThread(id, user);
  }

  @Post('threads')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'student', 'parent', 'support_staff')
  createThread(@Body() dto: CreateThreadDto, @CurrentUser() user: RequestUser) {
    return this.communicationsService.createThread(dto, user);
  }

  @Post('threads/:id/messages')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'student', 'parent', 'support_staff', 'finance')
  sendMessage(@Param('id') id: string, @Body() dto: SendMessageDto, @CurrentUser() user: RequestUser) {
    return this.communicationsService.sendMessage(id, dto, user);
  }

  @Get('announcements')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'student', 'parent', 'support_staff', 'finance')
  announcements() {
    return this.communicationsService.listAnnouncements();
  }

  @Post('announcements')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'support_staff')
  createAnnouncement(@Body() dto: CreateAnnouncementDto, @CurrentUser() user: RequestUser) {
    return this.communicationsService.createAnnouncement(dto, user);
  }

  @Get('stories')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'student', 'parent', 'support_staff', 'finance')
  stories() {
    return this.communicationsService.listStories();
  }

  @Post('stories')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'support_staff')
  createStory(@Body() dto: CreateStoryDto, @CurrentUser() user: RequestUser) {
    return this.communicationsService.createStory(dto, user);
  }

  @Get('notifications')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'student', 'parent', 'support_staff', 'finance')
  notifications(@CurrentUser() user: RequestUser) {
    return this.communicationsService.listNotifications(user.sub);
  }

  @Patch('notifications/:id/read')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'student', 'parent', 'support_staff', 'finance')
  markRead(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.communicationsService.markNotificationRead(id, user);
  }

  @Post('notifications/broadcast')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'support_staff')
  broadcast(@Body() dto: BroadcastNotificationDto, @CurrentUser() user: RequestUser) {
    return this.communicationsService.broadcastNotification(dto, user);
  }
}
