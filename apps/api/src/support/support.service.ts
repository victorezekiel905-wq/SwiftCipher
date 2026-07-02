import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SupportTicketPriority, SupportTicketStatus } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { RequestUser } from '../common/request-user';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  AddSupportTicketCommentDto,
  AssignSupportTicketDto,
  CreateSupportTicketDto,
  TransitionSupportTicketDto,
} from './dto';

const STAFF_ROLES = ['platform_owner', 'school_admin', 'vice_principal', 'support_staff', 'finance'];
const TEAM_ROLES = ['platform_owner', 'school_admin', 'vice_principal', 'support_staff'];

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  private tenantId() {
    return this.tenantContext.getTenantId();
  }

  async list(user: RequestUser) {
    const tenantId = this.tenantId();
    const tickets = await this.prisma.supportTicket.findMany({
      where: {
        tenantId,
        ...(this.canSeeAll(user) ? {} : { OR: [{ createdById: user.sub }, { assignedToId: user.sub }] }),
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        comments: {
          include: { author: { select: { id: true, firstName: true, lastName: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });

    return tickets.map((ticket) => ({
      ...ticket,
      sla: this.buildSla(ticket),
    }));
  }

  async summary(user: RequestUser) {
    const tickets = await this.list(user);
    const now = Date.now();
    return {
      total: tickets.length,
      overdue: tickets.filter((ticket) => ticket.dueAt && new Date(ticket.dueAt).getTime() < now && !this.isClosed(ticket.status)).length,
      open: tickets.filter((ticket) => !this.isClosed(ticket.status)).length,
      byStatus: tickets.reduce<Record<string, number>>((acc, ticket) => {
        acc[ticket.status] = (acc[ticket.status] ?? 0) + 1;
        return acc;
      }, {}),
      byPriority: tickets.reduce<Record<string, number>>((acc, ticket) => {
        acc[ticket.priority] = (acc[ticket.priority] ?? 0) + 1;
        return acc;
      }, {}),
    };
  }

  async create(dto: CreateSupportTicketDto, actor: RequestUser) {
    const tenantId = this.tenantId();
    const priority = dto.priority ?? SupportTicketPriority.MEDIUM;
    const dueAt = this.computeDueAt(priority);
    const ticket = await this.prisma.supportTicket.create({
      data: {
        tenantId,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        priority,
        createdById: actor.sub,
        relatedEntityType: dto.relatedEntityType,
        relatedEntityId: dto.relatedEntityId,
        dueAt,
        metadata: {
          openedByRoles: actor.roles,
        } as Prisma.InputJsonValue,
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    await this.audit.record({
      tenantId,
      actorId: actor.sub,
      action: 'support.ticket.created',
      entityType: 'SupportTicket',
      entityId: ticket.id,
      metadata: { category: dto.category, priority },
    });

    return { ...ticket, comments: [], sla: this.buildSla(ticket) };
  }

  async assign(id: string, dto: AssignSupportTicketDto, actor: RequestUser) {
    this.assertTeamMember(actor);
    const tenantId = this.tenantId();
    await this.ensureUserExists(dto.assignedToId);
    const ticket = await this.getTicketOrThrow(id, actor, true);
    const updated = await this.prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        assignedToId: dto.assignedToId,
        status: ticket.status === SupportTicketStatus.OPEN ? SupportTicketStatus.IN_PROGRESS : ticket.status,
        firstResponseAt: ticket.firstResponseAt ?? new Date(),
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        comments: {
          include: { author: { select: { id: true, firstName: true, lastName: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    await this.audit.record({
      tenantId,
      actorId: actor.sub,
      action: 'support.ticket.assigned',
      entityType: 'SupportTicket',
      entityId: updated.id,
      metadata: { assignedToId: dto.assignedToId },
    });

    return { ...updated, sla: this.buildSla(updated) };
  }

  async transition(id: string, dto: TransitionSupportTicketDto, actor: RequestUser) {
    const ticket = await this.getTicketOrThrow(id, actor, this.canSeeAll(actor));
    if (!this.canSeeAll(actor) && ticket.createdById !== actor.sub && ticket.assignedToId !== actor.sub) {
      throw new ForbiddenException('You are not allowed to update this ticket');
    }

    const updated = await this.prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: dto.status,
        resolvedAt: this.isClosed(dto.status) ? new Date() : null,
        firstResponseAt:
          dto.status !== SupportTicketStatus.OPEN ? ticket.firstResponseAt ?? new Date() : ticket.firstResponseAt,
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        comments: {
          include: { author: { select: { id: true, firstName: true, lastName: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    await this.audit.record({
      tenantId: this.tenantId(),
      actorId: actor.sub,
      action: 'support.ticket.status_changed',
      entityType: 'SupportTicket',
      entityId: updated.id,
      metadata: { status: dto.status },
    });

    return { ...updated, sla: this.buildSla(updated) };
  }

  async addComment(id: string, dto: AddSupportTicketCommentDto, actor: RequestUser) {
    const ticket = await this.getTicketOrThrow(id, actor, this.canSeeAll(actor));
    if (dto.isInternal && !this.canSeeAll(actor)) {
      throw new ForbiddenException('Only support staff can add internal comments');
    }

    const created = await this.prisma.supportTicketComment.create({
      data: {
        tenantId: this.tenantId(),
        ticketId: ticket.id,
        authorId: actor.sub,
        body: dto.body,
        isInternal: dto.isInternal ?? false,
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
        ticket: true,
      },
    });

    if (!ticket.firstResponseAt && this.canSeeAll(actor)) {
      await this.prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { firstResponseAt: new Date(), status: SupportTicketStatus.IN_PROGRESS },
      });
    }

    await this.audit.record({
      tenantId: this.tenantId(),
      actorId: actor.sub,
      action: 'support.ticket.comment_added',
      entityType: 'SupportTicket',
      entityId: ticket.id,
      metadata: { internal: dto.isInternal ?? false },
    });

    return created;
  }

  private async getTicketOrThrow(id: string, actor: RequestUser, allowAll: boolean) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: {
        id,
        tenantId: this.tenantId(),
        ...(allowAll ? {} : { OR: [{ createdById: actor.sub }, { assignedToId: actor.sub }] }),
      },
    });
    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }
    return ticket;
  }

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId: this.tenantId() } });
    if (!user) {
      throw new BadRequestException('Assignee must belong to the current tenant');
    }
    return user;
  }

  private canSeeAll(user: RequestUser) {
    return user.roles.some((role) => STAFF_ROLES.includes(role));
  }

  private assertTeamMember(user: RequestUser) {
    if (!user.roles.some((role) => TEAM_ROLES.includes(role))) {
      throw new ForbiddenException('Only support staff can assign tickets');
    }
  }

  private computeDueAt(priority: SupportTicketPriority) {
    const now = Date.now();
    const hours = {
      LOW: 72,
      MEDIUM: 24,
      HIGH: 8,
      URGENT: 2,
    }[priority];
    return new Date(now + hours * 60 * 60 * 1000);
  }

  private isClosed(status: SupportTicketStatus) {
    return status === SupportTicketStatus.RESOLVED || status === SupportTicketStatus.CLOSED;
  }

  private buildSla(ticket: { dueAt: Date | null; firstResponseAt?: Date | null; status: SupportTicketStatus }) {
    const dueAt = ticket.dueAt ? new Date(ticket.dueAt).getTime() : null;
    const remainingMs = dueAt ? dueAt - Date.now() : null;
    return {
      firstResponseRecorded: Boolean(ticket.firstResponseAt),
      dueAt: ticket.dueAt,
      breached: Boolean(remainingMs !== null && remainingMs < 0 && !this.isClosed(ticket.status)),
      remainingMinutes: remainingMs === null ? null : Math.round(remainingMs / 60000),
    };
  }
}
