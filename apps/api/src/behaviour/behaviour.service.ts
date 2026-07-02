import { Injectable } from '@nestjs/common';
import { BehaviourPolarity } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CreateBehaviourEventDto, CreateRewardDto } from './dto';

@Injectable()
export class BehaviourService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  private tenantId() {
    return this.tenantContext.getTenantId();
  }

  async createEvent(dto: CreateBehaviourEventDto, teacherId: string) {
    const tenantId = this.tenantId();
    const event = await this.prisma.behaviourEvent.create({
      data: {
        tenantId,
        studentId: dto.studentId,
        teacherId,
        category: dto.category,
        points: dto.points,
        polarity: dto.polarity,
        note: dto.note,
      },
    });

    await this.audit.record({
      tenantId,
      actorId: teacherId,
      action: 'behaviour.event.created',
      entityType: 'BehaviourEvent',
      entityId: event.id,
      metadata: { studentId: dto.studentId, category: dto.category, points: dto.points },
    });

    return event;
  }

  async studentTimeline(studentId: string) {
    const tenantId = this.tenantId();
    const [student, events] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: studentId, tenantId } }),
      this.prisma.behaviourEvent.findMany({
        where: { tenantId, studentId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      student,
      events,
    };
  }

  async summary(classRoomId?: string) {
    const tenantId = this.tenantId();
    const studentIds = classRoomId
      ? (
          await this.prisma.classEnrollment.findMany({
            where: { tenantId, classRoomId, role: 'STUDENT' },
          })
        ).map((entry) => entry.userId)
      : undefined;

    const where = {
      tenantId,
      ...(studentIds ? { studentId: { in: studentIds } } : {}),
    } as const;

    const [events, students, rewards] = await Promise.all([
      this.prisma.behaviourEvent.findMany({ where, orderBy: { createdAt: 'desc' } }),
      this.prisma.user.findMany({ where: { tenantId, ...(studentIds ? { id: { in: studentIds } } : {}) } }),
      this.prisma.reward.findMany({ where: { tenantId }, orderBy: { pointsCost: 'asc' } }),
    ]);

    const byStudent = students.map((student) => {
      const studentEvents = events.filter((event) => event.studentId === student.id);
      const positivePoints = studentEvents
        .filter((event) => event.polarity === BehaviourPolarity.POSITIVE)
        .reduce((sum, event) => sum + event.points, 0);
      const negativePoints = studentEvents
        .filter((event) => event.polarity === BehaviourPolarity.NEGATIVE)
        .reduce((sum, event) => sum + Math.abs(event.points), 0);

      return {
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        positivePoints,
        negativePoints,
        balance: positivePoints - negativePoints,
        latestEventAt: studentEvents[0]?.createdAt ?? null,
        categories: studentEvents.reduce<Record<string, number>>((accumulator, event) => {
          accumulator[event.category] = (accumulator[event.category] ?? 0) + event.points;
          return accumulator;
        }, {}),
      };
    });

    const heatmap = events.reduce<Record<string, { positive: number; negative: number }>>((accumulator, event) => {
      const current = accumulator[event.category] ?? { positive: 0, negative: 0 };
      if (event.polarity === BehaviourPolarity.POSITIVE) {
        current.positive += event.points;
      } else {
        current.negative += Math.abs(event.points);
      }
      accumulator[event.category] = current;
      return accumulator;
    }, {});

    return {
      totals: {
        eventCount: events.length,
        positiveEvents: events.filter((event) => event.polarity === BehaviourPolarity.POSITIVE).length,
        negativeEvents: events.filter((event) => event.polarity === BehaviourPolarity.NEGATIVE).length,
      },
      leaderboard: byStudent.sort((left, right) => right.balance - left.balance).slice(0, 10),
      students: byStudent,
      heatmap,
      rewards,
    };
  }

  async listRewards() {
    return this.prisma.reward.findMany({
      where: { tenantId: this.tenantId() },
      orderBy: { pointsCost: 'asc' },
    });
  }

  async createReward(dto: CreateRewardDto, actorId: string) {
    const reward = await this.prisma.reward.create({
      data: {
        tenantId: this.tenantId(),
        name: dto.name,
        pointsCost: dto.pointsCost,
        inventory: dto.inventory,
      },
    });

    await this.audit.record({
      tenantId: this.tenantId(),
      actorId,
      action: 'reward.created',
      entityType: 'Reward',
      entityId: reward.id,
      metadata: { pointsCost: dto.pointsCost },
    });

    return reward;
  }
}
