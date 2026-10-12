import {
  calendarDaySchema,
  progressSnapshotSchema,
  trainingPlanSchema,
  trainingSessionRecordSchema,
  trainingSummarySchema,
  type CompleteTrainingRequest,
  type ProgressSnapshot,
  type StartTrainingRequest,
  type TrainingPlan,
  type TrainingSessionRecord,
  type TrainingStage,
} from '../../contracts/training';
import type { TrainingApi } from '../../application/ports';
import { getDefaultPrescription } from '../../domain/trainingPlan';
import { IndexedDbTrainingQueue } from './IndexedDbTrainingQueue';

const PLAN_CACHE = 'songxian.training-plan.v1';

const fallbackProgress: ProgressSnapshot = {
  currentStreak: 0,
  longestStreak: 0,
  trainingDays: 0,
  unlockedStages: ['beginner'],
  qualifyingDays: { beginner: 0, intermediate: 0 },
  improvements: [],
  message: '连接记录服务后，这里会显示训练表现变化。',
};

export class HttpTrainingApi implements TrainingApi {
  private readonly queue = new IndexedDbTrainingQueue();
  private readonly plans = new Map<string, TrainingPlan>();
  private readonly starts = new Map<string, StartTrainingRequest>();
  private readonly synchronizedIds = new Map<string, string>();
  private flushJob: Promise<void> | null = null;

  constructor(private readonly baseUrl = '') {
    window.addEventListener('online', () => void this.flushPending());
  }

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...init?.headers,
      },
    });
    if (!response.ok) throw new Error(`Training API ${response.status}`);
    return response.json() as Promise<unknown>;
  }

  async getPlan(stage?: TrainingStage): Promise<TrainingPlan> {
    void this.flushPending();
    try {
      const payload = await this.request(`/api/v1/training/plan${stage ? `?stage=${stage}` : ''}`);
      const plan = trainingPlanSchema.parse(payload);
      this.plans.set(plan.prescription.version, plan);
      window.localStorage.setItem(PLAN_CACHE, JSON.stringify(plan));
      return plan;
    } catch {
      const cached = window.localStorage.getItem(PLAN_CACHE);
      if (cached) {
        const parsed = trainingPlanSchema.safeParse(JSON.parse(cached) as unknown);
        if (parsed.success && (!stage || parsed.data.unlockedStages.includes(stage))) {
          const plan =
            stage && parsed.data.selectedStage !== stage
              ? {
                  ...parsed.data,
                  selectedStage: stage,
                  prescription: getDefaultPrescription(stage),
                }
              : parsed.data;
          this.plans.set(plan.prescription.version, plan);
          return plan;
        }
      }
      const selectedStage = stage ?? 'beginner';
      const prescription = getDefaultPrescription(selectedStage);
      const fallback: TrainingPlan = {
        selectedStage,
        unlockedStages: ['beginner'],
        qualifyingDays: { beginner: 0, intermediate: 0 },
        nextUnlock: { stage: 'intermediate', current: 0, required: 14 },
        prescription,
      };
      this.plans.set(prescription.version, fallback);
      return fallback;
    }
  }

  async startSession(input: StartTrainingRequest): Promise<TrainingSessionRecord> {
    try {
      const payload = await this.request('/api/v1/training/sessions', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      const record = trainingSessionRecordSchema.parse(payload);
      this.starts.set(record.id, input);
      return record;
    } catch {
      const localId = `offline-${input.requestId}`;
      this.starts.set(localId, input);
      await this.queue.put({ localId, start: input, complete: null });
      return this.makeActiveRecord(localId, input);
    }
  }

  async setDemoUnlock(stage: 'intermediate' | 'advanced', enabled: boolean): Promise<TrainingPlan> {
    const plan = trainingPlanSchema.parse(
      await this.request('/api/v1/training/demo-unlocks', {
        method: 'POST',
        body: JSON.stringify({ stage, enabled }),
      }),
    );
    this.plans.set(plan.prescription.version, plan);
    window.localStorage.setItem(PLAN_CACHE, JSON.stringify(plan));
    return plan;
  }

  async completeSession(
    id: string,
    input: CompleteTrainingRequest,
  ): Promise<TrainingSessionRecord> {
    if (!id.startsWith('offline-')) {
      try {
        const payload = await this.request(`/api/v1/training/sessions/${id}/complete`, {
          method: 'PUT',
          body: JSON.stringify(input),
        });
        this.starts.delete(id);
        return trainingSessionRecordSchema.parse(payload);
      } catch {
        const start = this.starts.get(id);
        if (!start) throw new Error('Training session could not be queued');
        await this.queue.put({ localId: id, start, complete: input });
        return this.makeCompletedRecord(id, start, input);
      }
    }
    const pending = (await this.queue.list()).find((entry) => entry.localId === id);
    if (!pending) throw new Error('Pending training session was not found');
    await this.queue.put({ ...pending, complete: input });
    return this.makeCompletedRecord(id, pending.start, input);
  }

  private makeActiveRecord(id: string, input: StartTrainingRequest): TrainingSessionRecord {
    const plan = this.plans.get(input.prescriptionVersion);
    const prescription = plan?.prescription ?? getDefaultPrescription(input.stage ?? 'beginner');
    return {
      id,
      requestId: input.requestId,
      moduleId: input.moduleId ?? 'pelvic_floor',
      evaluationMode: input.evaluationMode ?? 'sensor',
      stage: input.stage,
      prescriptionVersion: input.prescriptionVersion,
      startedAt: input.startedAt,
      endedAt: null,
      localDate: this.localDate(input.startedAt),
      status: 'active',
      targetGroups: input.moduleId === 'anal' ? 1 : prescription.targetGroups,
      completedGroups: 0,
      targetCycles:
        input.moduleId === 'anal' ? 5 : prescription.targetGroups * prescription.cyclesPerGroup,
      completedCycles: 0,
      elapsedSeconds: 0,
      metrics: null,
      assessment: null,
      summary: null,
    };
  }

  private makeCompletedRecord(
    id: string,
    start: StartTrainingRequest,
    input: CompleteTrainingRequest,
  ): TrainingSessionRecord {
    return {
      id,
      requestId: start.requestId,
      moduleId: start.moduleId ?? 'pelvic_floor',
      evaluationMode: input.evaluationMode ?? start.evaluationMode ?? 'sensor',
      exceptions: input.exceptions,
      stage: start.stage,
      prescriptionVersion: start.prescriptionVersion,
      startedAt: start.startedAt,
      endedAt: input.endedAt,
      localDate: this.localDate(input.endedAt),
      status: input.status,
      targetGroups: input.targetGroups,
      completedGroups: input.completedGroups,
      targetCycles: input.targetCycles,
      completedCycles: input.completedCycles,
      elapsedSeconds: input.elapsedSeconds,
      metrics: input.metrics,
      assessment: input.assessment,
      summary: null,
    };
  }

  private localDate(iso: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso));
  }

  async getSummary(id: string, retry = false) {
    if (id.startsWith('offline-') || retry) await this.flushPending();
    const serverId = this.synchronizedIds.get(id) ?? id;
    if (serverId.startsWith('offline-'))
      throw new Error('Training record is waiting to synchronize');
    const payload = await this.request(
      `/api/v1/training/sessions/${serverId}/summary${retry ? '?retry=true' : ''}`,
      {
        method: 'POST',
      },
    );
    return trainingSummarySchema.parse(payload);
  }

  async getCalendar(month: string) {
    try {
      const payload = await this.request(`/api/v1/training/records?month=${month}`);
      return calendarDaySchema.array().parse(payload);
    } catch {
      return [];
    }
  }

  async getProgress(): Promise<ProgressSnapshot> {
    try {
      return progressSnapshotSchema.parse(await this.request('/api/v1/training/progress'));
    } catch {
      return fallbackProgress;
    }
  }

  flushPending(): Promise<void> {
    if (this.flushJob) return this.flushJob;
    this.flushJob = this.flushQueue().finally(() => {
      this.flushJob = null;
    });
    return this.flushJob;
  }

  private async flushQueue(): Promise<void> {
    if (!navigator.onLine) return;
    const pending = await this.queue.list().catch(() => []);
    for (const item of pending) {
      if (!item.complete) continue;
      try {
        const started = trainingSessionRecordSchema.parse(
          await this.request('/api/v1/training/sessions', {
            method: 'POST',
            body: JSON.stringify(item.start),
          }),
        );
        await this.request(`/api/v1/training/sessions/${started.id}/complete`, {
          method: 'PUT',
          body: JSON.stringify(item.complete),
        });
        await this.queue.remove(item.localId);
        this.synchronizedIds.set(item.localId, started.id);
        this.starts.delete(item.localId);
        this.starts.delete(started.id);
      } catch {
        return;
      }
    }
  }
}
