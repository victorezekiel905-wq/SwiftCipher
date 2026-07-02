import { BillingService } from '../src/billing/billing.service';
import { AuditService } from '../src/common/audit.service';
import { PrismaService } from '../src/common/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

describe('BillingService', () => {
  it('computes MRR from active subscriptions', async () => {
    const prisma = {
      subscription: {
        findMany: jest.fn().mockResolvedValue([
          { status: 'ACTIVE', plan: 'Enterprise Core', seats: 10, createdAt: new Date() },
          { status: 'TRIALING', plan: 'School Growth', seats: 50, createdAt: new Date() },
        ]),
      },
      billingInvoice: { findMany: jest.fn().mockResolvedValue([]) },
      usageSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;

    const service = new BillingService(
      prisma,
      { getTenantId: () => 'aurora-high' } as TenantContextService,
      { record: jest.fn() } as unknown as AuditService,
    );

    const overview = await service.overview();
    expect(overview.metrics.mrrCents).toBe(12000);
    expect(overview.metrics.arrCents).toBe(144000);
  });
});
