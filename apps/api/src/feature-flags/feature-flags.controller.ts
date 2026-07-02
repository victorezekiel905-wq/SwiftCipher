import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { RequestUser } from '../common/request-user';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { TenantAccessGuard } from '../common/tenant-access.guard';
import { EvaluateFeatureFlagsDto, UpsertFeatureFlagDto } from './dto';
import { FeatureFlagsService } from './feature-flags.service';

@Controller('feature-flags')
@UseGuards(JwtAuthGuard, TenantAccessGuard, RolesGuard)
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  @Get()
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'support_staff', 'finance', 'teacher', 'co_teacher')
  list() {
    return this.featureFlagsService.list();
  }

  @Post('evaluate')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'support_staff', 'finance', 'teacher', 'co_teacher', 'student', 'parent')
  evaluate(@CurrentUser() user: RequestUser, @Body() dto: EvaluateFeatureFlagsDto) {
    return this.featureFlagsService.evaluate(user, dto);
  }

  @Put(':key')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'support_staff')
  upsert(@Param('key') key: string, @Body() dto: UpsertFeatureFlagDto, @CurrentUser() user: RequestUser) {
    return this.featureFlagsService.upsert(key, dto, user);
  }
}
