import { vi } from 'vitest';
import type { WellnessApplication } from '../application/WellnessApplication';
import type { DeviceSnapshot } from '../domain/posture';
import type { CalibrationProfile, DeviceTelemetry } from '../contracts/device';
import { makeProfile, rawMap } from './deviceFixtures';
import { BrowserSessionIdGenerator } from '../infrastructure/identity/BrowserSessionIdGenerator';
import { getDefaultPrescription } from '../domain/trainingPlan';
export const makeTestApplication = (calibrated = true, enabled = true) => {
  const snapshot: DeviceSnapshot = {
    sequence: 1,
    capturedAt: 1,
    connected: true,
    stable: true,
    calibrated,
    gluteLeft: 0.5,
    gluteRight: 0.5,
    thighLeft: 0.5,
    thighRight: 0.5,
    backCenter: 0,
    postureState: 'balanced',
    thresholds: { seatDelta: 0.2, movement: 0.35 },
  };
  let latest: DeviceTelemetry = {
    type: 'telemetry',
    deviceId: 'device-1',
    layoutVersion: 'layout-1',
    bootId: 'boot',
    receivedAt: 1,
    raw: rawMap([1000, 1000, 700, 700, 0]),
    filteredRaw: rawMap([1000, 1000, 700, 700, 0]),
    saturatedChannels: [],
    snapshot,
  };
  const telemetryListeners = new Set<(t: DeviceTelemetry) => void>();
  const snapshotListeners = new Set<(s: DeviceSnapshot) => void>();
  const audio = {
    speak: vi.fn(() => Promise.resolve()),
    stop: vi.fn(),
    getSettings: () => ({ enabled, volume: 1 }),
    setEnabled: vi.fn(),
    setVolume: vi.fn(),
  };
  const fake = {
    createRequestId: () => new BrowserSessionIdGenerator().create(),
    audio,
    device: {
      subscribe: (listener: (s: DeviceSnapshot) => void) => {
        snapshotListeners.add(listener);
        listener(latest.snapshot);
        return () => snapshotListeners.delete(listener);
      },
      subscribeTelemetry: (listener: (t: DeviceTelemetry) => void) => {
        telemetryListeners.add(listener);
        listener(latest);
        return () => telemetryListeners.delete(listener);
      },
      getLatestTelemetry: () => latest,
      getCalibration: () => Promise.resolve(calibrated ? makeProfile() : null),
      saveCalibration: vi.fn((profile: CalibrationProfile) => Promise.resolve(profile)),
      getStatus: () =>
        Promise.resolve({
          state: 'ready',
          deviceId: 'device-1',
          layoutVersion: 'layout-1',
          calibrated,
          dropRate: 0,
        }),
    },
    training: {
      startSession: vi.fn(() => Promise.resolve({ id: 'record-1' })),
      getPlan: vi.fn(() =>
        Promise.resolve({
          selectedStage: 'beginner',
          unlockedStages: ['beginner'],
          qualifyingDays: { beginner: 0, intermediate: 0 },
          nextUnlock: { stage: 'intermediate', current: 0, required: 14 },
          prescription: getDefaultPrescription('beginner'),
        }),
      ),
    },
    updateAudio: vi.fn(),
  };
  const emit = (overrides: Partial<DeviceTelemetry> = {}) => {
    latest = { ...latest, ...overrides };
    telemetryListeners.forEach((l) => l(latest));
    snapshotListeners.forEach((l) => l(latest.snapshot));
  };
  return {
    application: fake as unknown as WellnessApplication,
    training: fake.training,
    audio,
    emit,
    getLatest: () => latest,
  };
};
