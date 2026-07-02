import { Injectable, NotFoundException } from '@nestjs/common';
import { LessonRevisionSource, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  AutosaveLessonDto,
  CreateLessonDto,
  InstantiateLessonTemplateDto,
  LessonBlockDto,
  LessonEditorSessionDto,
  PublishLessonTemplateDto,
  ReorderLessonBlocksDto,
  UpdateLessonDto,
} from './dto';

type LessonSnapshot = {
  classRoomId: string;
  title: string;
  description: string | null;
  isTemplate: boolean;
  blocks: Array<{
    type: LessonBlockDto['type'];
    title: string;
    content: Record<string, unknown>;
  }>;
};

@Injectable()
export class LessonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private tenantId() {
    return this.tenantContext.getTenantId();
  }

  private activeEditorCutoff() {
    return new Date(Date.now() - 2 * 60 * 1000);
  }

  async getStudioBootstrap() {
    const tenantId = this.tenantId();
    const [classes, lessons, templates] = await Promise.all([
      this.prisma.classRoom.findMany({
        where: { tenantId },
        orderBy: [{ name: 'asc' }],
        select: {
          id: true,
          name: true,
          code: true,
          gradeLevel: true,
          school: { select: { id: true, name: true } },
        },
      }),
      this.list(),
      this.listTemplates(),
    ]);

    return { classes, lessons, templates };
  }

  async list(classRoomId?: string) {
    const tenantId = this.tenantId();
    const activeEditorCutoff = this.activeEditorCutoff();

    return this.prisma.lesson.findMany({
      where: {
        tenantId,
        ...(classRoomId ? { classRoomId } : {}),
      },
      include: {
        blocks: { orderBy: { position: 'asc' } },
        sessions: { orderBy: [{ startedAt: 'desc' }, { id: 'desc' }] },
        classRoom: true,
        revisions: {
          take: 1,
          orderBy: [{ createdAt: 'desc' }],
          select: { id: true, version: true, source: true, createdAt: true, summary: true },
        },
        assets: {
          where: { status: 'READY' },
          select: { id: true, displayName: true, mimeType: true, createdAt: true },
          orderBy: [{ createdAt: 'desc' }],
        },
        editorSessions: {
          where: { status: 'ACTIVE', lastHeartbeatAt: { gte: activeEditorCutoff } },
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
          orderBy: [{ lastHeartbeatAt: 'desc' }],
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });
  }

  async listTemplates(classRoomId?: string) {
    const tenantId = this.tenantId();
    return this.prisma.lesson.findMany({
      where: {
        tenantId,
        isTemplate: true,
        ...(classRoomId ? { classRoomId } : {}),
      },
      include: {
        blocks: { orderBy: { position: 'asc' } },
        classRoom: true,
        revisions: {
          take: 1,
          orderBy: [{ createdAt: 'desc' }],
          select: { id: true, version: true, source: true, createdAt: true, summary: true },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });
  }

  async getById(id: string) {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id, tenantId: this.tenantId() },
      include: {
        blocks: { orderBy: { position: 'asc' } },
        sessions: { orderBy: [{ startedAt: 'desc' }, { id: 'desc' }] },
        classRoom: true,
        revisions: {
          take: 20,
          orderBy: [{ createdAt: 'desc' }],
          include: { createdBy: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
        assets: {
          orderBy: [{ createdAt: 'desc' }],
          include: { owner: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
        editorSessions: {
          where: { status: 'ACTIVE', lastHeartbeatAt: { gte: this.activeEditorCutoff() } },
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
          orderBy: [{ lastHeartbeatAt: 'desc' }],
        },
      },
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    return lesson;
  }

  async listRevisions(id: string) {
    await this.getLessonOrThrow(id);
    return this.prisma.lessonRevision.findMany({
      where: { tenantId: this.tenantId(), lessonId: id },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async create(dto: CreateLessonDto, actorId: string) {
    const tenantId = this.tenantId();
    await this.ensureClassRoom(dto.classRoomId, tenantId);

    const lesson = await this.prisma.$transaction(async (tx) => {
      const created = await tx.lesson.create({
        data: {
          tenantId,
          classRoomId: dto.classRoomId,
          title: dto.title,
          description: dto.description,
          isTemplate: dto.isTemplate ?? false,
          createdById: actorId,
          blocks: {
            create: this.mapBlocksForCreate(tenantId, dto.blocks),
          },
        },
      });

      await this.createRevision(tx, created.id, actorId, LessonRevisionSource.INITIAL, 'Initial lesson creation');
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId,
          action: 'lesson.created',
          entityType: 'Lesson',
          entityId: created.id,
          metadata: {
            classRoomId: dto.classRoomId,
            blockCount: dto.blocks.length,
            isTemplate: dto.isTemplate ?? false,
          },
        },
      });

      return created.id;
    });

    return this.getById(lesson);
  }

  async update(id: string, dto: UpdateLessonDto, actorId: string) {
    return this.applyLessonMutation(id, dto, actorId, LessonRevisionSource.MANUAL_SAVE, dto.summary ?? 'Manual save');
  }

  async autosave(id: string, dto: AutosaveLessonDto, actorId: string) {
    return this.applyLessonMutation(id, dto, actorId, LessonRevisionSource.AUTOSAVE, dto.summary ?? 'Autosave snapshot');
  }

  async reorderBlocks(id: string, dto: ReorderLessonBlocksDto, actorId: string) {
    const tenantId = this.tenantId();
    const lesson = await this.getLessonWithBlocksOrThrow(id);
    const existingIds = new Set(lesson.blocks.map((block) => block.id));

    for (const block of dto.blocks) {
      if (!existingIds.has(block.id)) {
        throw new NotFoundException(`Lesson block ${block.id} not found`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const block of dto.blocks) {
        await tx.lessonBlock.updateMany({
          where: { id: block.id, lessonId: id, tenantId },
          data: { position: block.position },
        });
      }

      await tx.lesson.update({
        where: { id },
        data: { version: { increment: 1 } },
      });

      await this.createRevision(tx, id, actorId, LessonRevisionSource.REORDER, dto.summary ?? 'Block order updated');
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId,
          action: 'lesson.blocks.reordered',
          entityType: 'Lesson',
          entityId: id,
          metadata: { blockCount: dto.blocks.length },
        },
      });
    });

    return this.getById(id);
  }

  async createVersion(id: string, actorId: string) {
    const tenantId = this.tenantId();
    const lesson = await this.getLessonWithBlocksOrThrow(id);

    const clonedId = await this.prisma.$transaction(async (tx) => {
      const created = await tx.lesson.create({
        data: {
          tenantId,
          classRoomId: lesson.classRoomId,
          title: `${lesson.title} v${lesson.version + 1}`,
          description: lesson.description,
          version: 1,
          isTemplate: lesson.isTemplate,
          createdById: actorId,
          blocks: {
            create: this.mapBlocksForCreate(tenantId, lesson.blocks),
          },
        },
      });

      await this.createRevision(tx, created.id, actorId, LessonRevisionSource.INITIAL, `Cloned from ${lesson.title}`);
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId,
          action: 'lesson.version.created',
          entityType: 'Lesson',
          entityId: created.id,
          metadata: { sourceLessonId: id },
        },
      });

      return created.id;
    });

    return this.getById(clonedId);
  }

  async publishTemplate(id: string, dto: PublishLessonTemplateDto, actorId: string) {
    return this.applyLessonMutation(
      id,
      { ...dto, isTemplate: true, summary: 'Published to template library' },
      actorId,
      LessonRevisionSource.TEMPLATE_PUBLICATION,
      'Published to template library',
    );
  }

  async instantiateTemplate(id: string, dto: InstantiateLessonTemplateDto, actorId: string) {
    const tenantId = this.tenantId();
    const template = await this.prisma.lesson.findFirst({
      where: { id, tenantId, isTemplate: true },
      include: { blocks: { orderBy: { position: 'asc' } } },
    });

    if (!template) {
      throw new NotFoundException('Template lesson not found');
    }

    await this.ensureClassRoom(dto.classRoomId, tenantId);

    const createdId = await this.prisma.$transaction(async (tx) => {
      const created = await tx.lesson.create({
        data: {
          tenantId,
          classRoomId: dto.classRoomId,
          title: dto.title?.trim() || template.title,
          description: template.description,
          createdById: actorId,
          blocks: {
            create: this.mapBlocksForCreate(tenantId, template.blocks),
          },
        },
      });

      await this.createRevision(
        tx,
        created.id,
        actorId,
        LessonRevisionSource.TEMPLATE_INSTANTIATION,
        `Created from template ${template.title}`,
      );
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId,
          action: 'lesson.template.instantiated',
          entityType: 'Lesson',
          entityId: created.id,
          metadata: { templateLessonId: id, classRoomId: dto.classRoomId },
        },
      });

      return created.id;
    });

    return this.getById(createdId);
  }

  async restoreRevision(id: string, revisionId: string, actorId: string) {
    const tenantId = this.tenantId();
    const revision = await this.prisma.lessonRevision.findFirst({
      where: { id: revisionId, lessonId: id, tenantId },
    });

    if (!revision) {
      throw new NotFoundException('Lesson revision not found');
    }

    const snapshot = revision.snapshot as unknown as LessonSnapshot;

    await this.prisma.$transaction(async (tx) => {
      await tx.lessonBlock.deleteMany({ where: { tenantId, lessonId: id } });
      await tx.lesson.update({
        where: { id },
        data: {
          title: snapshot.title,
          description: snapshot.description,
          isTemplate: snapshot.isTemplate,
          version: { increment: 1 },
          blocks: {
            create: this.mapBlocksForCreate(tenantId, snapshot.blocks),
          },
        },
      });

      await this.createRevision(tx, id, actorId, LessonRevisionSource.RESTORE, `Restored revision ${revision.version}`);
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId,
          action: 'lesson.revision.restored',
          entityType: 'Lesson',
          entityId: id,
          metadata: { revisionId },
        },
      });
    });

    return this.getById(id);
  }

  async registerEditorSession(id: string, dto: LessonEditorSessionDto, actorId: string) {
    const tenantId = this.tenantId();
    await this.getLessonOrThrow(id);

    const session = await this.prisma.lessonEditorSession.upsert({
      where: {
        tenantId_lessonId_sessionKey: {
          tenantId,
          lessonId: id,
          sessionKey: dto.sessionKey,
        },
      },
      update: {
        userId: actorId,
        deviceLabel: dto.deviceLabel,
        userAgent: dto.userAgent,
        status: 'ACTIVE',
        lastHeartbeatAt: new Date(),
      },
      create: {
        tenantId,
        lessonId: id,
        userId: actorId,
        sessionKey: dto.sessionKey,
        deviceLabel: dto.deviceLabel,
        userAgent: dto.userAgent,
        status: 'ACTIVE',
        lastHeartbeatAt: new Date(),
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    return {
      session,
      activeEditors: await this.listActiveEditors(id),
    };
  }

  async heartbeatEditorSession(id: string, sessionId: string) {
    const tenantId = this.tenantId();
    await this.prisma.lessonEditorSession.updateMany({
      where: { id: sessionId, lessonId: id, tenantId },
      data: { status: 'ACTIVE', lastHeartbeatAt: new Date() },
    });

    return {
      activeEditors: await this.listActiveEditors(id),
    };
  }

  async closeEditorSession(id: string, sessionId: string) {
    const tenantId = this.tenantId();
    await this.prisma.lessonEditorSession.updateMany({
      where: { id: sessionId, lessonId: id, tenantId },
      data: { status: 'CLOSED' },
    });

    return {
      activeEditors: await this.listActiveEditors(id),
    };
  }

  private async applyLessonMutation(
    id: string,
    dto: UpdateLessonDto,
    actorId: string,
    source: LessonRevisionSource,
    summary: string,
  ) {
    const tenantId = this.tenantId();
    const current = await this.getLessonWithBlocksOrThrow(id);
    const currentSnapshot = this.createSnapshot(current);
    const nextSnapshot: LessonSnapshot = {
      classRoomId: current.classRoomId,
      title: dto.title ?? current.title,
      description: dto.description ?? current.description,
      isTemplate: dto.isTemplate ?? current.isTemplate,
      blocks: dto.blocks ? dto.blocks.map((block) => ({ type: block.type, title: block.title, content: block.content })) : currentSnapshot.blocks,
    };

    if (JSON.stringify(currentSnapshot) === JSON.stringify(nextSnapshot)) {
      return this.getById(id);
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.blocks) {
        await tx.lessonBlock.deleteMany({ where: { tenantId, lessonId: id } });
      }

      await tx.lesson.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
          isTemplate: dto.isTemplate,
          version: { increment: 1 },
          blocks: dto.blocks
            ? {
                create: this.mapBlocksForCreate(tenantId, dto.blocks),
              }
            : undefined,
        },
      });

      await this.createRevision(tx, id, actorId, source, summary);
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId,
          action: source === LessonRevisionSource.AUTOSAVE ? 'lesson.autosaved' : 'lesson.updated',
          entityType: 'Lesson',
          entityId: id,
          metadata: {
            source,
            blockCount: nextSnapshot.blocks.length,
            isTemplate: nextSnapshot.isTemplate,
          },
        },
      });
    });

    return this.getById(id);
  }

  private async createRevision(
    tx: Prisma.TransactionClient,
    lessonId: string,
    actorId: string,
    source: LessonRevisionSource,
    summary: string,
  ) {
    const lesson = await tx.lesson.findUniqueOrThrow({
      where: { id: lessonId },
      include: { blocks: { orderBy: { position: 'asc' } } },
    });

    return tx.lessonRevision.create({
      data: {
        tenantId: lesson.tenantId,
        lessonId: lesson.id,
        createdById: actorId,
        version: lesson.version,
        source,
        title: lesson.title,
        description: lesson.description,
        summary,
        snapshot: this.createSnapshot(lesson) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private createSnapshot(lesson: {
    classRoomId: string;
    title: string;
    description: string | null;
    isTemplate: boolean;
    blocks: Array<{ type: LessonBlockDto['type']; title: string; content: Prisma.JsonValue }>;
  }): LessonSnapshot {
    return {
      classRoomId: lesson.classRoomId,
      title: lesson.title,
      description: lesson.description,
      isTemplate: lesson.isTemplate,
      blocks: lesson.blocks.map((block) => ({
        type: block.type,
        title: block.title,
        content: (block.content as Record<string, unknown>) ?? {},
      })),
    };
  }

  private mapBlocksForCreate(
    tenantId: string,
    blocks: Array<{ type: LessonBlockDto['type']; title: string; content: Prisma.JsonValue | Record<string, unknown> }>,
  ) {
    return blocks.map((block, index) => ({
      tenantId,
      type: block.type,
      title: block.title,
      position: index,
      content: block.content as Prisma.InputJsonValue,
    }));
  }

  private async listActiveEditors(lessonId: string) {
    return this.prisma.lessonEditorSession.findMany({
      where: {
        tenantId: this.tenantId(),
        lessonId,
        status: 'ACTIVE',
        lastHeartbeatAt: { gte: this.activeEditorCutoff() },
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: [{ lastHeartbeatAt: 'desc' }],
    });
  }

  private async getLessonOrThrow(id: string) {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id, tenantId: this.tenantId() },
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    return lesson;
  }

  private async getLessonWithBlocksOrThrow(id: string) {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id, tenantId: this.tenantId() },
      include: { blocks: { orderBy: { position: 'asc' } } },
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    return lesson;
  }

  private async ensureClassRoom(classRoomId: string, tenantId: string) {
    const classRoom = await this.prisma.classRoom.findFirst({ where: { id: classRoomId, tenantId } });
    if (!classRoom) {
      throw new NotFoundException('Classroom not found');
    }
    return classRoom;
  }
}
