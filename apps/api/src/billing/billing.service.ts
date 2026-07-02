import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { RequestUser } from '../common/request-user';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ReconcileBillingDto } from './dto';

const PLAN_PRICING: Record<string, { seatUnitCents: number; baseIncludedStorageGb: number }> = {
  'Enterprise Core': { seatUnitCents: 1200, baseIncludedStorageGb: 25 },
  'School Growth': { seatUnitCents: 900, baseIncludedStorageGb: 15 },
  default: { seatUnitCents: 1000, baseIncludedStorageGb: 10 },
};

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  private tenantId() {
    return this.tenantContext.getTenantId();
  }

  async overview() {
    const tenantId = this.tenantId();
    const [subscriptions, invoices, snapshots] = await Promise.all([
      this.prisma.subscription.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.billingInvoice.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 12 }),
      this.prisma.usageSnapshot.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 6 }),
    ]);

    const activeSubscriptions = subscriptions.filter((entry) => entry.status === 'ACTIVE');
    const mrrCents = activeSubscriptions.reduce((sum, entry) => {
      const pricing = PLAN_PRICING[entry.plan] ?? PLAN_PRICING.default;
      return sum + entry.seats * pricing.seatUnitCents;
    }, 0);

    return {
      subscriptions,
      invoices,
      snapshots,
      metrics: {
        activeSubscriptions: activeSubscriptions.length,
        mrrCents,
        arrCents: mrrCents * 12,
      },
    };
  }

  async reconcile(dto: ReconcileBillingDto | undefined, actor: RequestUser) {
    const tenantId = this.tenantId();
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));
    const usage = await this.collectUsage(periodStart, periodEnd);

    const snapshot = await this.prisma.usageSnapshot.create({
      data: {
        tenantId,
        periodStart,
        periodEnd,
        activeUsers: usage.activeUsers,
        classesCount: usage.classesCount,
        lessonsCount: usage.lessonsCount,
        liveSessionsCount: usage.liveSessionsCount,
        quizAttemptsCount: usage.quizAttemptsCount,
        reportsGenerated: usage.reportsGenerated,
        storageGb: usage.storageGb,
        payload: usage.payload as Prisma.InputJsonValue,
      },
    });

    const subscriptions = await this.prisma.subscription.findMany({ where: { tenantId, status: { in: ['ACTIVE', 'TRIALING'] } } });
    const invoices = [] as unknown[];
    if (dto?.includeDraftInvoice !== false) {
      for (const subscription of subscriptions) {
        const invoice = await this.upsertDraftInvoice(subscription.id, subscription.plan, subscription.seats, periodStart, periodEnd, usage);
        invoices.push(invoice);
      }
    }

    await this.audit.record({
      tenantId,
      actorId: actor.sub,
      action: 'billing.reconciled',
      entityType: 'UsageSnapshot',
      entityId: snapshot.id,
      metadata: { periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString(), invoiceCount: invoices.length },
    });

    return { snapshot, invoices };
  }

  private async collectUsage(periodStart: Date, periodEnd: Date) {
    const tenantId = this.tenantId();
    const [activeUsers, classesCount, lessonsCount, liveSessionsCount, quizAttemptsCount, reportsGenerated, assets] = await Promise.all([
      this.prisma.user.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.classRoom.count({ where: { tenantId } }),
      this.prisma.lesson.count({ where: { tenantId } }),
      this.prisma.liveSession.count({ where: { tenantId, startedAt: { gte: periodStart, lte: periodEnd } } }),
      this.prisma.quizAttempt.count({ where: { tenantId, submittedAt: { gte: periodStart, lte: periodEnd } } }),
      this.prisma.report.count({ where: { tenantId, createdAt: { gte: periodStart, lte: periodEnd } } }),
      this.prisma.mediaAsset.findMany({ where: { tenantId, status: 'READY' }, select: { sizeBytes: true, mimeType: true } }),
    ]);

    const totalBytes = assets.reduce((sum, asset) => sum + asset.sizeBytes, 0);
    const storageGb = Number((totalBytes / (1024 ** 3)).toFixed(3));

    return {
      activeUsers,
      classesCount,
      lessonsCount,
      liveSessionsCount,
      quizAttemptsCount,
      reportsGenerated,
      storageGb,
      payload: {
        storageBytes: totalBytes,
        assetsByMimeType: assets.reduce<Record<string, number>>((acc, asset) => {
          acc[asset.mimeType] = (acc[asset.mimeType] ?? 0) + 1;
          return acc;
        }, {}),
      },
    };
  }

  private async upsertDraftInvoice(
    subscriptionId: string,
    plan: string,
    seats: number,
    periodStart: Date,
    periodEnd: Date,
    usage: Awaited<ReturnType<BillingService['collectUsage']>>,
  ) {
    const pricing = PLAN_PRICING[plan] ?? PLAN_PRICING.default;
    const includedStorageGb = pricing.baseIncludedStorageGb;
    const storageOverageGb = Math.max(0, usage.storageGb - includedStorageGb);
    const storageOverageCents = Math.round(storageOverageGb * 200);
    const seatSubtotal = seats * pricing.seatUnitCents;
    const usageOverageCents = Math.max(0, usage.liveSessionsCount - 100) * 25 + Math.max(0, usage.reportsGenerated - 25) * 15;
    const subtotalCents = seatSubtotal + storageOverageCents + usageOverageCents;
    const taxCents = Math.round(subtotalCents * 0.07);
    const totalCents = subtotalCents + taxCents;
    const invoiceNumber = `${this.tenantId().toUpperCase()}-${periodStart.getUTCFullYear()}${String(periodStart.getUTCMonth() + 1).padStart(2, '0')}-${subscriptionId.slice(-6).toUpperCase()}`;
    const lineItems = [
      { code: 'seats', description: `${plan} seats`, quantity: seats, unitCents: pricing.seatUnitCents, amountCents: seatSubtotal },
      { code: 'storage_overage', description: 'Storage overage', quantity: Number(storageOverageGb.toFixed(3)), unitCents: 200, amountCents: storageOverageCents },
      { code: 'usage_overage', description: 'High-volume classroom usage', quantity: usage.liveSessionsCount + usage.reportsGenerated, unitCents: null, amountCents: usageOverageCents },
    ];

    return this.prisma.billingInvoice.upsert({
      where: { tenantId_invoiceNumber: { tenantId: this.tenantId(), invoiceNumber } },
      update: {
        subtotalCents,
        taxCents,
        totalCents,
        periodStart,
        periodEnd,
        lineItems: lineItems as Prisma.InputJsonValue,
        metadata: usage.payload as Prisma.InputJsonValue,
      },
      create: {
        tenantId: this.tenantId(),
        subscriptionId,
        invoiceNumber,
        subtotalCents,
        taxCents,
        totalCents,
        periodStart,
        periodEnd,
        lineItems: lineItems as Prisma.InputJsonValue,
        metadata: usage.payload as Prisma.InputJsonValue,
      },
    });
  }
}
