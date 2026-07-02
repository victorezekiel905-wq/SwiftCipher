import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { RequestUser } from '../common/request-user';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { TenantAccessGuard } from '../common/tenant-access.guard';
import { GenerateReportDto } from './dto';
import { ReportingService } from './reporting.service';

@Controller('reporting')
@UseGuards(JwtAuthGuard, TenantAccessGuard, RolesGuard)
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  @Get()
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'student', 'parent', 'support_staff', 'finance')
  list(@CurrentUser() user: RequestUser) {
    return this.reportingService.list(user);
  }

  @Get(':id')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'student', 'parent', 'support_staff', 'finance')
  getById(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.reportingService.getById(id, user);
  }

  @Post('generate')
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'parent', 'support_staff', 'finance')
  generate(@Body() dto: GenerateReportDto, @CurrentUser() user: RequestUser) {
    return this.reportingService.generate(dto, user);
  }
}
