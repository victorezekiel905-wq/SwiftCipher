import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { RequestUser } from '../common/request-user';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { TenantAccessGuard } from '../common/tenant-access.guard';
import { BillingService } from './billing.service';
import { ReconcileBillingDto } from './dto';

@Controller('billing')
@UseGuards(JwtAuthGuard, TenantAccessGuard, RolesGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('overview')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'finance', 'support_staff')
  overview() {
    return this.billingService.overview();
  }

  @Post('reconcile')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'finance')
  reconcile(@Body() dto: ReconcileBillingDto, @CurrentUser() user: RequestUser) {
    return this.billingService.reconcile(dto, user);
  }
}
