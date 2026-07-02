import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { TenantAccessGuard } from '../common/tenant-access.guard';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, TenantAccessGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'parent', 'support_staff', 'finance')
  list() {
    return this.usersService.list();
  }
}
