import { Injectable, NotFoundException } from '@nestjs/common';
import { AttemptStatus, Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CreateQuizDto, SubmitQuizAttemptDto, UpdateQuizDto } from './dto';
import { gradeAttempt } from './grading';

@Injectable()
export class QuizzesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  private tenantId() {
    return this.tenantContext.getTenantId();
  }

  async list(classRoomId?: string) {
    return this.prisma.quiz.findMany({
      where: {
        tenantId: this.tenantId(),
        ...(classRoomId ? { classRoomId } : {}),
      },
      include: {
        classRoom: true,
        questions: { orderBy: { position: 'asc' } },
        attempts: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getById(id: string) {
    const quiz = await this.prisma.quiz.findFirst({
      where: { id, tenantId: this.tenantId() },
      include: {
        classRoom: true,
        questions: { orderBy: { position: 'asc' } },
        attempts: true,
      },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    return quiz;
  }

  async create(dto: CreateQuizDto, actorId: string) {
    const tenantId = this.tenantId();
    const classRoom = await this.prisma.classRoom.findFirst({ where: { id: dto.classRoomId, tenantId } });
    if (!classRoom) {
      throw new NotFoundException('Classroom not found');
    }

    const quiz = await this.prisma.quiz.create({
      data: {
        tenantId,
        classRoomId: dto.classRoomId,
        title: dto.title,
        settings: dto.settings as Prisma.InputJsonValue,
        questions: {
          create: dto.questions.map((question, index) => ({
            tenantId,
            type: question.type,
            prompt: question.prompt,
            payload: question.payload as Prisma.InputJsonValue,
            points: question.points ?? 1,
            position: index,
          })),
        },
      },
      include: {
        classRoom: true,
        questions: { orderBy: { position: 'asc' } },
      },
    });

    await this.audit.record({
      tenantId,
      actorId,
      action: 'quiz.created',
      entityType: 'Quiz',
      entityId: quiz.id,
      metadata: { classRoomId: dto.classRoomId, questionCount: dto.questions.length },
    });

    return quiz;
  }

  async update(id: string, dto: UpdateQuizDto, actorId: string) {
    const tenantId = this.tenantId();
    await this.getById(id);

    const quiz = await this.prisma.$transaction(async (tx) => {
      if (dto.questions) {
        await tx.question.deleteMany({ where: { tenantId, quizId: id } });
      }

      const updated = await tx.quiz.update({
        where: { id },
        data: {
          title: dto.title,
          settings: dto.settings as Prisma.InputJsonValue,
          questions: dto.questions
            ? {
                create: dto.questions.map((question, index) => ({
                  tenantId,
                  type: question.type,
                  prompt: question.prompt,
                  payload: question.payload as Prisma.InputJsonValue,
                  points: question.points ?? 1,
                  position: index,
                })),
              }
            : undefined,
        },
        include: {
          classRoom: true,
          questions: { orderBy: { position: 'asc' } },
          attempts: true,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorId,
          action: 'quiz.updated',
          entityType: 'Quiz',
          entityId: id,
          metadata: { questionCount: dto.questions?.length },
        },
      });

      return updated;
    });

    return quiz;
  }

  async submitAttempt(quizId: string, studentId: string, dto: SubmitQuizAttemptDto) {
    const tenantId = this.tenantId();
    const quiz = await this.getById(quizId);
    const grading = gradeAttempt(
      quiz.questions.map((question) => ({
        id: question.id,
        type: question.type,
        payload: question.payload as Record<string, unknown>,
        points: question.points,
      })),
      dto.answers,
    );

    const attempt = await this.prisma.quizAttempt.upsert({
      where: { tenantId_quizId_studentId: { tenantId, quizId, studentId } },
      update: {
        answers: dto.answers as unknown as Prisma.InputJsonValue,
        score: grading.score,
        status: grading.requiresManualReview ? AttemptStatus.GRADED : AttemptStatus.SUBMITTED,
        submittedAt: new Date(),
      },
      create: {
        tenantId,
        quizId,
        studentId,
        answers: dto.answers as unknown as Prisma.InputJsonValue,
        score: grading.score,
        status: grading.requiresManualReview ? AttemptStatus.GRADED : AttemptStatus.SUBMITTED,
        submittedAt: new Date(),
      },
    });

    await this.audit.record({
      tenantId,
      actorId: studentId,
      action: 'quiz.attempt.submitted',
      entityType: 'QuizAttempt',
      entityId: attempt.id,
      metadata: {
        quizId,
        score: grading.score,
        requiresManualReview: grading.requiresManualReview,
      },
    });

    return {
      attempt,
      grading,
    };
  }

  async analytics(id: string) {
    const quiz = await this.getById(id);
    const attempts = quiz.attempts.filter((attempt) => typeof attempt.score === 'number');
    const averageScore = attempts.length
      ? Number((attempts.reduce((sum, attempt) => sum + (attempt.score ?? 0), 0) / attempts.length).toFixed(2))
      : 0;

    const questionAnalytics = quiz.questions.map((question) => {
      const responses = quiz.attempts
        .map((attempt) => {
          const answers = Array.isArray(attempt.answers) ? (attempt.answers as Array<Record<string, unknown>>) : [];
          return answers.find((answer) => answer.questionId === question.id);
        })
        .filter(Boolean);

      return {
        questionId: question.id,
        prompt: question.prompt,
        type: question.type,
        responseCount: responses.length,
      };
    });

    return {
      quiz: {
        id: quiz.id,
        title: quiz.title,
        questionCount: quiz.questions.length,
      },
      attempts: {
        count: quiz.attempts.length,
        submittedCount: attempts.length,
        averageScore,
        highestScore: attempts.length ? Math.max(...attempts.map((attempt) => attempt.score ?? 0)) : 0,
      },
      questions: questionAnalytics,
    };
  }
}
