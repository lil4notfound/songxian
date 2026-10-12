import type { ModuleId } from '../domain/modules';
import type { DeviceSnapshot } from '../domain/posture';
import type { CalibrationProfile, DeviceStatus, DeviceTelemetry } from '../contracts/device';
import type {
  CalendarDay,
  CompleteTrainingRequest,
  ProgressSnapshot,
  StartTrainingRequest,
  TrainingPlan,
  TrainingSessionRecord,
  TrainingStage,
  TrainingSummary,
} from '../contracts/training';

export type Unsubscribe = () => void;

export interface DeviceGateway {
  connect(): Promise<void>;
  disconnect(): void;
  subscribe(listener: (snapshot: DeviceSnapshot) => void): Unsubscribe;
  subscribeTelemetry(listener: (telemetry: DeviceTelemetry) => void): Unsubscribe;
  getLatestTelemetry(): DeviceTelemetry | null;
  getStatus(): Promise<DeviceStatus>;
  getCalibration(): Promise<CalibrationProfile | null>;
  saveCalibration(profile: CalibrationProfile): Promise<CalibrationProfile>;
  getConnectionState(): 'connecting' | 'ready' | 'offline';
}

export interface AudioGuide {
  unlock?(): void;
  isUnlocked?(): boolean;
  speak(text: string): Promise<void>;
  stop(): void;
  setEnabled(enabled: boolean): void;
  setVolume(volume: number): void;
  getSettings(): AudioSettings;
}

export type AudioSettings = {
  enabled: boolean;
  volume: number;
};

export interface PreferenceRepository {
  loadAudioSettings(): AudioSettings;
  saveAudioSettings(settings: AudioSettings): void;
  hasPostureReference(): boolean;
  savePostureReference(): void;
  clearPostureReference(): void;
}

export interface Logger {
  info(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

export interface SessionIdGenerator {
  create(): string;
}

export type ActiveModuleSession = {
  id: string;
  moduleId: ModuleId;
  startedAt: number;
};

export interface TrainingApi {
  getPlan(stage?: TrainingStage): Promise<TrainingPlan>;
  setDemoUnlock(stage: 'intermediate' | 'advanced', enabled: boolean): Promise<TrainingPlan>;
  startSession(input: StartTrainingRequest): Promise<TrainingSessionRecord>;
  completeSession(id: string, input: CompleteTrainingRequest): Promise<TrainingSessionRecord>;
  getSummary(id: string, retry?: boolean): Promise<TrainingSummary>;
  getCalendar(month: string): Promise<CalendarDay[]>;
  getProgress(): Promise<ProgressSnapshot>;
  flushPending(): Promise<void>;
}
