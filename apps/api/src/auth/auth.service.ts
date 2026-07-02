import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { LoginDto, RegisterPlatformOwnerDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
  ) {}

  async registerPlatformOwner(dto: RegisterPlatformOwnerDto) {
    const passwordHash = await argon2.hash(dto.password);
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          tenantId: dto.tenantSlug,
          name: dto.tenantName,
          slug: dto.tenantSlug,
          billingEmail: dto.email,
        },
      });

      const role = await tx.role.create({
        data: {
          tenantId: tenant.tenantId,
          name: 'Platform Owner',
          slug: 'platform_owner',
          description: 'Global platform operator',
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.tenantId,
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
        },
      });

      await tx.userRole.create({
        data: {
          tenantId: tenant.tenantId,
          userId: user.id,
          roleId: role.id,
        },
      });

      return this.issueSession(tx, user.id);
    });
  }

  async login(dto: LoginDto, tenantId: string, device?: { label: string; ipAddress?: string; userAgent?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email: dto.email } },
      include: { roles: { include: { role: true } } },
    });

    if (!user?.passwordHash || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    if (device) {
      await this.prisma.device.create({
        data: {
          tenantId,
          userId: user.id,
          label: device.label,
          ipAddress: device.ipAddress,
          userAgent: device.userAgent,
          lastSeenAt: new Date(),
        },
      });
    }

    await this.audit.record({
      tenantId,
      actorId: user.id,
      action: 'auth.login',
      entityType: 'User',
      entityId: user.id,
      metadata: {
        deviceLabel: device?.label,
      },
    });

    return this.issueSession(this.prisma, user.id);
  }

  async refresh(refreshToken: string) {
    const payload = await this.jwtService.verifyAsync<{ sub: string }>(refreshToken, {
      secret: process.env.JWT_REFRESH_SECRET,
    });

    const candidates = await this.prisma.refreshToken.findMany({
      where: { userId: payload.sub, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    for (const candidate of candidates) {
      if (await argon2.verify(candidate.tokenHash, refreshToken)) {
        return this.issueSession(this.prisma, candidate.userId);
      }
    }

    throw new UnauthorizedException('Invalid refresh token');
  }

  async me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
  }

  private async issueSession(client: Prisma.TransactionClient | PrismaService, userId: string) {
    const user = await client.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });

    const payload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      roles: user.roles.map((entry) => entry.role.slug),
    };

    const accessToken = await this.jwtService.signAsync(payload, { expiresIn: '15m' });
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '30d',
    });

    await client.refreshToken.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        tokenHash: await argon2.hash(refreshToken),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: this.mapUser(user),
    };
  }

  private mapUser(user: User & { roles: Array<{ role: { slug: string } }> }) {
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles.map((entry) => entry.role.slug),
    };
  }
}
