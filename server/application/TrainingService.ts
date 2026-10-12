import { createSessionSummary } from '../../src/domain/sessionSummary';
import type {
  CalendarDay,
  CompleteTrainingRequest,
  ProgressSnapshot,
  StartTrainingRequest,
  TrainingPlan,
  TrainingSessionRecord,
  TrainingStage,
  TrainingSummary,
} from '../../src/contracts/training';
import { getAdaptedPrescription, getDefaultPrescription } from '../../src/domain/trainingPlan';
import {
  buildProgress,
  countQualifyingDays,
  dateInTimeZone,
  getUnlockedStages,
} from '../domain/progress';
import type { SummaryGenerator, TrainingRepository } from './ports';

export class StageLockedError extends Error {}
export class SessionNotFoundError extends Error {}
export class PrescriptionChangedError extends Error {}

export class TrainingService {
  private readonly summaryJobs = new Map<string, Promise<TrainingSummary>>();
  constructor(
    private readonly repository: TrainingRepository,
    private readonly summaryGenerator: SummaryGenerator,
    private readonly timeZone = 'Asia/Shanghai',
  ) {}

  getPlan(requestedStage?: TrainingStage): TrainingPlan {
    const records = this.repository
      .listSessions()
      .filter((r) => (r.moduleId ?? 'pelvic_floor') === 'pelvic_floor');
    const naturalStages = getUnlockedStages(records);
    const demonstrationUnlockedStages = this.repository.getDemoUnlocks();
    const unlockedStages = (['beginner', 'intermediate', 'advanced'] as const).filter(
      (stage) => naturalStages.includes(stage) || demonstrationUnlockedStages.includes(stage),
    );
    const selectedStage = requestedStage ?? naturalStages.at(-1) ?? 'beginner';
    if (!unlockedStages.includes(selectedStage)) {
      throw new StageLockedError(`${selectedStage} is locked`);
    }
    const previous = records
      .filter((record) => record.stage === selectedStage && record.status !== 'active')
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    const prescription = previous
      ? getAdaptedPrescription(
          selectedStage,
          previous.prescription,
          previous.metrics?.quality ?? 'unavailable',
          previous.assessment,
        )
      : getDefaultPrescription(selectedStage);
    const qualifyingDays = countQualifyingDays(records);
    const nextUnlock = !naturalStages.includes('intermediate')
      ? { stage: 'intermediate' as const, current: qualifyingDays.beginner, required: 14 }
      : !naturalStages.includes('advanced')
        ? { stage: 'advanced' as const, current: qualifyingDays.intermediate, required: 21 }
        : null;
    return {
      selectedStage,
      unlockedStages,
      demonstrationUnlockedStages,
      qualifyingDays,
      nextUnlock,
      prescription,
    };
  }

  setDemoUnlock(stage: 'intermediate' | 'advanced', enabled: boolean): TrainingPlan {
    this.repository.setDemoUnlock(stage, enabled);
    return this.getPlan(enabled ? stage : 'beginner');
  }

  startSession(input: StartTrainingRequest): TrainingSessionRecord {
    const existing = this.repository.findByRequestId(input.requestId);
    if (existing) return existing;
    if (input.moduleId === 'anal') {
      if (input.stage !== null || input.prescriptionVersion !== 'anal-basic-v1')
        throw new PrescriptionChangedError('Anal course changed');
      return this.repository.createSession({
        id: crypto.randomUUID(),
        requestId: input.requestId,
        moduleId: 'anal',
        evaluationMode: input.evaluationMode,
        stage: null,
        prescription: null,
        prescriptionVersion: input.prescriptionVersion,
        startedAt: input.startedAt,
        localDate: dateInTimeZone(new Date(input.startedAt), this.timeZone),
      });
    }
    const plan = this.getPlan(input.stage ?? 'beginner');
    if (plan.prescription.version !== input.prescriptionVersion) {
      throw new PrescriptionChangedError('Training prescription changed');
    }
    return this.repository.createSession({
      id: crypto.randomUUID(),
      requestId: input.requestId,
      moduleId: 'pelvic_floor',
      evaluationMode: input.evaluationMode,
      stage: input.stage ?? 'beginner',
      prescription: plan.prescription,
      startedAt: input.startedAt,
      localDate: dateInTimeZone(new Date(input.startedAt), this.timeZone),
    });
  }

  completeSession(id: string, input: CompleteTrainingRequest): TrainingSessionRecord {
    const existing = this.repository.findSession(id);
    if (!existing) throw new SessionNotFoundError(id);
    if (existing.status !== 'active') return existing;
    return this.repository.completeSession(
      id,
      input,
      dateInTimeZone(new Date(input.endedAt), this.timeZone),
    );
  }

  async summarize(id: string, retry = false): Promise<TrainingSummary> {
    const record = this.repository.findSession(id);
    if (!record?.assessment || record.status === 'active') throw new SessionNotFoundError(id);
    if (record.summary && (record.summary.source === 'ai' || !retry)) return record.summary;
    const pending = this.summaryJobs.get(id);
    if (pending) return pending;
    const fallback = createSessionSummary({ ...record, assessment: record.assessment });
    const job = this.summaryGenerator
      .generate({ record, fallback })
      .then((summary) => {
        this.repository.saveSummary(record.id, summary);
        return summary;
      })
      .finally(() => this.summaryJobs.delete(id));
    this.summaryJobs.set(id, job);
    return job;
  }

  getCalendar(month: string): CalendarDay[] {
    const records = this.repository
      .listSessions()
      .filter(
        (record) =>
          (record.moduleId ?? 'pelvic_floor') === 'pelvic_floor' &&
          record.localDate.startsWith(month) &&
          record.status !== 'active',
      );
    const byDate = new Map<string, typeof records>();
    for (const record of records) {
      byDate.set(record.localDate, [...(byDate.get(record.localDate) ?? []), record]);
    }
    return [...byDate.entries()]
      .map(([date, entries]) => {
        const complete = entries.some((entry) => entry.status === 'complete');
        const best = [...entries].sort((a, b) => b.completedGroups - a.completedGroups)[0];
        return {
          date,
          status: complete ? ('complete' as const) : ('partial' as const),
          completedGroups: best?.completedGroups ?? 0,
          targetGroups: best?.targetGroups ?? 0,
          sessionCount: entries.length,
          quality: best?.metrics?.quality ?? null,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  getProgress(): ProgressSnapshot {
    return buildProgress(
      this.repository
        .listSessions()
        .filter((r) => (r.moduleId ?? 'pelvic_floor') === 'pelvic_floor'),
      dateInTimeZone(new Date(), this.timeZone),
    );
  }

  health(): { database: 'ok'; llm: 'configured' | 'template' } {
    this.repository.listSessions();
    return { database: 'ok', llm: this.summaryGenerator.configured() ? 'configured' : 'template' };
  }
}
