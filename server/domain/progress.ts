import type {
  Improvement,
  ProgressSnapshot,
  TrainingSessionRecord,
  TrainingStage,
} from '../../src/contracts/training';

export const dateInTimeZone = (date: Date, timeZone = 'Asia/Shanghai'): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

export const isQualifyingSession = (record: TrainingSessionRecord): boolean =>
  (record.moduleId ?? 'pelvic_floor') === 'pelvic_floor' &&
  record.stage !== null &&
  record.status === 'complete' &&
  record.completedGroups >= record.targetGroups &&
  record.metrics !== null &&
  ['medium', 'good'].includes(record.metrics.quality) &&
  record.assessment !== null &&
  !record.assessment.discomfort &&
  record.assessment.effort !== 'tired';

export const countQualifyingDays = (
  records: TrainingSessionRecord[],
): Record<'beginner' | 'intermediate', number> => ({
  beginner: new Set(
    records
      .filter((record) => record.stage === 'beginner' && isQualifyingSession(record))
      .map((record) => record.localDate),
  ).size,
  intermediate: new Set(
    records
      .filter((record) => record.stage === 'intermediate' && isQualifyingSession(record))
      .map((record) => record.localDate),
  ).size,
});

export const getUnlockedStages = (records: TrainingSessionRecord[]): TrainingStage[] => {
  const counts = countQualifyingDays(records);
  const stages: TrainingStage[] = ['beginner'];
  if (counts.beginner >= 14) stages.push('intermediate');
  if (counts.intermediate >= 21) stages.push('advanced');
  return stages;
};

const dateNumber = (date: string) => Date.parse(`${date}T00:00:00Z`);

export const calculateStreaks = (
  records: TrainingSessionRecord[],
  today: string,
): { current: number; longest: number; trainingDays: number } => {
  const dates = [
    ...new Set(
      records.filter((record) => record.status === 'complete').map((record) => record.localDate),
    ),
  ].sort((a, b) => dateNumber(a) - dateNumber(b));
  let longest = 0;
  let run = 0;
  let previous: number | null = null;
  for (const date of dates) {
    const current = dateNumber(date);
    run = previous !== null && current - previous === 86_400_000 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = current;
  }
  const complete = new Set(dates);
  const todayNumber = dateNumber(today);
  const currentStart = complete.has(today)
    ? todayNumber
    : complete.has(new Date(todayNumber - 86_400_000).toISOString().slice(0, 10))
      ? todayNumber - 86_400_000
      : null;
  let current = 0;
  if (currentStart !== null) {
    let cursor = currentStart;
    while (complete.has(new Date(cursor).toISOString().slice(0, 10))) {
      current += 1;
      cursor -= 86_400_000;
    }
  }
  return { current, longest, trainingDays: dates.length };
};

const improvementDefinitions = [
  ['patternMatchRate', 'signal_clarity', '信号清晰度'],
  ['timingAdherence', 'rhythm_stability', '节奏稳定度'],
  ['releaseRecovery', 'relaxation_recovery', '放松回落'],
] as const;

export const calculateImprovements = (
  records: TrainingSessionRecord[],
  stage: TrainingStage,
): Improvement[] => {
  const eligible = records
    .filter((record) => record.stage === stage && isQualifyingSession(record) && record.metrics)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  if (eligible.length < 6) return [];
  const baseline = eligible.slice(0, 3);
  const recent = eligible.slice(-3);
  return improvementDefinitions.flatMap(([key, metric, label]) => {
    const average = (items: TrainingSessionRecord[]) =>
      items.reduce((sum, record) => sum + (record.metrics?.[key] ?? 0), 0) / items.length;
    const change = Math.round(average(recent) - average(baseline));
    return change >= 5
      ? [{ metric, label, change, message: `${label}较阶段起步提升 ${change}%` }]
      : [];
  });
};

export const buildProgress = (
  records: TrainingSessionRecord[],
  today: string,
): ProgressSnapshot => {
  records = records.filter((r) => (r.moduleId ?? 'pelvic_floor') === 'pelvic_floor');
  const qualifyingDays = countQualifyingDays(records);
  const unlockedStages = getUnlockedStages(records);
  const latestStage =
    [...records]
      .filter((record) => record.status !== 'active')
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]?.stage ?? 'beginner';
  const streaks = calculateStreaks(records, today);
  const improvements = calculateImprovements(records, latestStage);
  const message =
    improvements[0]?.message ??
    (records.filter((record) => record.stage === latestStage && isQualifyingSession(record))
      .length < 6
      ? '完成 6 次达标训练后，这里会显示训练表现变化。'
      : '近期训练表现保持稳定。');
  return {
    currentStreak: streaks.current,
    longestStreak: streaks.longest,
    trainingDays: streaks.trainingDays,
    unlockedStages,
    qualifyingDays,
    improvements,
    message,
  };
};
