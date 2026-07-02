import { QuizQuestionType } from '@prisma/client';

export type QuestionForGrading = {
  id: string;
  type: QuizQuestionType;
  points: number;
  payload: Record<string, unknown>;
};

export type AttemptAnswer = {
  questionId: string;
  answer: unknown;
};

const normalizeText = (value: unknown) => String(value ?? '').trim().toLowerCase();

const deepEqual = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

function gradeAnswer(question: QuestionForGrading, submittedAnswer: unknown) {
  if (question.type === QuizQuestionType.ESSAY) {
    return { isCorrect: null, awardedPoints: 0, maxPoints: question.points };
  }

  if (question.type === QuizQuestionType.POLL) {
    return { isCorrect: true, awardedPoints: 0, maxPoints: 0 };
  }

  const payload = question.payload;
  let isCorrect = false;

  switch (question.type) {
    case QuizQuestionType.MCQ:
    case QuizQuestionType.TRUE_FALSE:
    case QuizQuestionType.IMAGE:
    case QuizQuestionType.AUDIO:
    case QuizQuestionType.HOTSPOT:
      isCorrect = deepEqual(submittedAnswer, payload.correctAnswer);
      break;
    case QuizQuestionType.FILL_BLANK: {
      const acceptableAnswers = Array.isArray(payload.acceptableAnswers)
        ? payload.acceptableAnswers.map(normalizeText)
        : [normalizeText(payload.correctAnswer)];
      isCorrect = acceptableAnswers.includes(normalizeText(submittedAnswer));
      break;
    }
    case QuizQuestionType.ORDERING:
    case QuizQuestionType.DRAG_DROP:
      isCorrect = deepEqual(submittedAnswer, payload.correctAnswer);
      break;
    case QuizQuestionType.MATCHING: {
      const expected = payload.correctPairs;
      isCorrect = deepEqual(submittedAnswer, expected);
      break;
    }
    default:
      isCorrect = false;
  }

  return {
    isCorrect,
    awardedPoints: isCorrect ? question.points : 0,
    maxPoints: question.points,
  };
}

export function gradeAttempt(questions: QuestionForGrading[], answers: AttemptAnswer[]) {
  const answerMap = new Map(answers.map((item) => [item.questionId, item.answer]));
  const gradedQuestions = questions.map((question) => {
    const result = gradeAnswer(question, answerMap.get(question.id));
    return {
      questionId: question.id,
      submittedAnswer: answerMap.get(question.id) ?? null,
      ...result,
    };
  });

  const maxScore = gradedQuestions.reduce((sum, item) => sum + item.maxPoints, 0);
  const awardedScore = gradedQuestions.reduce((sum, item) => sum + item.awardedPoints, 0);
  const percentage = maxScore > 0 ? Number(((awardedScore / maxScore) * 100).toFixed(2)) : 0;

  return {
    score: percentage,
    awardedScore,
    maxScore,
    gradedQuestions,
    requiresManualReview: gradedQuestions.some((item) => item.isCorrect === null),
  };
}
