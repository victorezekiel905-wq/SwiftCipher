import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { RequestUser } from '../common/request-user';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { TenantAccessGuard } from '../common/tenant-access.guard';
import { CompleteAssetUploadDto, InitiateAssetUploadDto } from './dto';
import { StorageService } from './storage.service';

@Controller('storage/assets')
@UseGuards(JwtAuthGuard, TenantAccessGuard, RolesGuard)
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Get()
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'support_staff')
  list(@Query('lessonId') lessonId?: string) {
    return this.storageService.listAssets(lessonId);
  }

  @Post('initiate')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'support_staff')
  initiate(@Body() dto: InitiateAssetUploadDto, @CurrentUser() user: RequestUser) {
    return this.storageService.initiateUpload(dto, user);
  }

  @Post(':id/upload')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'support_staff')
  @UseInterceptors(FileInterceptor('file'))
  proxyUpload(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: RequestUser) {
    return this.storageService.uploadAssetViaProxy(id, file, user);
  }

  @Post(':id/complete')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'support_staff')
  complete(@Param('id') id: string, @Body() dto: CompleteAssetUploadDto, @CurrentUser() user: RequestUser) {
    return this.storageService.completeUpload(id, dto, user);
  }

  @Get(':id/download-url')
  @Roles(
    'platform_owner',
    'school_admin',
    'vice_principal',
    'teacher',
    'co_teacher',
    'student',
    'parent',
    'support_staff',
  )
  downloadUrl(@Param('id') id: string) {
    return this.storageService.createDownloadUrl(id);
  }
}
