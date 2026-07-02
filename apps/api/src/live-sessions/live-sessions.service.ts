import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SessionStatus } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CreateLiveSessionDto, EndLiveSessionDto } from './dto';

@Injectable()
export class LiveSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  private tenantId() {
    return this.tenantContext.getTenantId();
  }

  async list() {
    return this.prisma.liveSession.findMany({
      where: { tenantId: this.tenantId() },
      include: {
        lesson: { include: { classRoom: true, blocks: { orderBy: { position: 'asc' } } } },
      },
      orderBy: [{ status: 'asc' }, { startedAt: 'desc' }, { id: 'desc' }],
    });
  }

  async schedule(dto: CreateLiveSessionDto, actorId: string) {
    const tenantId = this.tenantId();
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: dto.lessonId, tenantId },
      include: { classRoom: true },
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    const code = await this.generateUniqueCode(tenantId);

    const session = await this.prisma.liveSession.create({
      data: {
        tenantId,
        lessonId: dto.lessonId,
        code,
        status: SessionStatus.SCHEDULED,
        metrics: dto.scheduledStartAt ? { scheduledStartAt: dto.scheduledStartAt } : undefined,
      },
      include: { lesson: { include: { classRoom: true } } },
    });

    await this.audit.record({
      tenantId,
      actorId,
      action: 'live_session.scheduled',
      entityType: 'LiveSession',
      entityId: session.id,
      metadata: { lessonId: dto.lessonId, code },
    });

    return session;
  }

  async start(id: string, actorId: string) {
    const tenantId = this.tenantId();
    await this.ensureSession(id, tenantId);
    const session = await this.prisma.liveSession.update({
      where: { id },
      data: {
        status: SessionStatus.LIVE,
        startedAt: new Date(),
      },
      include: {
        lesson: { include: { classRoom: true, blocks: { orderBy: { position: 'asc' } } } },
      },
    });

    await this.audit.record({
      tenantId,
      actorId,
      action: 'live_session.started',
      entityType: 'LiveSession',
      entityId: id,
      metadata: { lessonId: session.lessonId },
    });

    return session;
  }

  async end(id: string, dto: EndLiveSessionDto, actorId: string) {
    const tenantId = this.tenantId();
    const existing = await this.ensureSession(id, tenantId);
    const metrics = {
      ...(this.asJsonObject(existing.metrics) ?? {}),
      ...(dto.metrics ?? {}),
      endedReason: 'teacher-ended',
    };

    const session = await this.prisma.liveSession.update({
      where: { id },
      data: {
        status: SessionStatus.ENDED,
        endedAt: new Date(),
        metrics,
      },
      include: {
        lesson: { include: { classRoom: true } },
      },
    });

    await this.audit.record({
      tenantId,
      actorId,
      action: 'live_session.ended',
      entityType: 'LiveSession',
      entityId: id,
      metadata: { lessonId: session.lessonId },
    });

    return session;
  }

  async joinByCode(code: string) {
    const session = await this.prisma.liveSession.findFirst({
      where: { code, tenantId: this.tenantId() },
      include: {
        lesson: {
          include: {
            blocks: { orderBy: { position: 'asc' } },
            classRoom: {
              include: {
                enrollments: true,
              },
            },
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Live session not found');
    }

    return {
      ...session,
      audience: {
        enrolledStudents: session.lesson.classRoom.enrollments.filter((entry) => entry.role === 'STUDENT').length,
        teachers: session.lesson.classRoom.enrollments.filter((entry) => entry.role !== 'STUDENT').length,
      },
    };
  }

  async teacherDashboard(id: string) {
    const session = await this.ensureSession(id, this.tenantId());
    const lesson = await this.prisma.lesson.findUniqueOrThrow({
      where: { id: session.lessonId },
      include: {
        blocks: { orderBy: { position: 'asc' } },
        classRoom: { include: { enrollments: true } },
      },
    });

    const classRoomId = lesson.classRoomId;
    const [attempts, attendance, behaviour] = await Promise.all([
      this.prisma.quizAttempt.findMany({
        where: {
          tenantId: session.tenantId,
          quiz: { classRoomId },
        },
      }),
      this.prisma.attendance.findMany({
        where: {
          tenantId: session.tenantId,
          classRoomId,
          recordedAt: session.startedAt
            ? { gte: session.startedAt }
            : { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
      this.prisma.behaviourEvent.findMany({
        where: {
          tenantId: session.tenantId,
          createdAt: session.startedAt
            ? { gte: session.startedAt }
            : { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    const students = lesson.classRoom.enrollments.filter((entry) => entry.role === 'STUDENT');

    return {
      session,
      lesson: {
        id: lesson.id,
        title: lesson.title,
        blockCount: lesson.blocks.length,
      },
      classRoom: {
        id: lesson.classRoom.id,
        name: lesson.classRoom.name,
        code: lesson.classRoom.code,
      },
      participation: {
        enrolledStudents: students.length,
        presentStudents: attendance.filter((entry) => entry.status.toLowerCase() === 'present').length,
        attemptCount: attempts.length,
        positiveEvents: behaviour.filter((entry) => entry.polarity === 'POSITIVE').length,
        negativeEvents: behaviour.filter((entry) => entry.polarity === 'NEGATIVE').length,
      },
      students: students.map((entry) => ({
        userId: entry.userId,
        role: entry.role,
        attendanceStatus: attendance.find((item) => item.userId === entry.userId)?.status ?? 'unknown',
        latestQuizScore: attempts
          .filter((item) => item.studentId === entry.userId && typeof item.score === 'number')
          .sort((a, b) => (b.submittedAt?.getTime() ?? 0) - (a.submittedAt?.getTime() ?? 0))[0]?.score ?? null,
      })),
    };
  }

  private async ensureSession(id: string, tenantId: string) {
    const session = await this.prisma.liveSession.findFirst({ where: { id, tenantId } });
    if (!session) {
      throw new NotFoundException('Live session not found');
    }
    return session;
  }

  private async generateUniqueCode(tenantId: string) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = Math.random().toString(36).slice(2, 8).toUpperCase();
      const existing = await this.prisma.liveSession.findFirst({ where: { tenantId, code } });
      if (!existing) {
        return code;
      }
    }

    throw new Error('Unable to generate unique live session code');
  }

  private asJsonObject(value: Prisma.JsonValue | null | undefined) {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      return undefined;
    }
    return value as Record<string, unknown>;
  }
}
