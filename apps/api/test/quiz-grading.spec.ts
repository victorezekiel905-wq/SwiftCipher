import { QuizQuestionType } from '@prisma/client';
import { gradeAttempt } from '../src/quizzes/grading';

describe('gradeAttempt', () => {
  it('grades mixed question types correctly', () => {
    const result = gradeAttempt(
      [
        {
          id: 'q1',
          type: QuizQuestionType.MCQ,
          points: 2,
          payload: { correctAnswer: 'A' },
        },
        {
          id: 'q2',
          type: QuizQuestionType.FILL_BLANK,
          points: 3,
          payload: { acceptableAnswers: ['photosynthesis', 'photo synthesis'] },
        },
        {
          id: 'q3',
          type: QuizQuestionType.ESSAY,
          points: 5,
          payload: {},
        },
      ],
      [
        { questionId: 'q1', answer: 'A' },
        { questionId: 'q2', answer: 'Photosynthesis' },
        { questionId: 'q3', answer: 'Detailed explanation' },
      ],
    );

    expect(result.awardedScore).toBe(5);
    expect(result.maxScore).toBe(10);
    expect(result.score).toBe(50);
    expect(result.requiresManualReview).toBe(true);
  });
});
