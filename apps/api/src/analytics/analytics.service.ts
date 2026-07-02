import { Injectable } from '@nestjs/common';
import { BehaviourPolarity } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { RequestUser } from '../common/request-user';
import { TenantContextService } from '../tenancy/tenant-context.service';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private tenantId() {
    return this.tenantContext.getTenantId();
  }

  async dashboard(user: RequestUser) {
    const tenantId = this.tenantId();
    const isPlatformOwner = user.roles.includes('platform_owner');

    return {
      identity: {
        tenantId,
        userId: user.sub,
        email: user.email,
        roles: user.roles,
      },
      platform: isPlatformOwner ? await this.platformOwnerOverview() : null,
      tenant: await this.tenantOverview(tenantId),
      teacher: user.roles.some((role) => ['platform_owner', 'teacher', 'co_teacher'].includes(role))
        ? await this.teacherOverview(tenantId, user.sub)
        : null,
    };
  }

  private async platformOwnerOverview() {
    const [tenantCount, userCount, subscriptionMetrics, storageEstimate, auditLogCount] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.user.count(),
      this.prisma.subscription.findMany(),
      this.prisma.report.count(),
      this.prisma.auditLog.count(),
    ]);

    const activeSubscriptions = subscriptionMetrics.filter((subscription) => subscription.status === 'ACTIVE');
    const mrr = activeSubscriptions.reduce((sum, subscription) => sum + subscription.seats * 12, 0);

    return {
      tenantCount,
      userCount,
      subscriptionCount: subscriptionMetrics.length,
      activeSubscriptions: activeSubscriptions.length,
      mrr,
      arr: mrr * 12,
      storageIndicators: {
        reportArtifacts: storageEstimate,
        auditLogCount,
      },
    };
  }

  private async tenantOverview(tenantId: string) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const [users, classes, lessons, quizzes, sessions, attendance, behaviour] = await Promise.all([
      this.prisma.user.findMany({ where: { tenantId }, include: { roles: { include: { role: true } } } }),
      this.prisma.classRoom.findMany({ where: { tenantId } }),
      this.prisma.lesson.findMany({ where: { tenantId } }),
      this.prisma.quiz.findMany({ where: { tenantId } }),
      this.prisma.liveSession.findMany({ where: { tenantId } }),
      this.prisma.attendance.findMany({ where: { tenantId, recordedAt: { gte: thirtyDaysAgo } } }),
      this.prisma.behaviourEvent.findMany({ where: { tenantId, createdAt: { gte: thirtyDaysAgo } } }),
    ]);

    const attendancePresent = attendance.filter((entry) => entry.status.toLowerCase() === 'present').length;
    const roleBreakdown = users.reduce<Record<string, number>>((accumulator, user) => {
      user.roles.forEach((entry) => {
        accumulator[entry.role.slug] = (accumulator[entry.role.slug] ?? 0) + 1;
      });
      return accumulator;
    }, {});

    return {
      users: {
        total: users.length,
        roleBreakdown,
      },
      classes: classes.length,
      lessons: lessons.length,
      quizzes: quizzes.length,
      liveSessions: sessions.length,
      attendance: {
        records: attendance.length,
        presentRate: attendance.length ? Number(((attendancePresent / attendance.length) * 100).toFixed(2)) : 0,
      },
      behaviour: {
        positiveEvents: behaviour.filter((entry) => entry.polarity === BehaviourPolarity.POSITIVE).length,
        negativeEvents: behaviour.filter((entry) => entry.polarity === BehaviourPolarity.NEGATIVE).length,
      },
    };
  }

  private async teacherOverview(tenantId: string, teacherUserId: string) {
    const teachingEnrollments = await this.prisma.classEnrollment.findMany({
      where: {
        tenantId,
        userId: teacherUserId,
        role: { in: ['TEACHER', 'CO_TEACHER'] },
      },
    });
    const classRoomIds = teachingEnrollments.map((entry) => entry.classRoomId);

    if (!classRoomIds.length) {
      return {
        classCount: 0,
        lessonCount: 0,
        quizCount: 0,
        averageQuizScore: 0,
        strongestStudents: [],
      };
    }

    const [lessons, quizzes, attempts, behaviour, classRooms] = await Promise.all([
      this.prisma.lesson.findMany({ where: { tenantId, classRoomId: { in: classRoomIds } } }),
      this.prisma.quiz.findMany({ where: { tenantId, classRoomId: { in: classRoomIds } } }),
      this.prisma.quizAttempt.findMany({
        where: { tenantId, quiz: { classRoomId: { in: classRoomIds } }, score: { not: null } },
      }),
      this.prisma.behaviourEvent.findMany({
        where: { tenantId, teacherId: teacherUserId },
      }),
      this.prisma.classRoom.findMany({ where: { tenantId, id: { in: classRoomIds } } }),
    ]);

    const studentScores = attempts.reduce<Record<string, number[]>>((accumulator, attempt) => {
      accumulator[attempt.studentId] = accumulator[attempt.studentId] ?? [];
      accumulator[attempt.studentId].push(attempt.score ?? 0);
      return accumulator;
    }, {});

    const strongestStudents = await Promise.all(
      Object.entries(studentScores)
        .map(([studentId, scores]) => ({ studentId, averageScore: scores.reduce((sum, score) => sum + score, 0) / scores.length }))
        .sort((left, right) => right.averageScore - left.averageScore)
        .slice(0, 5)
        .map(async (entry) => {
          const student = await this.prisma.user.findUnique({ where: { id: entry.studentId } });
          return {
            studentId: entry.studentId,
            studentName: student ? `${student.firstName} ${student.lastName}` : entry.studentId,
            averageScore: Number(entry.averageScore.toFixed(2)),
          };
        }),
    );

    const averageQuizScore = attempts.length
      ? Number((attempts.reduce((sum, attempt) => sum + (attempt.score ?? 0), 0) / attempts.length).toFixed(2))
      : 0;

    return {
      classCount: classRooms.length,
      classes: classRooms.map((classRoom) => ({ id: classRoom.id, name: classRoom.name, code: classRoom.code })),
      lessonCount: lessons.length,
      quizCount: quizzes.length,
      averageQuizScore,
      positiveBehaviourEventsIssued: behaviour.filter((entry) => entry.polarity === BehaviourPolarity.POSITIVE).length,
      strongestStudents,
    };
  }
}
