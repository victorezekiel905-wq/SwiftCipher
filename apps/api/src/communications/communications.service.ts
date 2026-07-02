import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationChannel, Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { RequestUser } from '../common/request-user';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  AudienceInput,
  BroadcastNotificationDto,
  CreateAnnouncementDto,
  CreateStoryDto,
  CreateThreadDto,
  SendMessageDto,
} from './dto';

const ANNOUNCEMENT_ROLES = ['platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'support_staff'];
const BROADCAST_ROLES = ['platform_owner', 'school_admin', 'vice_principal', 'support_staff'];

type ThreadParticipant = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  roles: string[];
};

@Injectable()
export class CommunicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  private tenantId() {
    return this.tenantContext.getTenantId();
  }

  async overview(user: RequestUser) {
    const [inbox, announcements, stories, notifications] = await Promise.all([
      this.listInbox(user),
      this.listAnnouncements(),
      this.listStories(),
      this.listNotifications(user.sub),
    ]);

    return {
      inbox,
      announcements,
      stories,
      notifications,
      unreadNotifications: notifications.filter((notification) => !notification.isRead).length,
    };
  }

  async listInbox(user: RequestUser) {
    const tenantId = this.tenantId();
    const participantEntries = await this.prisma.messageParticipant.findMany({
      where: { tenantId, userId: user.sub },
    });
    const threadIds = participantEntries.map((entry) => entry.threadId);

    if (!threadIds.length) {
      return [];
    }

    const threads = await this.prisma.messageThread.findMany({
      where: { tenantId, id: { in: threadIds } },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
      orderBy: { createdAt: 'desc' },
    });

    const participants = await this.prisma.messageParticipant.findMany({
      where: { tenantId, threadId: { in: threadIds } },
      orderBy: [{ threadId: 'asc' }, { userId: 'asc' }],
    });

    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        id: {
          in: Array.from(new Set(participants.map((participant) => participant.userId))),
        },
      },
      include: { roles: { include: { role: true } } },
    });

    const userMap = new Map(
      users.map((entry) => [
        entry.id,
        {
          userId: entry.id,
          firstName: entry.firstName,
          lastName: entry.lastName,
          email: entry.email,
          roles: entry.roles.map((role) => role.role.slug),
        } satisfies ThreadParticipant,
      ]),
    );

    const participantsByThread = participants.reduce<Record<string, ThreadParticipant[]>>((accumulator, participant) => {
      accumulator[participant.threadId] = accumulator[participant.threadId] ?? [];
      const detail = userMap.get(participant.userId);
      if (detail) {
        accumulator[participant.threadId].push(detail);
      }
      return accumulator;
    }, {});

    const unreadMessageNotifications = await this.prisma.notification.findMany({
      where: {
        tenantId,
        userId: user.sub,
        isRead: false,
        title: { startsWith: 'THREAD:' },
      },
    });

    const unreadByThread = unreadMessageNotifications.reduce<Record<string, number>>((accumulator, notification) => {
      const threadId = notification.title.split(':')[1];
      if (threadId) {
        accumulator[threadId] = (accumulator[threadId] ?? 0) + 1;
      }
      return accumulator;
    }, {});

    return threads.map((thread) => ({
      id: thread.id,
      subject: thread.subject,
      participants: participantsByThread[thread.id] ?? [],
      latestMessage: thread.messages[0]
        ? {
            id: thread.messages[0].id,
            senderId: thread.messages[0].senderId,
            body: thread.messages[0].body,
            createdAt: thread.messages[0].createdAt,
          }
        : null,
      messageCount: thread.messages.length,
      unreadCount: unreadByThread[thread.id] ?? 0,
      createdAt: thread.createdAt,
    }));
  }

  async getThread(threadId: string, user: RequestUser) {
    const tenantId = this.tenantId();
    await this.ensureThreadAccess(threadId, user);

    const thread = await this.prisma.messageThread.findFirst({
      where: { tenantId, id: threadId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        participants: true,
      },
    });

    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    const participantUsers = await this.prisma.user.findMany({
      where: { tenantId, id: { in: thread.participants.map((participant) => participant.userId) } },
      include: { roles: { include: { role: true } } },
    });

    const userMap = new Map(
      participantUsers.map((entry) => [
        entry.id,
        {
          id: entry.id,
          firstName: entry.firstName,
          lastName: entry.lastName,
          email: entry.email,
          roles: entry.roles.map((role) => role.role.slug),
        },
      ]),
    );

    return {
      id: thread.id,
      subject: thread.subject,
      participants: thread.participants.map((participant) => userMap.get(participant.userId)).filter(Boolean),
      messages: thread.messages,
      createdAt: thread.createdAt,
    };
  }

  async createThread(dto: CreateThreadDto, actor: RequestUser) {
    const tenantId = this.tenantId();
    const participantIds = Array.from(new Set([actor.sub, ...dto.participantIds]));

    if (participantIds.length < 2) {
      throw new BadRequestException('A conversation requires at least two participants');
    }

    const participants = await this.prisma.user.findMany({
      where: { tenantId, id: { in: participantIds } },
      include: { roles: { include: { role: true } } },
    });

    if (participants.length !== participantIds.length) {
      throw new NotFoundException('One or more participants were not found in this tenant');
    }

    const thread = await this.prisma.$transaction(async (tx) => {
      const created = await tx.messageThread.create({
        data: {
          tenantId,
          subject: dto.subject,
          participants: {
            create: participantIds.map((userId) => ({ tenantId, userId })),
          },
          messages: {
            create: {
              tenantId,
              senderId: actor.sub,
              body: dto.body,
            },
          },
        },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          participants: true,
        },
      });

      await this.createMessageNotifications(tx, {
        tenantId,
        threadId: created.id,
        senderId: actor.sub,
        recipients: participantIds.filter((participantId) => participantId !== actor.sub),
        subject: created.subject,
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: actor.sub,
          action: 'communications.thread.created',
          entityType: 'MessageThread',
          entityId: created.id,
          metadata: {
            participantIds,
            subject: dto.subject,
          },
        },
      });

      return created;
    });

    return this.getThread(thread.id, actor);
  }

  async sendMessage(threadId: string, dto: SendMessageDto, actor: RequestUser) {
    const tenantId = this.tenantId();
    await this.ensureThreadAccess(threadId, actor);

    const thread = await this.prisma.messageThread.findFirst({
      where: { tenantId, id: threadId },
      include: { participants: true },
    });

    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          tenantId,
          threadId,
          senderId: actor.sub,
          body: dto.body,
        },
      });

      await this.createMessageNotifications(tx, {
        tenantId,
        threadId,
        senderId: actor.sub,
        recipients: thread.participants.map((participant) => participant.userId).filter((participantId) => participantId !== actor.sub),
        subject: thread.subject,
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: actor.sub,
          action: 'communications.message.sent',
          entityType: 'Message',
          entityId: created.id,
          metadata: { threadId },
        },
      });

      return created;
    });

    return message;
  }

  async listAnnouncements() {
    const tenantId = this.tenantId();
    const announcements = await this.prisma.announcement.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const creators = await this.userLookup(announcements.map((announcement) => announcement.createdById));

    return announcements.map((announcement) => ({
      ...announcement,
      createdBy: creators.get(announcement.createdById) ?? null,
    }));
  }

  async createAnnouncement(dto: CreateAnnouncementDto, actor: RequestUser) {
    this.assertRole(actor, ANNOUNCEMENT_ROLES, 'Only staff users can publish announcements');
    const tenantId = this.tenantId();
    const audience = dto.audience ?? { includeAll: true };
    const recipients = await this.resolveAudienceUserIds(audience, tenantId);

    const announcement = await this.prisma.$transaction(async (tx) => {
      const created = await tx.announcement.create({
        data: {
          tenantId,
          title: dto.title,
          body: dto.body,
          audience: audience as Prisma.InputJsonValue,
          createdById: actor.sub,
        },
      });

      if (recipients.length) {
        await tx.notification.createMany({
          data: recipients.map((userId) => ({
            tenantId,
            userId,
            title: `Announcement: ${dto.title}`,
            body: dto.body,
            channel: NotificationChannel.IN_APP,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: actor.sub,
          action: 'communications.announcement.created',
          entityType: 'Announcement',
          entityId: created.id,
          metadata: {
            recipientCount: recipients.length,
            audience: audience as unknown as Prisma.InputJsonValue,
          },
        },
      });

      return created;
    });

    return announcement;
  }

  async listStories() {
    const tenantId = this.tenantId();
    const stories = await this.prisma.story.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const creators = await this.userLookup(stories.map((story) => story.createdById));

    return stories.map((story) => ({
      ...story,
      createdBy: creators.get(story.createdById) ?? null,
    }));
  }

  async createStory(dto: CreateStoryDto, actor: RequestUser) {
    this.assertRole(actor, ANNOUNCEMENT_ROLES, 'Only staff users can publish stories');
    const tenantId = this.tenantId();
    const story = await this.prisma.story.create({
      data: {
        tenantId,
        title: dto.title,
        media: dto.media as unknown as Prisma.InputJsonValue,
        visibility: (dto.visibility ?? { includeAll: true }) as Prisma.InputJsonValue,
        createdById: actor.sub,
      },
    });

    await this.audit.record({
      tenantId,
      actorId: actor.sub,
      action: 'communications.story.created',
      entityType: 'Story',
      entityId: story.id,
      metadata: { mediaCount: dto.media.length },
    });

    return story;
  }

  async listNotifications(userId: string) {
    return this.prisma.notification.findMany({
      where: { tenantId: this.tenantId(), userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markNotificationRead(notificationId: string, actor: RequestUser) {
    const tenantId = this.tenantId();
    const notification = await this.prisma.notification.findFirst({
      where: { tenantId, id: notificationId, userId: actor.sub },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  async broadcastNotification(dto: BroadcastNotificationDto, actor: RequestUser) {
    this.assertRole(actor, BROADCAST_ROLES, 'Only platform and school operations roles can broadcast notifications');
    const tenantId = this.tenantId();
    const audience = dto.audience ?? { includeAll: true };
    const recipients = await this.resolveAudienceUserIds(audience, tenantId);

    if (!recipients.length) {
      throw new BadRequestException('No recipients matched the selected audience');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.notification.createMany({
        data: recipients.map((userId) => ({
          tenantId,
          userId,
          title: dto.title,
          body: dto.body,
          channel: NotificationChannel.IN_APP,
        })),
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: actor.sub,
          action: 'communications.notification.broadcast',
          entityType: 'Notification',
          entityId: actor.sub,
          metadata: {
            audience: audience as unknown as Prisma.InputJsonValue,
            recipientCount: recipients.length,
            title: dto.title,
          },
        },
      });
    });

    return {
      audience,
      recipientCount: recipients.length,
      title: dto.title,
    };
  }

  private async ensureThreadAccess(threadId: string, user: RequestUser) {
    const participant = await this.prisma.messageParticipant.findFirst({
      where: { tenantId: this.tenantId(), threadId, userId: user.sub },
    });

    if (!participant) {
      throw new ForbiddenException('You do not have access to this thread');
    }
  }

  private async userLookup(userIds: string[]) {
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
    if (!uniqueUserIds.length) {
      return new Map<string, { id: string; firstName: string; lastName: string; email: string }>();
    }

    const users = await this.prisma.user.findMany({
      where: { tenantId: this.tenantId(), id: { in: uniqueUserIds } },
    });

    return new Map(users.map((user) => [user.id, { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email }]));
  }

  private assertRole(user: RequestUser, allowedRoles: string[], message: string) {
    if (!user.roles.some((role) => allowedRoles.includes(role))) {
      throw new ForbiddenException(message);
    }
  }

  private async resolveAudienceUserIds(audience: AudienceInput, tenantId: string) {
    const targetUsers = await this.prisma.user.findMany({
      where: {
        tenantId,
        ...(audience.includeAll
          ? {}
          : {
              OR: [
                ...(audience.userIds?.length ? [{ id: { in: audience.userIds } }] : []),
                ...(audience.roles?.length
                  ? [
                      {
                        roles: {
                          some: {
                            role: {
                              slug: { in: audience.roles },
                            },
                          },
                        },
                      },
                    ]
                  : []),
              ],
            }),
      },
      select: { id: true },
    });

    return targetUsers.map((user) => user.id);
  }

  private async createMessageNotifications(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      threadId: string;
      senderId: string;
      recipients: string[];
      subject: string | null;
    },
  ) {
    if (!input.recipients.length) {
      return;
    }

    await tx.notification.createMany({
      data: input.recipients.map((userId) => ({
        tenantId: input.tenantId,
        userId,
        title: `THREAD:${input.threadId}:New message`,
        body: input.subject ? `New reply in ${input.subject}` : 'You received a new message in ClassSphere',
        channel: NotificationChannel.IN_APP,
      })),
    });
  }
}
