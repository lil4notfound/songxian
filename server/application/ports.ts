import type {
  CompleteTrainingRequest,
  TrainingPrescription,
  TrainingSessionRecord,
  TrainingStage,
  TrainingSummary,
} from '../../src/contracts/training';

export type StoredTrainingSession = TrainingSessionRecord & {
  prescription: TrainingPrescription | null;
};

export interface TrainingRepository {
  getDemoUnlocks(): TrainingStage[];
  setDemoUnlock(stage: 'intermediate' | 'advanced', enabled: boolean): void;
  listSessions(): StoredTrainingSession[];
  findSession(id: string): StoredTrainingSession | null;
  findByRequestId(requestId: string): StoredTrainingSession | null;
  createSession(input: {
    id: string;
    requestId: string;
    moduleId?: 'pelvic_floor' | 'anal';
    evaluationMode?: 'sensor' | 'timer';
    stage: TrainingStage | null;
    prescription: TrainingPrescription | null;
    prescriptionVersion?: string;
    startedAt: string;
    localDate: string;
  }): StoredTrainingSession;
  completeSession(
    id: string,
    input: CompleteTrainingRequest,
    localDate: string,
  ): StoredTrainingSession;
  saveSummary(sessionId: string, summary: TrainingSummary): void;
}

export interface SummaryGenerator {
  generate(input: {
    record: StoredTrainingSession;
    fallback: TrainingSummary;
  }): Promise<TrainingSummary>;
  configured(): boolean;
}
