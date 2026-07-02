import {
  EnrollmentRole,
  LessonBlockType,
  LessonRevisionSource,
  PrismaClient,
  QuizQuestionType,
  SubscriptionStatus,
  SupportTicketPriority,
  SupportTicketStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();
const defaultPassword = 'ChangeMe12345!';

const roleDefinitions = [
  ['platform_owner', 'Platform Owner'],
  ['school_admin', 'School Admin'],
  ['vice_principal', 'Vice Principal'],
  ['teacher', 'Teacher'],
  ['co_teacher', 'Co Teacher'],
  ['student', 'Student'],
  ['parent', 'Parent'],
  ['support_staff', 'Support Staff'],
  ['finance', 'Finance'],
] as const;

async function upsertRole(tenantId: string, slug: string, name: string) {
  return prisma.role.upsert({
    where: { tenantId_slug: { tenantId, slug } },
    update: { name },
    create: {
      tenantId,
      slug,
      name,
      description: `${name} role`,
    },
  });
}

async function upsertUser(input: {
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  roleSlug: string;
}) {
  const passwordHash = await argon2.hash(defaultPassword);
  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: input.tenantId, email: input.email } },
    update: {
      firstName: input.firstName,
      lastName: input.lastName,
      passwordHash,
    },
    create: {
      tenantId: input.tenantId,
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
    },
  });

  const role = await prisma.role.findUniqueOrThrow({
    where: { tenantId_slug: { tenantId: input.tenantId, slug: input.roleSlug } },
  });

  await prisma.userRole.upsert({
    where: {
      tenantId_userId_roleId: {
        tenantId: input.tenantId,
        userId: user.id,
        roleId: role.id,
      },
    },
    update: {},
    create: {
      tenantId: input.tenantId,
      userId: user.id,
      roleId: role.id,
    },
  });

  return user;
}

async function ensureRoles(tenantId: string) {
  return Promise.all(roleDefinitions.map(([slug, name]) => upsertRole(tenantId, slug, name)));
}

async function main() {
  const systemTenant = await prisma.tenant.upsert({
    where: { tenantId: 'system' },
    update: {
      name: 'ClassSphere Platform',
      slug: 'system',
      billingEmail: 'owner@classsphere.local',
      branding: { theme: 'violet', productName: 'ClassSphere SaaS' },
    },
    create: {
      tenantId: 'system',
      name: 'ClassSphere Platform',
      slug: 'system',
      billingEmail: 'owner@classsphere.local',
      branding: { theme: 'violet', productName: 'ClassSphere SaaS' },
    },
  });

  await ensureRoles(systemTenant.tenantId);
  const platformOwner = await upsertUser({
    tenantId: systemTenant.tenantId,
    email: 'owner@classsphere.local',
    firstName: 'Platform',
    lastName: 'Owner',
    roleSlug: 'platform_owner',
  });

  await prisma.subscription.upsert({
    where: { tenantId_externalId: { tenantId: systemTenant.tenantId, externalId: 'stripe-system-plan' } },
    update: {
      provider: 'stripe',
      plan: 'Enterprise Core',
      status: SubscriptionStatus.ACTIVE,
      seats: 250,
      renewalAt: new Date('2027-01-01T00:00:00.000Z'),
    },
    create: {
      tenantId: systemTenant.tenantId,
      provider: 'stripe',
      externalId: 'stripe-system-plan',
      plan: 'Enterprise Core',
      status: SubscriptionStatus.ACTIVE,
      seats: 250,
      renewalAt: new Date('2027-01-01T00:00:00.000Z'),
    },
  });

  const schoolTenant = await prisma.tenant.upsert({
    where: { tenantId: 'aurora-high' },
    update: {
      name: 'Aurora High School',
      slug: 'aurora-high',
      billingEmail: 'finance@aurora.local',
      branding: {
        primary: '#7c3aed',
        accent: '#14b8a6',
        logoText: 'Aurora High',
      },
    },
    create: {
      tenantId: 'aurora-high',
      name: 'Aurora High School',
      slug: 'aurora-high',
      billingEmail: 'finance@aurora.local',
      branding: {
        primary: '#7c3aed',
        accent: '#14b8a6',
        logoText: 'Aurora High',
      },
    },
  });

  await ensureRoles(schoolTenant.tenantId);

  const schoolAdmin = await upsertUser({
    tenantId: schoolTenant.tenantId,
    email: 'admin@aurora.local',
    firstName: 'Ariana',
    lastName: 'Miles',
    roleSlug: 'school_admin',
  });
  await upsertUser({
    tenantId: schoolTenant.tenantId,
    email: 'vp@aurora.local',
    firstName: 'Victor',
    lastName: 'Lane',
    roleSlug: 'vice_principal',
  });
  const teacher = await upsertUser({
    tenantId: schoolTenant.tenantId,
    email: 'teacher@aurora.local',
    firstName: 'Taylor',
    lastName: 'Hart',
    roleSlug: 'teacher',
  });
  const coTeacher = await upsertUser({
    tenantId: schoolTenant.tenantId,
    email: 'coteacher@aurora.local',
    firstName: 'Casey',
    lastName: 'Wren',
    roleSlug: 'co_teacher',
  });
  const student = await upsertUser({
    tenantId: schoolTenant.tenantId,
    email: 'student@aurora.local',
    firstName: 'Sofia',
    lastName: 'Reed',
    roleSlug: 'student',
  });
  const parent = await upsertUser({
    tenantId: schoolTenant.tenantId,
    email: 'parent@aurora.local',
    firstName: 'Pat',
    lastName: 'Reed',
    roleSlug: 'parent',
  });
  await upsertUser({
    tenantId: schoolTenant.tenantId,
    email: 'finance@aurora.local',
    firstName: 'Finley',
    lastName: 'Cole',
    roleSlug: 'finance',
  });

  await prisma.teacherProfile.upsert({
    where: { userId: teacher.id },
    update: { tenantId: schoolTenant.tenantId, employeeNumber: 'T-1001' },
    create: { tenantId: schoolTenant.tenantId, userId: teacher.id, employeeNumber: 'T-1001' },
  });
  await prisma.teacherProfile.upsert({
    where: { userId: coTeacher.id },
    update: { tenantId: schoolTenant.tenantId, employeeNumber: 'T-1002' },
    create: { tenantId: schoolTenant.tenantId, userId: coTeacher.id, employeeNumber: 'T-1002' },
  });
  const studentProfile = await prisma.studentProfile.upsert({
    where: { userId: student.id },
    update: { tenantId: schoolTenant.tenantId, studentNumber: 'S-3001', house: 'Orion' },
    create: { tenantId: schoolTenant.tenantId, userId: student.id, studentNumber: 'S-3001', house: 'Orion' },
  });
  const parentProfile = await prisma.parentProfile.upsert({
    where: { userId: parent.id },
    update: { tenantId: schoolTenant.tenantId, relationship: 'Mother' },
    create: { tenantId: schoolTenant.tenantId, userId: parent.id, relationship: 'Mother' },
  });

  await prisma.parentStudent.upsert({
    where: { id: `${parentProfile.id}:${studentProfile.id}` },
    update: {
      tenantId: schoolTenant.tenantId,
      parentId: parentProfile.id,
      studentId: studentProfile.id,
    },
    create: {
      id: `${parentProfile.id}:${studentProfile.id}`,
      tenantId: schoolTenant.tenantId,
      parentId: parentProfile.id,
      studentId: studentProfile.id,
    },
  });

  const school = await prisma.school.upsert({
    where: { tenantId_code: { tenantId: schoolTenant.tenantId, code: 'AHS' } },
    update: { name: 'Aurora High School' },
    create: {
      tenantId: schoolTenant.tenantId,
      name: 'Aurora High School',
      code: 'AHS',
      address: { city: 'Aurora', country: 'US' },
    },
  });

  const subject = await prisma.subject.upsert({
    where: { tenantId_code: { tenantId: schoolTenant.tenantId, code: 'MATH-8' } },
    update: { name: 'Mathematics 8' },
    create: {
      tenantId: schoolTenant.tenantId,
      name: 'Mathematics 8',
      code: 'MATH-8',
    },
  });

  await prisma.academicSession.upsert({
    where: { id: `${schoolTenant.tenantId}-2026-fall` },
    update: {
      tenantId: schoolTenant.tenantId,
      name: '2026 Fall',
      startsAt: new Date('2026-08-15T00:00:00.000Z'),
      endsAt: new Date('2026-12-20T00:00:00.000Z'),
      isActive: true,
    },
    create: {
      id: `${schoolTenant.tenantId}-2026-fall`,
      tenantId: schoolTenant.tenantId,
      name: '2026 Fall',
      startsAt: new Date('2026-08-15T00:00:00.000Z'),
      endsAt: new Date('2026-12-20T00:00:00.000Z'),
      isActive: true,
    },
  });

  const classRoom = await prisma.classRoom.upsert({
    where: { tenantId_code: { tenantId: schoolTenant.tenantId, code: 'MATH8-A' } },
    update: {
      schoolId: school.id,
      subjectId: subject.id,
      name: 'Mathematics 8A',
      gradeLevel: '8',
    },
    create: {
      tenantId: schoolTenant.tenantId,
      schoolId: school.id,
      subjectId: subject.id,
      name: 'Mathematics 8A',
      code: 'MATH8-A',
      gradeLevel: '8',
    },
  });

  const enrollmentKey = (classRoomId: string, userId: string, role: EnrollmentRole) => `${schoolTenant.tenantId}:${classRoomId}:${userId}:${role}`;
  const enrollments = [
    [teacher.id, EnrollmentRole.TEACHER],
    [coTeacher.id, EnrollmentRole.CO_TEACHER],
    [student.id, EnrollmentRole.STUDENT],
  ] as const;

  for (const [userId, role] of enrollments) {
    await prisma.classEnrollment.upsert({
      where: { tenantId_classRoomId_userId_role: { tenantId: schoolTenant.tenantId, classRoomId: classRoom.id, userId, role } },
      update: {},
      create: {
        id: enrollmentKey(classRoom.id, userId, role),
        tenantId: schoolTenant.tenantId,
        classRoomId: classRoom.id,
        userId,
        role,
      },
    });
  }

  const existingLesson = await prisma.lesson.findFirst({
    where: { tenantId: schoolTenant.tenantId, classRoomId: classRoom.id, title: 'Linear Equations Deep Dive' },
  });

  const lesson = existingLesson
    ? await prisma.lesson.update({
        where: { id: existingLesson.id },
        data: {
          description: 'Interactive lesson with warm-up, worked examples, poll, and exit ticket.',
          createdById: teacher.id,
        },
      })
    : await prisma.lesson.create({
        data: {
          tenantId: schoolTenant.tenantId,
          classRoomId: classRoom.id,
          title: 'Linear Equations Deep Dive',
          description: 'Interactive lesson with warm-up, worked examples, poll, and exit ticket.',
          createdById: teacher.id,
        },
      });

  await prisma.lessonBlock.deleteMany({ where: { tenantId: schoolTenant.tenantId, lessonId: lesson.id } });
  const lessonBlocks = [
    {
      tenantId: schoolTenant.tenantId,
      lessonId: lesson.id,
      type: LessonBlockType.SLIDE,
      title: 'Learning Objective',
      position: 0,
      content: { heading: 'Solve one-step linear equations', bullets: ['Inverse operations', 'Check your solution'] },
    },
    {
      tenantId: schoolTenant.tenantId,
      lessonId: lesson.id,
      type: LessonBlockType.WHITEBOARD,
      title: 'Worked Example',
      position: 1,
      content: { prompt: 'Solve x + 7 = 19', expected: 'x = 12' },
    },
    {
      tenantId: schoolTenant.tenantId,
      lessonId: lesson.id,
      type: LessonBlockType.POLL,
      title: 'Confidence Check',
      position: 2,
      content: { question: 'How confident do you feel?', options: ['Need help', 'Almost there', 'Ready for challenge'] },
    },
    {
      tenantId: schoolTenant.tenantId,
      lessonId: lesson.id,
      type: LessonBlockType.QUIZ,
      title: 'Exit Ticket',
      position: 3,
      content: { linkedQuizTitle: 'Linear Equations Exit Ticket' },
    },
  ];

  await prisma.lessonBlock.createMany({ data: lessonBlocks });

  await prisma.lessonRevision.deleteMany({ where: { tenantId: schoolTenant.tenantId, lessonId: lesson.id } });
  await prisma.lessonRevision.create({
    data: {
      tenantId: schoolTenant.tenantId,
      lessonId: lesson.id,
      createdById: teacher.id,
      version: lesson.version,
      source: LessonRevisionSource.INITIAL,
      title: lesson.title,
      description: lesson.description,
      summary: 'Seeded lesson baseline',
      snapshot: {
        classRoomId: classRoom.id,
        title: lesson.title,
        description: lesson.description,
        isTemplate: false,
        blocks: lessonBlocks.map((block) => ({ type: block.type, title: block.title, content: block.content })),
      },
    },
  });

  const existingTemplate = await prisma.lesson.findFirst({
    where: { tenantId: schoolTenant.tenantId, classRoomId: classRoom.id, title: 'Bell Ringer Template', isTemplate: true },
  });

  const templateLesson = existingTemplate
    ? await prisma.lesson.update({
        where: { id: existingTemplate.id },
        data: {
          description: 'Reusable warm-up lesson template for rapid lesson starts.',
          createdById: teacher.id,
          isTemplate: true,
        },
      })
    : await prisma.lesson.create({
        data: {
          tenantId: schoolTenant.tenantId,
          classRoomId: classRoom.id,
          title: 'Bell Ringer Template',
          description: 'Reusable warm-up lesson template for rapid lesson starts.',
          isTemplate: true,
          createdById: teacher.id,
        },
      });

  await prisma.lessonBlock.deleteMany({ where: { tenantId: schoolTenant.tenantId, lessonId: templateLesson.id } });
  const templateBlocks = [
    {
      tenantId: schoolTenant.tenantId,
      lessonId: templateLesson.id,
      type: LessonBlockType.SLIDE,
      title: 'Starter Prompt',
      position: 0,
      content: { heading: 'Bell Ringer', prompt: 'What strategy did you use yesterday?' },
    },
    {
      tenantId: schoolTenant.tenantId,
      lessonId: templateLesson.id,
      type: LessonBlockType.POLL,
      title: 'Confidence Pulse',
      position: 1,
      content: { question: 'How ready are you for today?', options: ['Need a recap', 'Ready to practise', 'Ready to lead'] },
    },
  ];
  await prisma.lessonBlock.createMany({ data: templateBlocks });
  await prisma.lessonRevision.deleteMany({ where: { tenantId: schoolTenant.tenantId, lessonId: templateLesson.id } });
  await prisma.lessonRevision.create({
    data: {
      tenantId: schoolTenant.tenantId,
      lessonId: templateLesson.id,
      createdById: teacher.id,
      version: templateLesson.version,
      source: LessonRevisionSource.TEMPLATE_PUBLICATION,
      title: templateLesson.title,
      description: templateLesson.description,
      summary: 'Seeded template baseline',
      snapshot: {
        classRoomId: classRoom.id,
        title: templateLesson.title,
        description: templateLesson.description,
        isTemplate: true,
        blocks: templateBlocks.map((block) => ({ type: block.type, title: block.title, content: block.content })),
      },
    },
  });

  const existingLiveSession = await prisma.liveSession.findFirst({
    where: { tenantId: schoolTenant.tenantId, lessonId: lesson.id, code: 'AURORA' },
  });

  await prisma.liveSession.upsert({
    where: { id: existingLiveSession?.id ?? `${lesson.id}-live` },
    update: {
      tenantId: schoolTenant.tenantId,
      lessonId: lesson.id,
      code: 'AURORA',
      status: 'LIVE',
      startedAt: new Date('2026-09-05T09:00:00.000Z'),
      metrics: { raisedHands: 3, connectedStudents: 1, participationRate: 87 },
    },
    create: {
      id: `${lesson.id}-live`,
      tenantId: schoolTenant.tenantId,
      lessonId: lesson.id,
      code: 'AURORA',
      status: 'LIVE',
      startedAt: new Date('2026-09-05T09:00:00.000Z'),
      metrics: { raisedHands: 3, connectedStudents: 1, participationRate: 87 },
    },
  });

  const existingQuiz = await prisma.quiz.findFirst({
    where: { tenantId: schoolTenant.tenantId, classRoomId: classRoom.id, title: 'Linear Equations Exit Ticket' },
  });

  const quiz = existingQuiz
    ? await prisma.quiz.update({
        where: { id: existingQuiz.id },
        data: {
          settings: { mode: 'teacher-paced', timerSeconds: 45, leaderboard: true },
        },
      })
    : await prisma.quiz.create({
        data: {
          tenantId: schoolTenant.tenantId,
          classRoomId: classRoom.id,
          title: 'Linear Equations Exit Ticket',
          settings: { mode: 'teacher-paced', timerSeconds: 45, leaderboard: true },
        },
      });

  await prisma.question.deleteMany({ where: { tenantId: schoolTenant.tenantId, quizId: quiz.id } });
  const questions = await Promise.all([
    prisma.question.create({
      data: {
        tenantId: schoolTenant.tenantId,
        quizId: quiz.id,
        type: QuizQuestionType.MCQ,
        prompt: 'Solve x + 4 = 10',
        payload: { options: ['4', '6', '10'], correctAnswer: '6' },
        points: 2,
        position: 0,
      },
    }),
    prisma.question.create({
      data: {
        tenantId: schoolTenant.tenantId,
        quizId: quiz.id,
        type: QuizQuestionType.FILL_BLANK,
        prompt: 'Solve 3x = 21',
        payload: { acceptableAnswers: ['7'] },
        points: 2,
        position: 1,
      },
    }),
    prisma.question.create({
      data: {
        tenantId: schoolTenant.tenantId,
        quizId: quiz.id,
        type: QuizQuestionType.TRUE_FALSE,
        prompt: 'The solution to x - 5 = 2 is x = 7.',
        payload: { correctAnswer: true },
        points: 1,
        position: 2,
      },
    }),
  ]);

  await prisma.quizAttempt.upsert({
    where: { tenantId_quizId_studentId: { tenantId: schoolTenant.tenantId, quizId: quiz.id, studentId: student.id } },
    update: {
      status: 'SUBMITTED',
      score: 100,
      answers: [
        { questionId: questions[0].id, answer: '6' },
        { questionId: questions[1].id, answer: '7' },
        { questionId: questions[2].id, answer: true },
      ],
      submittedAt: new Date('2026-09-05T09:32:00.000Z'),
    },
    create: {
      tenantId: schoolTenant.tenantId,
      quizId: quiz.id,
      studentId: student.id,
      status: 'SUBMITTED',
      score: 100,
      answers: [
        { questionId: questions[0].id, answer: '6' },
        { questionId: questions[1].id, answer: '7' },
        { questionId: questions[2].id, answer: true },
      ],
      submittedAt: new Date('2026-09-05T09:32:00.000Z'),
    },
  });

  const behaviourEvents = [
    ['Participation', 3, 'POSITIVE', 'Consistently engages in whiteboard tasks.'],
    ['Helping Others', 2, 'POSITIVE', 'Supported a peer during guided practice.'],
    ['Late', -1, 'NEGATIVE', 'Arrived late to class by five minutes.'],
  ] as const;

  for (const [category, points, polarity, note] of behaviourEvents) {
    const existing = await prisma.behaviourEvent.findFirst({
      where: {
        tenantId: schoolTenant.tenantId,
        studentId: student.id,
        teacherId: teacher.id,
        category,
        note,
      },
    });

    if (!existing) {
      await prisma.behaviourEvent.create({
        data: {
          tenantId: schoolTenant.tenantId,
          studentId: student.id,
          teacherId: teacher.id,
          category,
          points,
          polarity,
          note,
        },
      });
    }
  }

  for (const reward of [
    { name: 'Homework Pass', pointsCost: 10, inventory: 25 },
    { name: 'Front Row Science Lab Seat', pointsCost: 15, inventory: 8 },
  ]) {
    const existing = await prisma.reward.findFirst({ where: { tenantId: schoolTenant.tenantId, name: reward.name } });
    if (existing) {
      await prisma.reward.update({ where: { id: existing.id }, data: reward });
    } else {
      await prisma.reward.create({ data: { tenantId: schoolTenant.tenantId, ...reward } });
    }
  }

  for (const badge of ['Momentum Builder', 'Math Communicator']) {
    const existing = await prisma.badge.findFirst({ where: { tenantId: schoolTenant.tenantId, name: badge } });
    if (!existing) {
      await prisma.badge.create({ data: { tenantId: schoolTenant.tenantId, name: badge } });
    }
  }

  const achievementDefinitions = [
    { name: 'Attendance Excellence', criteria: { minAttendanceRate: 95, minQuizAverage: 70 } },
    { name: 'Mastery in Motion', criteria: { minAttendanceRate: 85, minQuizAverage: 90 } },
  ];

  for (const achievement of achievementDefinitions) {
    const existing = await prisma.achievement.findFirst({ where: { tenantId: schoolTenant.tenantId, name: achievement.name } });
    if (existing) {
      await prisma.achievement.update({ where: { id: existing.id }, data: { criteria: achievement.criteria } });
    } else {
      await prisma.achievement.create({
        data: {
          tenantId: schoolTenant.tenantId,
          name: achievement.name,
          criteria: achievement.criteria,
        },
      });
    }
  }

  const existingAnnouncement = await prisma.announcement.findFirst({
    where: { tenantId: schoolTenant.tenantId, title: 'Curriculum Night' },
  });
  if (existingAnnouncement) {
    await prisma.announcement.update({
      where: { id: existingAnnouncement.id },
      data: {
        body: 'Join us on Thursday at 6 PM for curriculum night and platform onboarding.',
        audience: { roles: ['teacher', 'co_teacher', 'parent', 'student'], includeAll: false },
        createdById: schoolAdmin.id,
      },
    });
  } else {
    await prisma.announcement.create({
      data: {
        tenantId: schoolTenant.tenantId,
        title: 'Curriculum Night',
        body: 'Join us on Thursday at 6 PM for curriculum night and platform onboarding.',
        audience: { roles: ['teacher', 'co_teacher', 'parent', 'student'], includeAll: false },
        createdById: schoolAdmin.id,
      },
    });
  }

  const thread = await prisma.messageThread.upsert({
    where: { id: `${schoolTenant.tenantId}-parent-thread` },
    update: { subject: 'Weekly Progress Update' },
    create: {
      id: `${schoolTenant.tenantId}-parent-thread`,
      tenantId: schoolTenant.tenantId,
      subject: 'Weekly Progress Update',
    },
  });

  for (const userId of [teacher.id, parent.id]) {
    await prisma.messageParticipant.upsert({
      where: { tenantId_threadId_userId: { tenantId: schoolTenant.tenantId, threadId: thread.id, userId } },
      update: {},
      create: {
        tenantId: schoolTenant.tenantId,
        threadId: thread.id,
        userId,
      },
    });
  }

  const existingMessage = await prisma.message.findFirst({
    where: { tenantId: schoolTenant.tenantId, threadId: thread.id, senderId: teacher.id },
  });
  if (!existingMessage) {
    await prisma.message.create({
      data: {
        tenantId: schoolTenant.tenantId,
        threadId: thread.id,
        senderId: teacher.id,
        body: 'Sofia has shown excellent growth in equation solving this week and finished the exit ticket with full marks.',
      },
    });
  }

  const parentReply = await prisma.message.findFirst({
    where: { tenantId: schoolTenant.tenantId, threadId: thread.id, senderId: parent.id },
  });
  if (!parentReply) {
    await prisma.message.create({
      data: {
        tenantId: schoolTenant.tenantId,
        threadId: thread.id,
        senderId: parent.id,
        body: 'Thank you for the update. We will keep practicing solving equations at home this weekend.',
      },
    });
  }

  const existingStory = await prisma.story.findFirst({
    where: { tenantId: schoolTenant.tenantId, title: 'Algebra Warm-Up Highlights' },
  });
  if (existingStory) {
    await prisma.story.update({
      where: { id: existingStory.id },
      data: {
        media: [
          {
            type: 'image',
            url: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1200&q=80',
            caption: 'Students collaborating during the whiteboard station.',
          },
        ],
        visibility: { roles: ['teacher', 'co_teacher', 'parent', 'student'], includeAll: false },
        createdById: teacher.id,
      },
    });
  } else {
    await prisma.story.create({
      data: {
        tenantId: schoolTenant.tenantId,
        title: 'Algebra Warm-Up Highlights',
        media: [
          {
            type: 'image',
            url: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1200&q=80',
            caption: 'Students collaborating during the whiteboard station.',
          },
        ],
        visibility: { roles: ['teacher', 'co_teacher', 'parent', 'student'], includeAll: false },
        createdById: teacher.id,
      },
    });
  }

  const attendanceDates = [
    ['2026-09-01T09:00:00.000Z', 'present'],
    ['2026-09-02T09:00:00.000Z', 'present'],
    ['2026-09-03T09:00:00.000Z', 'present'],
    ['2026-09-04T09:00:00.000Z', 'late'],
    ['2026-09-05T09:00:00.000Z', 'present'],
  ] as const;

  for (const [recordedAt, status] of attendanceDates) {
    const existing = await prisma.attendance.findFirst({
      where: {
        tenantId: schoolTenant.tenantId,
        userId: student.id,
        classRoomId: classRoom.id,
        recordedAt: new Date(recordedAt),
      },
    });

    if (!existing) {
      await prisma.attendance.create({
        data: {
          tenantId: schoolTenant.tenantId,
          userId: student.id,
          classRoomId: classRoom.id,
          recordedAt: new Date(recordedAt),
          status,
        },
      });
    }
  }

  for (const notification of [
    {
      userId: parent.id,
      title: 'Announcement: Curriculum Night',
      body: 'Join us on Thursday at 6 PM for curriculum night and platform onboarding.',
    },
    {
      userId: parent.id,
      title: `THREAD:${thread.id}:New message`,
      body: 'New reply in Weekly Progress Update',
    },
    {
      userId: student.id,
      title: 'Lesson reminder',
      body: 'Linear Equations Deep Dive starts at 9:00 AM in room Aurora.',
    },
  ]) {
    const exists = await prisma.notification.findFirst({
      where: {
        tenantId: schoolTenant.tenantId,
        userId: notification.userId,
        title: notification.title,
        body: notification.body,
      },
    });

    if (!exists) {
      await prisma.notification.create({
        data: {
          tenantId: schoolTenant.tenantId,
          userId: notification.userId,
          title: notification.title,
          body: notification.body,
          channel: 'IN_APP',
        },
      });
    }
  }

  const existingTenantReport = await prisma.report.findFirst({
    where: { tenantId: schoolTenant.tenantId, type: 'tenant_overview' },
  });
  if (!existingTenantReport) {
    await prisma.report.create({
      data: {
        tenantId: schoolTenant.tenantId,
        type: 'tenant_overview',
        payload: {
          generatedAt: new Date().toISOString(),
          audience: { tenantRoles: ['school_admin', 'vice_principal'] },
          snapshot: {
            classes: 1,
            lessons: 1,
            quizzes: 1,
            liveSessions: 1,
          },
        },
      },
    });
  }

  const schoolSubscription = await prisma.subscription.upsert({
    where: { tenantId_externalId: { tenantId: schoolTenant.tenantId, externalId: 'stripe-aurora-enterprise' } },
    update: {
      provider: 'stripe',
      plan: 'Enterprise School',
      status: SubscriptionStatus.ACTIVE,
      seats: 1200,
      renewalAt: new Date('2027-08-31T00:00:00.000Z'),
    },
    create: {
      tenantId: schoolTenant.tenantId,
      provider: 'stripe',
      externalId: 'stripe-aurora-enterprise',
      plan: 'Enterprise School',
      status: SubscriptionStatus.ACTIVE,
      seats: 1200,
      renewalAt: new Date('2027-08-31T00:00:00.000Z'),
    },
  });

  for (const flag of [
    {
      tenantId: systemTenant.tenantId,
      key: 'platform.owner.billing-v2',
      description: 'Enables advanced billing operations views for platform owners.',
      enabled: true,
      payload: { enabledForRoles: ['platform_owner', 'finance'] },
    },
    {
      tenantId: schoolTenant.tenantId,
      key: 'tenant.support-center',
      description: 'Enables in-tenant support desk workflows for school operations.',
      enabled: true,
      payload: { enabledForRoles: ['school_admin', 'vice_principal', 'support_staff', 'teacher', 'parent'] },
    },
  ]) {
    await prisma.featureFlag.upsert({
      where: { tenantId_key: { tenantId: flag.tenantId, key: flag.key } },
      update: {
        description: flag.description,
        enabled: flag.enabled,
        payload: flag.payload,
      },
      create: flag,
    });
  }

  const supportTicket = await prisma.supportTicket.upsert({
    where: { id: `${schoolTenant.tenantId}-support-1` },
    update: {
      tenantId: schoolTenant.tenantId,
      title: 'Parent portal insight mismatch review',
      description: 'Parent requested a review of recent engagement insight wording after a quiz retake.',
      category: 'parent-portal',
      priority: SupportTicketPriority.HIGH,
      status: SupportTicketStatus.IN_PROGRESS,
      createdById: parent.id,
      assignedToId: schoolAdmin.id,
      firstResponseAt: new Date('2026-09-06T10:00:00.000Z'),
      dueAt: new Date('2026-09-06T18:00:00.000Z'),
    },
    create: {
      id: `${schoolTenant.tenantId}-support-1`,
      tenantId: schoolTenant.tenantId,
      title: 'Parent portal insight mismatch review',
      description: 'Parent requested a review of recent engagement insight wording after a quiz retake.',
      category: 'parent-portal',
      priority: SupportTicketPriority.HIGH,
      status: SupportTicketStatus.IN_PROGRESS,
      createdById: parent.id,
      assignedToId: schoolAdmin.id,
      firstResponseAt: new Date('2026-09-06T10:00:00.000Z'),
      dueAt: new Date('2026-09-06T18:00:00.000Z'),
      metadata: { origin: 'seed', channel: 'parent-message' },
    },
  });

  const supportComment = await prisma.supportTicketComment.findFirst({
    where: { tenantId: schoolTenant.tenantId, ticketId: supportTicket.id, authorId: schoolAdmin.id },
  });
  if (!supportComment) {
    await prisma.supportTicketComment.create({
      data: {
        tenantId: schoolTenant.tenantId,
        ticketId: supportTicket.id,
        authorId: schoolAdmin.id,
        body: 'We reviewed the analytics wording and confirmed the insight now reflects the latest retake score.',
      },
    });
  }

  await prisma.usageSnapshot.create({
    data: {
      tenantId: schoolTenant.tenantId,
      periodStart: new Date('2026-09-01T00:00:00.000Z'),
      periodEnd: new Date('2026-09-30T23:59:59.000Z'),
      activeUsers: 7,
      classesCount: 1,
      lessonsCount: 2,
      liveSessionsCount: 4,
      quizAttemptsCount: 1,
      reportsGenerated: 1,
      storageGb: 1.25,
      payload: {
        storageBytes: 1342177280,
        assetsByMimeType: { 'application/pdf': 2, 'image/png': 3 },
      },
    },
  }).catch(() => undefined);

  await prisma.billingInvoice.upsert({
    where: { tenantId_invoiceNumber: { tenantId: schoolTenant.tenantId, invoiceNumber: 'AURORA-HIGH-202609-ENT001' } },
    update: {
      subscriptionId: schoolSubscription.id,
      subtotalCents: 1080000,
      taxCents: 75600,
      totalCents: 1155600,
      periodStart: new Date('2026-09-01T00:00:00.000Z'),
      periodEnd: new Date('2026-09-30T23:59:59.000Z'),
      lineItems: [
        { code: 'seats', description: 'Enterprise School seats', quantity: 1200, unitCents: 900, amountCents: 1080000 },
      ],
      metadata: { generatedBy: 'seed' },
    },
    create: {
      tenantId: schoolTenant.tenantId,
      subscriptionId: schoolSubscription.id,
      invoiceNumber: 'AURORA-HIGH-202609-ENT001',
      subtotalCents: 1080000,
      taxCents: 75600,
      totalCents: 1155600,
      periodStart: new Date('2026-09-01T00:00:00.000Z'),
      periodEnd: new Date('2026-09-30T23:59:59.000Z'),
      lineItems: [
        { code: 'seats', description: 'Enterprise School seats', quantity: 1200, unitCents: 900, amountCents: 1080000 },
      ],
      metadata: { generatedBy: 'seed' },
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: systemTenant.tenantId,
      actorId: platformOwner.id,
      action: 'seed.completed',
      entityType: 'System',
      entityId: systemTenant.id,
      metadata: { tenantsProvisioned: ['system', 'aurora-high'] },
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
