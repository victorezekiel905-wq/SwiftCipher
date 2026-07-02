import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async list() {
    return this.prisma.user.findMany({
      where: { tenantId: this.tenantContext.getTenantId() },
      include: { roles: { include: { role: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
