import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { RequestUser } from '../common/request-user';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { EvaluateFeatureFlagsDto, UpsertFeatureFlagDto } from './dto';

@Injectable()
export class FeatureFlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  private tenantId() {
    return this.tenantContext.getTenantId();
  }

  async list() {
    return this.prisma.featureFlag.findMany({
      where: { tenantId: this.tenantId() },
      orderBy: [{ enabled: 'desc' }, { key: 'asc' }],
    });
  }

  async upsert(key: string, dto: UpsertFeatureFlagDto, actor: RequestUser) {
    const tenantId = this.tenantId();
    const record = await this.prisma.featureFlag.upsert({
      where: { tenantId_key: { tenantId, key } },
      update: {
        description: dto.description,
        enabled: dto.enabled,
        payload: dto.payload === undefined ? Prisma.JsonNull : (dto.payload as Prisma.InputJsonValue),
      },
      create: {
        tenantId,
        key,
        description: dto.description,
        enabled: dto.enabled,
        payload: dto.payload === undefined ? Prisma.JsonNull : (dto.payload as Prisma.InputJsonValue),
      },
    });

    await this.audit.record({
      tenantId,
      actorId: actor.sub,
      action: 'feature_flag.upserted',
      entityType: 'FeatureFlag',
      entityId: record.id,
      metadata: { key, enabled: dto.enabled },
    });

    return record;
  }

  async evaluate(actor: RequestUser, dto?: EvaluateFeatureFlagsDto) {
    const flags = await this.prisma.featureFlag.findMany({
      where: {
        tenantId: this.tenantId(),
        ...(dto?.keys?.length ? { key: { in: dto.keys } } : {}),
      },
      orderBy: { key: 'asc' },
    });

    return flags.map((flag) => ({
      key: flag.key,
      enabled: this.isEnabledForActor(flag.enabled, this.asRecord(flag.payload), actor),
      baseEnabled: flag.enabled,
      description: flag.description,
      payload: flag.payload,
    }));
  }

  private isEnabledForActor(baseEnabled: boolean, payload: Record<string, unknown>, actor: RequestUser) {
    if (!baseEnabled) {
      return false;
    }

    const enabledForRoles = this.asStringArray(payload.enabledForRoles);
    const disabledForRoles = this.asStringArray(payload.disabledForRoles);
    const enabledForUserIds = this.asStringArray(payload.enabledForUserIds);
    const disabledForUserIds = this.asStringArray(payload.disabledForUserIds);

    if (disabledForUserIds.includes(actor.sub)) {
      return false;
    }
    if (enabledForUserIds.includes(actor.sub)) {
      return true;
    }
    if (disabledForRoles.some((role) => actor.roles.includes(role))) {
      return false;
    }
    if (!enabledForRoles.length) {
      return true;
    }
    return enabledForRoles.some((role) => actor.roles.includes(role));
  }

  private asRecord(value: Prisma.JsonValue | null | undefined) {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private asStringArray(value: unknown) {
    return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
  }
}
