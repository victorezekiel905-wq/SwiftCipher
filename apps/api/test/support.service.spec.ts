import { SupportTicketPriority, SupportTicketStatus } from '@prisma/client';
import { SupportService } from '../src/support/support.service';
import { AuditService } from '../src/common/audit.service';
import { PrismaService } from '../src/common/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

describe('SupportService', () => {
  it('creates SLA-backed tickets', async () => {
    const prisma = {
      supportTicket: {
        create: jest.fn().mockResolvedValue({
          id: 't-1',
          title: 'Portal issue',
          description: 'Mismatch',
          category: 'parent-portal',
          priority: SupportTicketPriority.HIGH,
          status: SupportTicketStatus.OPEN,
          dueAt: new Date(Date.now() + 7 * 60 * 60 * 1000),
          createdBy: { id: 'parent-1', firstName: 'Pat', lastName: 'Reed', email: 'p@x.com' },
          assignedTo: null,
        }),
      },
    } as unknown as PrismaService;

    const service = new SupportService(
      prisma,
      { getTenantId: () => 'aurora-high' } as TenantContextService,
      { record: jest.fn() } as unknown as AuditService,
    );

    const result = await service.create(
      {
        title: 'Portal issue',
        description: 'Mismatch',
        category: 'parent-portal',
        priority: SupportTicketPriority.HIGH,
      },
      { sub: 'parent-1', tenantId: 'aurora-high', email: 'p@x.com', roles: ['parent'] },
    );

    expect(result.priority).toBe(SupportTicketPriority.HIGH);
    expect(result.sla.remainingMinutes).toBeGreaterThan(0);
  });
});
