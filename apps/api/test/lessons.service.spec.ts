import { LessonRevisionSource, LessonBlockType } from '@prisma/client';
import { LessonsService } from '../src/lessons/lessons.service';
import { PrismaService } from '../src/common/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

describe('LessonsService', () => {
  it('instantiates a template into a target classroom and records an initial revision', async () => {
    const template = {
      id: 'lesson-template-1',
      tenantId: 'aurora-high',
      classRoomId: 'class-template',
      title: 'Fractions Warmup',
      description: 'Template description',
      isTemplate: true,
      version: 3,
      blocks: [
        { id: 'b1', type: LessonBlockType.SLIDE, title: 'Start', position: 0, content: { heading: 'Warm up' } },
        { id: 'b2', type: LessonBlockType.QUIZ, title: 'Check', position: 1, content: { prompt: '1/2 + 1/2' } },
      ],
    };

    const tx = {
      lesson: {
        create: jest.fn().mockResolvedValue({ id: 'lesson-new', tenantId: 'aurora-high' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'lesson-new',
          tenantId: 'aurora-high',
          classRoomId: 'class-1',
          title: 'Fractions Warmup - Period 1',
          description: 'Template description',
          isTemplate: false,
          version: 1,
          blocks: template.blocks,
        }),
      },
      lessonRevision: {
        create: jest.fn().mockResolvedValue({ id: 'rev-1', version: 1, source: LessonRevisionSource.TEMPLATE_INSTANTIATION }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    const prisma = {
      lesson: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(template)
          .mockResolvedValueOnce({
            id: 'lesson-new',
            tenantId: 'aurora-high',
            classRoomId: 'class-1',
            title: 'Fractions Warmup - Period 1',
            description: 'Template description',
            version: 1,
            isTemplate: false,
            blocks: template.blocks,
            sessions: [],
            classRoom: { id: 'class-1', name: 'Period 1', code: 'MATH-1' },
            revisions: [],
            assets: [],
            editorSessions: [],
          }),
      },
      classRoom: {
        findFirst: jest.fn().mockResolvedValue({ id: 'class-1', tenantId: 'aurora-high' }),
      },
      $transaction: jest.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService;

    const service = new LessonsService(prisma, { getTenantId: () => 'aurora-high' } as TenantContextService);

    const result = await service.instantiateTemplate(
      'lesson-template-1',
      { classRoomId: 'class-1', title: 'Fractions Warmup - Period 1' },
      'teacher-1',
    );

    expect(tx.lesson.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          classRoomId: 'class-1',
          title: 'Fractions Warmup - Period 1',
          blocks: expect.objectContaining({
            create: expect.arrayContaining([
              expect.objectContaining({ type: LessonBlockType.SLIDE }),
              expect.objectContaining({ type: LessonBlockType.QUIZ }),
            ]),
          }),
        }),
      }),
    );
    expect(tx.lessonRevision.create).toHaveBeenCalled();
    expect(result.id).toBe('lesson-new');
  });
});
