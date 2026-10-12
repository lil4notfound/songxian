import type { DeviceGateway, Unsubscribe } from '../../application/ports';
import type { DeviceSnapshot } from '../../domain/posture';
import type { CalibrationProfile, DeviceStatus, DeviceTelemetry } from '../../contracts/device';

const makeSnapshot = (sequence: number): DeviceSnapshot => {
  const chapter = Math.floor(sequence / 20) % 4;
  const sway = Math.sin(sequence / 6) * 0.035;
  const base: DeviceSnapshot = {
    sequence,
    capturedAt: Date.now(),
    connected: true,
    stable: sequence % 20 > 2,
    calibrated: false,
    gluteLeft: 0.58 + sway,
    gluteRight: 0.57 - sway,
    thighLeft: 0.56,
    thighRight: 0.54,
    backCenter: 0.48 + Math.sin(sequence / 4) * 0.04,
    thresholds: { seatDelta: 0.2, movement: 0.35 },
  };

  if (chapter === 1) return { ...base, gluteLeft: 0.78, gluteRight: 0.44 };
  if (chapter === 2) return { ...base, gluteLeft: 0.43, gluteRight: 0.77 };
  if (chapter === 3) return { ...base, thighLeft: 0.29, thighRight: 0.31 };
  return base;
};

export class MockDeviceGateway implements DeviceGateway {
  private listeners = new Set<(snapshot: DeviceSnapshot) => void>();
  private telemetryListeners = new Set<(telemetry: DeviceTelemetry) => void>();
  private timer: number | undefined;
  private sequence = 0;
  private state: 'connecting' | 'ready' | 'offline' = 'offline';
  private calibration: CalibrationProfile | null = null;
  private latest: DeviceTelemetry | null = null;

  async connect(): Promise<void> {
    this.state = 'connecting';
    await Promise.resolve();
    this.state = 'ready';
    if (this.timer === undefined) {
      this.timer = window.setInterval(() => {
        const snapshot = makeSnapshot(this.sequence++);
        this.listeners.forEach((listener) => listener(snapshot));
        const raw = {
          S_L: Math.round(snapshot.gluteLeft * 3000),
          S_R: Math.round(snapshot.gluteRight * 3000),
          B_L: Math.round(snapshot.thighLeft * 2500),
          B_R: Math.round(snapshot.thighRight * 2500),
          P_C: Math.round(snapshot.backCenter * 2200),
        };
        this.latest = {
          type: 'telemetry',
          deviceId: 'mock-cushion',
          bootId: 'mock-boot',
          layoutVersion: 'layout-cushion2-v1',
          receivedAt: Date.now(),
          raw,
          filteredRaw: raw,
          saturatedChannels: [],
          snapshot: { ...snapshot, calibrated: Boolean(this.calibration) },
        };
        this.telemetryListeners.forEach((listener) => listener(this.latest!));
      }, 500);
    }
  }

  disconnect(): void {
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
    this.state = 'offline';
    this.listeners.clear();
    this.telemetryListeners.clear();
  }

  subscribe(listener: (snapshot: DeviceSnapshot) => void): Unsubscribe {
    this.listeners.add(listener);
    listener(makeSnapshot(this.sequence));
    return () => this.listeners.delete(listener);
  }

  subscribeTelemetry(listener: (telemetry: DeviceTelemetry) => void): Unsubscribe {
    this.telemetryListeners.add(listener);
    if (this.latest) listener(this.latest);
    return () => this.telemetryListeners.delete(listener);
  }

  getLatestTelemetry(): DeviceTelemetry | null {
    return this.latest;
  }

  getStatus(): Promise<DeviceStatus> {
    return Promise.resolve({
      state: this.state === 'ready' ? 'ready' : this.state,
      deviceId: 'mock-cushion',
      layoutVersion: 'layout-cushion2-v1',
      lastSeenAt: this.latest?.receivedAt ?? Date.now(),
      lastSequence: this.sequence,
      receivedSamples: this.sequence,
      droppedSamples: 0,
      dropRate: 0,
      saturatedChannels: [],
      calibrated: Boolean(this.calibration),
    });
  }

  getCalibration(): Promise<CalibrationProfile | null> {
    return Promise.resolve(this.calibration);
  }

  saveCalibration(profile: CalibrationProfile): Promise<CalibrationProfile> {
    this.calibration = profile;
    return Promise.resolve(profile);
  }

  getConnectionState(): 'connecting' | 'ready' | 'offline' {
    return this.state;
  }
}
