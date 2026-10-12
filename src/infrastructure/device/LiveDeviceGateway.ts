import type { DeviceGateway, Unsubscribe } from '../../application/ports';
import {
  calibrationProfileSchema,
  deviceStatusSchema,
  deviceTelemetrySchema,
  type CalibrationProfile,
  type DeviceStatus,
  type DeviceTelemetry,
} from '../../contracts/device';
import type { DeviceSnapshot } from '../../domain/posture';

export class LiveDeviceGateway implements DeviceGateway {
  private snapshotListeners = new Set<(snapshot: DeviceSnapshot) => void>();
  private telemetryListeners = new Set<(telemetry: DeviceTelemetry) => void>();
  private source: EventSource | null = null;
  private staleTimer: number | undefined;
  private latest: DeviceTelemetry | null = null;
  private lastReceived = Number.NEGATIVE_INFINITY;
  private state: 'connecting' | 'ready' | 'offline' = 'offline';

  connect(): Promise<void> {
    if (this.source) return Promise.resolve();
    this.state = 'connecting';
    this.source = new EventSource('/api/v1/device/stream');
    this.source.addEventListener('telemetry', (event) => {
      const parsed = deviceTelemetrySchema.safeParse(
        JSON.parse((event as MessageEvent<string>).data) as unknown,
      );
      if (!parsed.success) return;
      this.latest = parsed.data;
      this.lastReceived = performance.now();
      this.state = 'ready';
      this.snapshotListeners.forEach((listener) => listener(parsed.data.snapshot));
      this.telemetryListeners.forEach((listener) => listener(parsed.data));
    });
    this.source.onerror = () => {
      if (!this.latest || performance.now() - this.lastReceived > 2000) this.state = 'offline';
    };
    this.staleTimer = window.setInterval(() => this.checkStale(), 500);
    return Promise.resolve();
  }

  private checkStale() {
    if (!this.latest || performance.now() - this.lastReceived <= 2000) return;
    this.state = 'offline';
    const offline = { ...this.latest.snapshot, connected: false, stable: false };
    this.latest = { ...this.latest, snapshot: offline };
    this.snapshotListeners.forEach((listener) => listener(offline));
  }

  disconnect(): void {
    this.source?.close();
    this.source = null;
    if (this.staleTimer !== undefined) window.clearInterval(this.staleTimer);
    this.staleTimer = undefined;
    this.state = 'offline';
  }

  subscribe(listener: (snapshot: DeviceSnapshot) => void): Unsubscribe {
    this.snapshotListeners.add(listener);
    if (this.latest) listener(this.latest.snapshot);
    return () => this.snapshotListeners.delete(listener);
  }

  subscribeTelemetry(listener: (telemetry: DeviceTelemetry) => void): Unsubscribe {
    this.telemetryListeners.add(listener);
    if (this.latest) listener(this.latest);
    return () => this.telemetryListeners.delete(listener);
  }

  getLatestTelemetry(): DeviceTelemetry | null {
    return this.latest;
  }

  async getStatus(): Promise<DeviceStatus> {
    const response = await fetch('/api/v1/device/status');
    if (!response.ok) throw new Error('DEVICE_STATUS_FAILED');
    return deviceStatusSchema.parse(await response.json());
  }

  async getCalibration(): Promise<CalibrationProfile | null> {
    const response = await fetch('/api/v1/device/calibration');
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('DEVICE_CALIBRATION_FAILED');
    return calibrationProfileSchema.parse(await response.json());
  }

  async saveCalibration(profile: CalibrationProfile): Promise<CalibrationProfile> {
    const response = await fetch('/api/v1/device/calibration', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(profile),
    });
    if (!response.ok) throw new Error('DEVICE_CALIBRATION_SAVE_FAILED');
    return calibrationProfileSchema.parse(await response.json());
  }

  getConnectionState(): 'connecting' | 'ready' | 'offline' {
    return this.state;
  }
}
