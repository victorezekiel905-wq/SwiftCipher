import { Injectable } from '@nestjs/common';
import { BehaviourPolarity } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { buildChildInsights } from './insights';

@Injectable()
export class ParentPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private tenantId() {
    return this.tenantContext.getTenantId();
  }

  async overview(parentUserId: string) {
    const tenantId = this.tenantId();
    const parentProfile = await this.prisma.parentProfile.findFirst({
      where: { tenantId, userId: parentUserId },
    });

    const parent = await this.prisma.user.findFirst({
      where: { id: parentUserId, tenantId },
    });

    const relations = await this.prisma.parentStudent.findMany({
      where: { tenantId, parentId: parentProfile?.id ?? 'missing' },
    });

    const studentProfiles = relations.length
      ? await this.prisma.studentProfile.findMany({
          where: { tenantId, id: { in: relations.map((relation) => relation.studentId) } },
        })
      : [];

    const studentUsers = studentProfiles.length
      ? await this.prisma.user.findMany({
          where: { tenantId, id: { in: studentProfiles.map((profile) => profile.userId) } },
        })
      : [];

    const childUserIds = studentUsers.map((user) => user.id);
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [attendance, behaviour, attempts, announcements, rewards, badges, achievements, threads] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { tenantId, userId: { in: childUserIds }, recordedAt: { gte: thirtyDaysAgo } },
        orderBy: { recordedAt: 'desc' },
      }),
      this.prisma.behaviourEvent.findMany({
        where: { tenantId, studentId: { in: childUserIds }, createdAt: { gte: thirtyDaysAgo } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.quizAttempt.findMany({
        where: { tenantId, studentId: { in: childUserIds }, submittedAt: { gte: thirtyDaysAgo } },
        include: { quiz: true },
        orderBy: { submittedAt: 'desc' },
      }),
      this.prisma.announcement.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.reward.findMany({ where: { tenantId }, orderBy: { pointsCost: 'asc' } }),
      this.prisma.badge.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.achievement.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.messageParticipant.findMany({
        where: { tenantId, userId: parentUserId },
        include: { thread: { include: { messages: { orderBy: { createdAt: 'desc' }, take: 5 } } } },
        take: 10,
      }),
    ]);

    const children = studentUsers.map((student) => {
      const studentAttendance = attendance.filter((entry) => entry.userId === student.id);
      const studentBehaviour = behaviour.filter((entry) => entry.studentId === student.id);
      const studentAttempts = attempts.filter((entry) => entry.studentId === student.id);
      const presentCount = studentAttendance.filter((entry) => entry.status.toLowerCase() === 'present').length;
      const attendanceRate = studentAttendance.length
        ? Number(((presentCount / studentAttendance.length) * 100).toFixed(2))
        : 0;
      const quizAverage = studentAttempts.length
        ? Number(
            (
              studentAttempts.reduce((sum, attempt) => sum + (attempt.score ?? 0), 0) / studentAttempts.length
            ).toFixed(2),
          )
        : 0;
      const positiveBehaviourBalance = studentBehaviour.reduce((sum, entry) => {
        const delta = entry.polarity === BehaviourPolarity.POSITIVE ? entry.points : -Math.abs(entry.points);
        return sum + delta;
      }, 0);
      const recentParticipationCount = studentAttempts.filter((entry) => (entry.submittedAt?.getTime() ?? 0) >= sevenDaysAgo.getTime()).length;

      const earnedBadges = badges.slice(0, Math.max(0, Math.floor(positiveBehaviourBalance / 5))).map((badge) => badge.name);
      const earnedAchievements = achievements
        .filter((achievement) => {
          const criteria = achievement.criteria as Record<string, unknown>;
          const minQuizAverage = Number(criteria.minQuizAverage ?? 0);
          const minAttendanceRate = Number(criteria.minAttendanceRate ?? 0);
          return quizAverage >= minQuizAverage && attendanceRate >= minAttendanceRate;
        })
        .map((achievement) => achievement.name);

      return {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
        attendance: {
          records: studentAttendance,
          attendanceRate,
        },
        behaviour: {
          balance: positiveBehaviourBalance,
          timeline: studentBehaviour,
        },
        quizPerformance: {
          averageScore: quizAverage,
          attempts: studentAttempts,
        },
        rewards: rewards.filter((reward) => reward.pointsCost <= Math.max(positiveBehaviourBalance, 0)),
        achievements: earnedAchievements,
        badges: earnedBadges,
        insights: buildChildInsights({
          childName: student.firstName,
          quizAverage,
          attendanceRate,
          positiveBehaviourBalance,
          recentParticipationCount,
        }),
      };
    });

    return {
      parent,
      relationship: parentProfile?.relationship ?? null,
      children,
      announcements,
      messages: threads.map((thread) => ({
        threadId: thread.threadId,
        subject: thread.thread.subject,
        messages: thread.thread.messages,
      })),
    };
  }
}
