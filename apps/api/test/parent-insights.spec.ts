import { buildChildInsights } from '../src/parent-portal/insights';

describe('buildChildInsights', () => {
  it('returns strong performance insights', () => {
    const insights = buildChildInsights({
      childName: 'Ava',
      quizAverage: 92,
      attendanceRate: 98,
      positiveBehaviourBalance: 15,
      recentParticipationCount: 4,
    });

    expect(insights.join(' ')).toContain('Ava performs strongly');
    expect(insights.join(' ')).toContain('Attendance has been excellent');
    expect(insights.join(' ')).toContain('Participation is active');
  });
});
