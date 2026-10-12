/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import type { SummaryGenerator } from './ports';
import { TrainingService } from './TrainingService';
import { SQLiteTrainingRepository } from '../infrastructure/SQLiteTrainingRepository';
import { calculateSensorMetrics } from '../../src/domain/trainingPlan';

const templateGenerator: SummaryGenerator = {
  configured: () => false,
  generate: ({ fallback }) => Promise.resolve(fallback),
};

const assessment = { effort: 'easy', relaxation: 'easy', discomfort: false } as const;
const metrics = calculateSensorMetrics(75, 100, 85);

describe('TrainingService', () => {
  it('persists reversible demonstration unlocks without adding qualifying days or changing the default stage', () => {
    const repository = new SQLiteTrainingRepository(':memory:');
    const service = new TrainingService(repository, templateGenerator);
    expect(() => service.getPlan('advanced')).toThrow('locked');
    const intermediate = service.setDemoUnlock('intermediate', true);
    expect(intermediate.selectedStage).toBe('intermediate');
    const advanced = service.setDemoUnlock('advanced', true);
    expect(advanced).toMatchObject({
      selectedStage: 'advanced',
      unlockedStages: ['beginner', 'intermediate', 'advanced'],
      demonstrationUnlockedStages: ['intermediate', 'advanced'],
      qualifyingDays: { beginner: 0, intermediate: 0 },
    });
    expect(service.getPlan().selectedStage).toBe('beginner');
    const recreated = new TrainingService(repository, templateGenerator);
    const record = recreated.startSession({
      requestId: 'demo-advanced',
      moduleId: 'pelvic_floor',
      evaluationMode: 'timer',
      stage: 'advanced',
      prescriptionVersion: advanced.prescription.version,
      startedAt: '2026-10-12T08:00:00.000Z',
    });
    expect(record.stage).toBe('advanced');
    expect(recreated.getProgress().trainingDays).toBe(0);
    recreated.setDemoUnlock('advanced', false);
    expect(() => recreated.getPlan('advanced')).toThrow('locked');
    expect(recreated.getPlan('intermediate').selectedStage).toBe('intermediate');
    repository.close();
  });
  it('records anal sessions and exceptions without adding to pelvic calendar or progress', async () => {
    const service = new TrainingService(
      new SQLiteTrainingRepository(':memory:'),
      templateGenerator,
    );
    const record = service.startSession({
      requestId: 'anal-1',
      moduleId: 'anal',
      evaluationMode: 'timer',
      stage: null,
      prescriptionVersion: 'anal-basic-v1',
      startedAt: '2026-10-01T08:00:00.000Z',
    });
    service.completeSession(record.id, {
      requestId: 'done',
      endedAt: '2026-10-01T08:02:00.000Z',
      status: 'complete',
      targetGroups: 1,
      completedGroups: 1,
      targetCycles: 5,
      completedCycles: 5,
      elapsedSeconds: 90,
      metrics: null,
      assessment,
      evaluationMode: 'timer',
      exceptions: { redoCount: 1, events: [{ reason: 'posture', count: 1, seconds: 5 }] },
    });
    const summary = await service.summarize(record.id);
    expect(summary.body).toContain('5 轮提肛');
    expect(summary.body).toContain('暂停 1 次');
    expect(service.getCalendar('2026-10')).toEqual([]);
    expect(service.getProgress().trainingDays).toBe(0);
    expect(service.getPlan().qualifyingDays.beginner).toBe(0);
  });
  it('retries a cached template but reuses successful AI summaries', async () => {
    let calls = 0;
    const generator: SummaryGenerator = {
      configured: () => true,
      generate: ({ fallback }) => {
        calls++;
        return Promise.resolve(calls === 1 ? fallback : { ...fallback, source: 'ai' });
      },
    };
    const service = new TrainingService(new SQLiteTrainingRepository(':memory:'), generator);
    const record = service.startSession({
      requestId: 'a',
      moduleId: 'anal',
      stage: null,
      prescriptionVersion: 'anal-basic-v1',
      startedAt: '2026-10-01T08:00:00.000Z',
    });
    service.completeSession(record.id, {
      requestId: 'b',
      endedAt: '2026-10-01T08:02:00.000Z',
      status: 'stopped',
      targetGroups: 1,
      completedGroups: 0,
      targetCycles: 5,
      completedCycles: 2,
      elapsedSeconds: 40,
      metrics: null,
      assessment,
    });
    expect((await service.summarize(record.id)).source).toBe('template');
    expect((await service.summarize(record.id, true)).source).toBe('ai');
    await service.summarize(record.id, true);
    expect(calls).toBe(2);
  });
  it('stores an idempotent session and returns a template summary', async () => {
    const service = new TrainingService(
      new SQLiteTrainingRepository(':memory:'),
      templateGenerator,
    );
    const plan = service.getPlan('beginner');
    const request = {
      requestId: 'request-1',
      stage: 'beginner' as const,
      prescriptionVersion: plan.prescription.version,
      startedAt: '2026-10-01T08:00:00.000Z',
    };
    const first = service.startSession(request);
    const duplicate = service.startSession(request);
    expect(duplicate.id).toBe(first.id);

    service.completeSession(first.id, {
      requestId: 'complete-1',
      endedAt: '2026-10-01T08:10:00.000Z',
      status: 'complete',
      targetGroups: 2,
      completedGroups: 2,
      targetCycles: 20,
      completedCycles: 20,
      elapsedSeconds: 600,
      metrics,
      assessment,
    });
    const summary = await service.summarize(first.id);
    expect(summary.source).toBe('template');
    expect(service.getCalendar('2026-10')).toMatchObject([{ status: 'complete' }]);
  });

  it('unlocks intermediate after fourteen qualifying days', () => {
    const service = new TrainingService(
      new SQLiteTrainingRepository(':memory:'),
      templateGenerator,
    );
    for (let index = 0; index < 14; index += 1) {
      const plan = service.getPlan('beginner');
      const day = String(index + 1).padStart(2, '0');
      const startedAt = `2026-09-${day}T08:00:00.000Z`;
      const session = service.startSession({
        requestId: `start-${index}`,
        stage: 'beginner',
        prescriptionVersion: plan.prescription.version,
        startedAt,
      });
      service.completeSession(session.id, {
        requestId: `complete-${index}`,
        endedAt: `2026-09-${day}T08:10:00.000Z`,
        status: 'complete',
        targetGroups: 2,
        completedGroups: 2,
        targetCycles: 20,
        completedCycles: 20,
        elapsedSeconds: 600,
        metrics,
        assessment,
      });
    }
    expect(service.getPlan().unlockedStages).toEqual(['beginner', 'intermediate']);
  });
});
