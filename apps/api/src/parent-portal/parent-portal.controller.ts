import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { RequestUser } from '../common/request-user';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { TenantAccessGuard } from '../common/tenant-access.guard';
import { ParentPortalService } from './parent-portal.service';

@Controller('parent-portal')
@UseGuards(JwtAuthGuard, TenantAccessGuard, RolesGuard)
export class ParentPortalController {
  constructor(private readonly parentPortalService: ParentPortalService) {}

  @Get('overview')
  @Roles('platform_owner', 'parent')
  overview(@CurrentUser() user: RequestUser) {
    return this.parentPortalService.overview(user.sub);
  }
}
