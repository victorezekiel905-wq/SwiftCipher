import { FeatureFlagsService } from '../src/feature-flags/feature-flags.service';
import { AuditService } from '../src/common/audit.service';
import { PrismaService } from '../src/common/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

describe('FeatureFlagsService', () => {
  it('evaluates role-targeted flags', async () => {
    const prisma = {
      featureFlag: {
        findMany: jest.fn().mockResolvedValue([
          {
            key: 'tenant.support-center',
            enabled: true,
            description: 'Support center',
            payload: { enabledForRoles: ['teacher'], disabledForUserIds: ['u-2'] },
          },
        ]),
      },
    } as unknown as PrismaService;

    const service = new FeatureFlagsService(
      prisma,
      { getTenantId: () => 'aurora-high' } as TenantContextService,
      { record: jest.fn() } as unknown as AuditService,
    );

    const enabled = await service.evaluate({ sub: 'u-1', tenantId: 'aurora-high', email: 't@x.com', roles: ['teacher'] });
    const disabled = await service.evaluate({ sub: 'u-2', tenantId: 'aurora-high', email: 't2@x.com', roles: ['teacher'] });

    expect(enabled[0].enabled).toBe(true);
    expect(disabled[0].enabled).toBe(false);
  });
});
