/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import type { TrainingSessionRecord } from '../../src/contracts/training';
import { buildProgress, calculateStreaks } from './progress';

const record = (date: string, score: number): TrainingSessionRecord => ({
  id: date,
  requestId: date,
  stage: 'beginner',
  prescriptionVersion: 'v1',
  startedAt: `${date}T08:00:00.000Z`,
  endedAt: `${date}T08:10:00.000Z`,
  localDate: date,
  status: 'complete',
  targetGroups: 2,
  completedGroups: 2,
  targetCycles: 20,
  completedCycles: 20,
  elapsedSeconds: 600,
  metrics: {
    patternMatchRate: score,
    timingAdherence: score,
    releaseRecovery: score,
    qualityScore: score,
    quality: score >= 80 ? 'good' : 'medium',
  },
  assessment: { effort: 'appropriate', relaxation: 'easy', discomfort: false },
  summary: null,
});

describe('progress calculations', () => {
  it('keeps a streak across a month boundary', () => {
    const records = [record('2026-09-30', 70), record('2026-10-01', 72)];
    expect(calculateStreaks(records, '2026-10-01')).toEqual({
      current: 2,
      longest: 2,
      trainingDays: 2,
    });
  });

  it('shows improvement only after six qualifying sessions and five points', () => {
    const records = [60, 62, 64, 75, 77, 79].map((score, index) =>
      record(`2026-10-0${index + 1}`, score),
    );
    const progress = buildProgress(records, '2026-10-06');
    expect(progress.improvements).toHaveLength(3);
    expect(progress.message).toContain('提升');
  });
});
