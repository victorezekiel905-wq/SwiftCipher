import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BehaviourPolarity, Report } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { RequestUser } from '../common/request-user';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { GenerateReportDto, ReportType } from './dto';

@Injectable()
export class ReportingService {
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
    const reports = await this.prisma.report.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return reports.filter((report) => this.canReadReport(report, user));
  }

  async getById(id: string, user: RequestUser) {
    const report = await this.prisma.report.findFirst({
      where: { tenantId: this.tenantId(), id },
    });

    if (!report || !this.canReadReport(report, user)) {
      throw new NotFoundException('Report not found');
    }

    return report;
  }

  async generate(dto: GenerateReportDto, actor: RequestUser) {
    const tenantId = this.tenantId();
    const payload = await this.buildPayload(dto.type, dto, actor);
    const report = await this.prisma.report.create({
      data: {
        tenantId,
        type: dto.type,
        payload,
      },
    });

    await this.audit.record({
      tenantId,
      actorId: actor.sub,
      action: 'report.generated',
      entityType: 'Report',
      entityId: report.id,
      metadata: {
        type: dto.type,
        generatedFor: {
          teacherId: dto.teacherId,
          studentId: dto.studentId,
          classRoomId: dto.classRoomId,
        },
      },
    });

    return report;
  }

  private canReadReport(report: Report, user: RequestUser) {
    if (user.roles.some((role) => ['platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'support_staff', 'finance'].includes(role))) {
      return true;
    }

    const payload = this.asRecord(report.payload);
    const audience = this.asRecord(payload.audience);

    if (user.roles.includes('parent')) {
      const allowedParents = Array.isArray(audience.parentIds) ? audience.parentIds : [];
      return allowedParents.includes(user.sub);
    }

    if (user.roles.includes('student')) {
      return payload.studentId === user.sub;
    }

    return false;
  }

  private async buildPayload(type: ReportType, dto: GenerateReportDto, actor: RequestUser) {
    switch (type) {
      case 'tenant_overview':
        this.assertRole(actor, ['platform_owner', 'school_admin', 'vice_principal', 'support_staff', 'finance']);
        return this.tenantOverview(actor);
      case 'teacher_performance':
        this.assertRole(actor, ['platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher']);
        return this.teacherPerformance(dto.teacherId ?? actor.sub, actor);
      case 'student_engagement':
        this.assertRole(actor, ['platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'support_staff']);
        return this.studentEngagement(dto.classRoomId, dto.studentId);
      case 'parent_activity':
        this.assertRole(actor, ['platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'parent']);
        return this.parentActivity(actor);
      case 'platform_revenue':
        this.assertRole(actor, ['platform_owner']);
        return this.platformRevenue(actor);
      default:
        throw new ForbiddenException('Unsupported report type');
    }
  }

  private async tenantOverview(actor: RequestUser) {
    const tenantId = this.tenantId();
    const [users, classes, lessons, quizzes, attendance, reports, announcements, liveSessions] = await Promise.all([
      this.prisma.user.findMany({ where: { tenantId }, include: { roles: { include: { role: true } } } }),
      this.prisma.classRoom.findMany({ where: { tenantId } }),
      this.prisma.lesson.count({ where: { tenantId } }),
      this.prisma.quiz.count({ where: { tenantId } }),
      this.prisma.attendance.findMany({ where: { tenantId } }),
      this.prisma.report.count({ where: { tenantId } }),
      this.prisma.announcement.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 5 }),
      this.prisma.liveSession.count({ where: { tenantId } }),
    ]);

    const roleBreakdown = users.reduce<Record<string, number>>((accumulator, user) => {
      user.roles.forEach((role) => {
        accumulator[role.role.slug] = (accumulator[role.role.slug] ?? 0) + 1;
      });
      return accumulator;
    }, {});

    const attendanceByClass = await Promise.all(
      classes.map(async (classRoom) => {
        const classAttendance = attendance.filter((entry) => entry.classRoomId === classRoom.id);
        const presentCount = classAttendance.filter((entry) => entry.status.toLowerCase() === 'present').length;
        return {
          classRoomId: classRoom.id,
          className: classRoom.name,
          records: classAttendance.length,
          presentRate: classAttendance.length ? Number(((presentCount / classAttendance.length) * 100).toFixed(2)) : 0,
        };
      }),
    );

    return {
      generatedAt: new Date().toISOString(),
      generatedById: actor.sub,
      audience: { tenantRoles: ['school_admin', 'vice_principal', 'support_staff', 'finance'] },
      tenantSummary: {
        users: users.length,
        roleBreakdown,
        classes: classes.length,
        lessons,
        quizzes,
        liveSessions,
        storedReports: reports,
      },
      attendanceByClass,
      recentAnnouncements: announcements,
    };
  }

  private async teacherPerformance(teacherId: string, actor: RequestUser) {
    const tenantId = this.tenantId();
    const teacher = await this.prisma.user.findFirst({ where: { tenantId, id: teacherId } });

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    const teachingEnrollments = await this.prisma.classEnrollment.findMany({
      where: {
        tenantId,
        userId: teacherId,
        role: { in: ['TEACHER', 'CO_TEACHER'] },
      },
    });

    const classRoomIds = teachingEnrollments.map((entry) => entry.classRoomId);
    const [classes, lessons, quizzes, attempts, behaviour, sessions] = await Promise.all([
      this.prisma.classRoom.findMany({ where: { tenantId, id: { in: classRoomIds } } }),
      this.prisma.lesson.findMany({ where: { tenantId, classRoomId: { in: classRoomIds } } }),
      this.prisma.quiz.findMany({ where: { tenantId, classRoomId: { in: classRoomIds } } }),
      this.prisma.quizAttempt.findMany({ where: { tenantId, quiz: { classRoomId: { in: classRoomIds } }, score: { not: null } } }),
      this.prisma.behaviourEvent.findMany({ where: { tenantId, teacherId } }),
      this.prisma.liveSession.findMany({ where: { tenantId, lesson: { classRoomId: { in: classRoomIds } } } }),
    ]);

    const averageQuizScore = attempts.length
      ? Number((attempts.reduce((sum, attempt) => sum + (attempt.score ?? 0), 0) / attempts.length).toFixed(2))
      : 0;

    const classPerformance = await Promise.all(
      classes.map(async (classRoom) => {
        const classAttempts = attempts.filter((attempt) => quizzes.some((quiz) => quiz.id === attempt.quizId && quiz.classRoomId === classRoom.id));
        const classAverage = classAttempts.length
          ? Number((classAttempts.reduce((sum, attempt) => sum + (attempt.score ?? 0), 0) / classAttempts.length).toFixed(2))
          : 0;
        return {
          classRoomId: classRoom.id,
          className: classRoom.name,
          classCode: classRoom.code,
          averageQuizScore: classAverage,
          lessonCount: lessons.filter((lesson) => lesson.classRoomId === classRoom.id).length,
        };
      }),
    );

    return {
      generatedAt: new Date().toISOString(),
      generatedById: actor.sub,
      teacherId,
      teacherName: `${teacher.firstName} ${teacher.lastName}`,
      audience: { teacherId },
      classCount: classes.length,
      lessonCount: lessons.length,
      liveSessionCount: sessions.length,
      averageQuizScore,
      positiveBehaviourEventsIssued: behaviour.filter((event) => event.polarity === BehaviourPolarity.POSITIVE).length,
      correctiveBehaviourEventsIssued: behaviour.filter((event) => event.polarity === BehaviourPolarity.NEGATIVE).length,
      classPerformance,
    };
  }

  private async studentEngagement(classRoomId?: string, studentId?: string) {
    const tenantId = this.tenantId();
    const studentRole = await this.prisma.role.findFirst({ where: { tenantId, slug: 'student' } });
    const studentUsers = studentRole
      ? await this.prisma.user.findMany({
          where: {
            tenantId,
            ...(studentId ? { id: studentId } : {}),
            roles: { some: { roleId: studentRole.id } },
            ...(classRoomId
              ? {
                  attendance: {
                    some: { classRoomId },
                  },
                }
              : {}),
          },
        })
      : [];

    const studentIds = studentUsers.map((student) => student.id);
    const [attendance, attempts, behaviour] = await Promise.all([
      this.prisma.attendance.findMany({ where: { tenantId, userId: { in: studentIds }, ...(classRoomId ? { classRoomId } : {}) } }),
      this.prisma.quizAttempt.findMany({ where: { tenantId, studentId: { in: studentIds }, score: { not: null } } }),
      this.prisma.behaviourEvent.findMany({ where: { tenantId, studentId: { in: studentIds } } }),
    ]);

    const students = studentUsers.map((student) => {
      const studentAttendance = attendance.filter((entry) => entry.userId === student.id);
      const studentAttempts = attempts.filter((entry) => entry.studentId === student.id);
      const studentBehaviour = behaviour.filter((entry) => entry.studentId === student.id);
      const presentCount = studentAttendance.filter((entry) => entry.status.toLowerCase() === 'present').length;
      const attendanceRate = studentAttendance.length ? Number(((presentCount / studentAttendance.length) * 100).toFixed(2)) : 0;
      const averageQuizScore = studentAttempts.length
        ? Number((studentAttempts.reduce((sum, attempt) => sum + (attempt.score ?? 0), 0) / studentAttempts.length).toFixed(2))
        : 0;
      const behaviourBalance = studentBehaviour.reduce((sum, event) => sum + (event.polarity === BehaviourPolarity.POSITIVE ? event.points : -Math.abs(event.points)), 0);
      const engagementScore = Number((attendanceRate * 0.4 + averageQuizScore * 0.4 + Math.max(0, behaviourBalance) * 0.2).toFixed(2));

      return {
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        attendanceRate,
        averageQuizScore,
        behaviourBalance,
        engagementScore,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      audience: { tenantRoles: ['school_admin', 'vice_principal', 'teacher', 'co_teacher', 'support_staff'] },
      filters: { classRoomId: classRoomId ?? null, studentId: studentId ?? null },
      students: students.sort((left, right) => right.engagementScore - left.engagementScore),
    };
  }

  private async parentActivity(actor: RequestUser) {
    const tenantId = this.tenantId();
    const parentRole = await this.prisma.role.findFirst({ where: { tenantId, slug: 'parent' } });
    const parentUsers = parentRole
      ? await this.prisma.user.findMany({
          where: {
            tenantId,
            ...(actor.roles.includes('parent') ? { id: actor.sub } : {}),
            roles: { some: { roleId: parentRole.id } },
          },
        })
      : [];

    const parentIds = parentUsers.map((parent) => parent.id);
    const profiles = await this.prisma.parentProfile.findMany({ where: { tenantId, userId: { in: parentIds } } });
    const profileMap = new Map(profiles.map((profile) => [profile.userId, profile.id]));
    const relations = await this.prisma.parentStudent.findMany({
      where: {
        tenantId,
        parentId: { in: profiles.map((profile) => profile.id) },
      },
    });
    const messages = await this.prisma.message.findMany({
      where: {
        tenantId,
        senderId: { in: parentIds },
      },
    });

    const childrenProfiles = await this.prisma.studentProfile.findMany({
      where: { tenantId, id: { in: relations.map((relation) => relation.studentId) } },
    });
    const childUsers = await this.prisma.user.findMany({
      where: { tenantId, id: { in: childrenProfiles.map((profile) => profile.userId) } },
    });
    const childMap = new Map(childrenProfiles.map((profile) => [profile.id, childUsers.find((user) => user.id === profile.userId)]));

    return {
      generatedAt: new Date().toISOString(),
      audience: { parentIds: actor.roles.includes('parent') ? [actor.sub] : parentIds },
      parents: parentUsers.map((parent) => {
        const profileId = profileMap.get(parent.id);
        const linkedChildren = relations.filter((relation) => relation.parentId === profileId).map((relation) => childMap.get(relation.studentId)).filter(Boolean);
        return {
          parentId: parent.id,
          parentName: `${parent.firstName} ${parent.lastName}`,
          email: parent.email,
          children: linkedChildren.map((child) => ({
            id: child!.id,
            name: `${child!.firstName} ${child!.lastName}`,
          })),
          outboundMessageCount: messages.filter((message) => message.senderId === parent.id).length,
        };
      }),
    };
  }

  private async platformRevenue(actor: RequestUser) {
    const [subscriptions, tenants, auditLogCount] = await Promise.all([
      this.prisma.subscription.findMany(),
      this.prisma.tenant.findMany(),
      this.prisma.auditLog.count(),
    ]);

    const active = subscriptions.filter((subscription) => subscription.status === 'ACTIVE');
    const mrr = active.reduce((sum, subscription) => sum + subscription.seats * 12, 0);

    return {
      generatedAt: new Date().toISOString(),
      generatedById: actor.sub,
      audience: { tenantRoles: ['platform_owner'] },
      tenants: tenants.map((tenant) => ({
        tenantId: tenant.tenantId,
        name: tenant.name,
        billingEmail: tenant.billingEmail,
      })),
      subscriptions: subscriptions.map((subscription) => ({
        tenantId: subscription.tenantId,
        plan: subscription.plan,
        status: subscription.status,
        seats: subscription.seats,
        renewalAt: subscription.renewalAt,
      })),
      revenue: {
        activeSubscriptions: active.length,
        mrr,
        arr: mrr * 12,
      },
      auditLogCount,
    };
  }

  private assertRole(user: RequestUser, allowedRoles: string[]) {
    if (!user.roles.some((role) => allowedRoles.includes(role))) {
      throw new ForbiddenException('You do not have permission to generate this report');
    }
  }

  private asRecord(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};
  }
}
