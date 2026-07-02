import { ReportingService } from '../src/reporting/reporting.service';
import { AuditService } from '../src/common/audit.service';
import { PrismaService } from '../src/common/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

describe('ReportingService', () => {
  it('filters parent-visible reports by audience', async () => {
    const prisma = {
      report: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'r1',
            tenantId: 'aurora-high',
            type: 'parent_activity',
            payload: { audience: { parentIds: ['parent-1'] } },
            createdAt: new Date(),
          },
          {
            id: 'r2',
            tenantId: 'aurora-high',
            type: 'parent_activity',
            payload: { audience: { parentIds: ['parent-2'] } },
            createdAt: new Date(),
          },
        ]),
      },
    } as unknown as PrismaService;

    const service = new ReportingService(
      prisma,
      { getTenantId: () => 'aurora-high' } as TenantContextService,
      { record: jest.fn() } as unknown as AuditService,
    );

    const reports = await service.list({
      sub: 'parent-1',
      tenantId: 'aurora-high',
      email: 'parent@aurora.local',
      roles: ['parent'],
    });

    expect(reports).toHaveLength(1);
    expect(reports[0].id).toBe('r1');
  });
});
