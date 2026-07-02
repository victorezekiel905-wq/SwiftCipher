export type ChildInsightInput = {
  childName: string;
  quizAverage: number;
  attendanceRate: number;
  positiveBehaviourBalance: number;
  recentParticipationCount: number;
};

export function buildChildInsights(input: ChildInsightInput) {
  const insights: string[] = [];

  if (input.quizAverage >= 85) {
    insights.push(`${input.childName} performs strongly in assessed activities with an average score of ${input.quizAverage}%.`);
  } else if (input.quizAverage > 0 && input.quizAverage < 65) {
    insights.push(`${input.childName} would benefit from targeted reinforcement on recent quiz topics.`);
  }

  if (input.attendanceRate >= 95) {
    insights.push(`Attendance has been excellent at ${input.attendanceRate}% over the tracked period.`);
  } else if (input.attendanceRate > 0 && input.attendanceRate < 85) {
    insights.push(`Attendance has dipped to ${input.attendanceRate}%; closer follow-up may help maintain continuity.`);
  }

  if (input.positiveBehaviourBalance >= 10) {
    insights.push(`Positive behaviour momentum is strong with a net balance of ${input.positiveBehaviourBalance} points.`);
  } else if (input.positiveBehaviourBalance < 0) {
    insights.push(`Behaviour trends show more corrective points than positive points recently; consider a teacher check-in.`);
  }

  if (input.recentParticipationCount >= 3) {
    insights.push(`Participation is active across lessons and quizzes this week.`);
  } else if (input.recentParticipationCount === 0) {
    insights.push(`Participation signals are limited this week; additional encouragement could help.`);
  }

  if (!insights.length) {
    insights.push(`${input.childName} shows stable platform engagement with no immediate risk indicators.`);
  }

  return insights;
}
