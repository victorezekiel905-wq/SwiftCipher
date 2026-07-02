import { CommunicationsService } from '../src/communications/communications.service';
import { AuditService } from '../src/common/audit.service';
import { PrismaService } from '../src/common/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

describe('CommunicationsService', () => {
  it('broadcasts notifications to the resolved audience', async () => {
    const tx = {
      notification: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]),
      },
      $transaction: jest.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService;

    const service = new CommunicationsService(
      prisma,
      { getTenantId: () => 'aurora-high' } as TenantContextService,
      { record: jest.fn() } as unknown as AuditService,
    );

    const result = await service.broadcastNotification(
      {
        title: 'System maintenance',
        body: 'Platform maintenance begins at 21:00 UTC.',
        audience: { roles: ['teacher'] },
      },
      {
        sub: 'admin-1',
        tenantId: 'aurora-high',
        email: 'admin@aurora.local',
        roles: ['school_admin'],
      },
    );

    expect(result.recipientCount).toBe(2);
    expect(tx.notification.createMany).toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalled();
  });
});
