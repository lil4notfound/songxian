import type {
  CalibrationProfile,
  ChannelMap,
  DeviceChannel,
  DeviceFrameBatch,
  DeviceStatus,
  DeviceTelemetry,
  RawChannelValues,
} from '../../src/contracts/device';
import { DEVICE_CHANNELS } from '../../src/contracts/device';
import { classifyPosture, contactProblem } from '../../src/domain/posture';

export interface DeviceCalibrationRepository {
  find(deviceId: string, layoutVersion: string): CalibrationProfile | null;
  save(profile: CalibrationProfile): CalibrationProfile;
  hasLegacy?(deviceId: string, layoutVersion: string): boolean;
}

type TelemetryListener = (telemetry: DeviceTelemetry) => void;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const toChannelMap = (values: readonly number[]): ChannelMap =>
  Object.fromEntries(
    DEVICE_CHANNELS.map((channel, index) => [channel, values[index] ?? 0]),
  ) as ChannelMap;

const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
};

export class DeviceService {
  private listeners = new Set<TelemetryListener>();
  private windows: number[][] = DEVICE_CHANNELS.map(() => []);
  private ema: number[] = DEVICE_CHANNELS.map(() => 0);
  private initialized = false;
  private lastTelemetry: DeviceTelemetry | null = null;
  private lastBootId: string | null = null;
  private lastFrameSeq = -1;
  private lastSampleSeq = -1;
  private receivedSamples = 0;
  private droppedSamples = 0;
  private profile: CalibrationProfile | null = null;
  private previousNormalized: number[] | null = null;

  constructor(private readonly calibrations: DeviceCalibrationRepository) {}

  subscribe(listener: TelemetryListener): () => void {
    this.listeners.add(listener);
    if (this.lastTelemetry) listener(this.lastTelemetry);
    return () => this.listeners.delete(listener);
  }

  latest(): DeviceTelemetry | null {
    return this.lastTelemetry;
  }

  ingest(batch: DeviceFrameBatch): { accepted: number; duplicate: boolean } {
    if (this.lastBootId === batch.bootId && batch.frameSeq <= this.lastFrameSeq) {
      return { accepted: 0, duplicate: true };
    }
    if (this.lastBootId !== batch.bootId) this.resetStream(batch.bootId);
    this.lastFrameSeq = batch.frameSeq;
    this.profile = this.calibrations.find(batch.deviceId, batch.layoutVersion);

    let accepted = 0;
    for (const sample of batch.samples) {
      if (sample.seq <= this.lastSampleSeq) continue;
      if (this.lastSampleSeq >= 0 && sample.seq > this.lastSampleSeq + 1) {
        this.droppedSamples += sample.seq - this.lastSampleSeq - 1;
      }
      this.lastSampleSeq = sample.seq;
      this.receivedSamples += 1;
      accepted += 1;
      this.processSample(batch, sample.raw);
    }
    return { accepted, duplicate: false };
  }

  private resetStream(bootId: string) {
    this.lastBootId = bootId;
    this.lastFrameSeq = -1;
    this.lastSampleSeq = -1;
    this.windows = DEVICE_CHANNELS.map(() => []);
    this.ema = DEVICE_CHANNELS.map(() => 0);
    this.initialized = false;
    this.previousNormalized = null;
  }

  private processSample(batch: DeviceFrameBatch, raw: RawChannelValues) {
    const filtered = raw.map((value, index) => {
      const window = this.windows[index]!;
      window.push(value);
      if (window.length > 5) window.shift();
      const midpoint = median(window);
      if (!this.initialized) this.ema[index] = midpoint;
      else this.ema[index] = this.ema[index]! * 0.75 + midpoint * 0.25;
      return this.ema[index];
    });
    this.initialized = true;

    const normalized = filtered.map((value, index) => {
      const channel = DEVICE_CHANNELS[index]!;
      if (!this.profile) return clamp01(value / 4095);
      const baseline = this.profile.baseline[channel];
      const scale = this.profile.scale[channel];
      return clamp01(0.5 + (value - baseline) / (2 * scale));
    });
    const movement = this.previousNormalized
      ? Math.max(
          ...normalized.map((value, index) => Math.abs(value - this.previousNormalized![index]!)),
        )
      : 1;
    this.previousNormalized = normalized;
    const movementThreshold = this.profile?.posture.movementThreshold ?? 0.12;
    const saturatedChannels = DEVICE_CHANNELS.filter((_, index) => raw[index]! >= 4000);
    const receivedAt = Date.now();
    const telemetry: DeviceTelemetry = {
      type: 'telemetry',
      deviceId: batch.deviceId,
      bootId: batch.bootId,
      layoutVersion: batch.layoutVersion,
      receivedAt,
      raw: toChannelMap(raw),
      filteredRaw: toChannelMap(filtered),
      saturatedChannels,
      snapshot: {
        sequence: this.lastSampleSeq,
        capturedAt: receivedAt,
        connected: true,
        stable: this.receivedSamples > 8 && movement <= movementThreshold,
        calibrated: Boolean(this.profile),
        postureState: this.profile
          ? classifyPosture(toChannelMap(filtered), this.profile)
          : undefined,
        contactIssue: saturatedChannels.length
          ? 'saturated'
          : this.profile
            ? contactProblem(toChannelMap(filtered), this.profile)
            : null,
        issueChannels: saturatedChannels,
        gluteLeft: normalized[0]!,
        gluteRight: normalized[1]!,
        thighLeft: normalized[2]!,
        thighRight: normalized[3]!,
        backCenter: normalized[4]!,
        thresholds: {
          seatDelta: this.profile?.posture.seatDeltaThreshold ?? 0.2,

          movement: movementThreshold,
        },
      },
    };
    this.lastTelemetry = telemetry;
    this.listeners.forEach((listener) => listener(telemetry));
  }

  status(now = Date.now()): DeviceStatus {
    const age = this.lastTelemetry ? now - this.lastTelemetry.receivedAt : Number.POSITIVE_INFINITY;
    const state = !this.lastTelemetry
      ? 'connecting'
      : age > 2000
        ? 'offline'
        : age > 1000 || !this.lastTelemetry.snapshot.stable
          ? 'unstable'
          : 'ready';
    const total = this.receivedSamples + this.droppedSamples;
    return {
      state,
      deviceId: this.lastTelemetry?.deviceId ?? null,
      layoutVersion: this.lastTelemetry?.layoutVersion ?? null,
      lastSeenAt: this.lastTelemetry?.receivedAt ?? null,
      lastSequence: this.lastSampleSeq >= 0 ? this.lastSampleSeq : null,
      receivedSamples: this.receivedSamples,
      droppedSamples: this.droppedSamples,
      dropRate: total > 0 ? this.droppedSamples / total : 0,
      saturatedChannels: this.lastTelemetry?.saturatedChannels ?? [],
      calibrated: Boolean(this.profile),
      needsRecalibration:
        !this.profile &&
        Boolean(
          this.lastTelemetry &&
            this.calibrations.hasLegacy?.(
              this.lastTelemetry.deviceId,
              this.lastTelemetry.layoutVersion,
            ),
        ),
    };
  }

  getCalibration(deviceId?: string, layoutVersion?: string): CalibrationProfile | null {
    const targetDevice = deviceId ?? this.lastTelemetry?.deviceId;
    const targetLayout = layoutVersion ?? this.lastTelemetry?.layoutVersion;
    if (!targetDevice || !targetLayout) return null;
    return this.calibrations.find(targetDevice, targetLayout);
  }

  saveCalibration(profile: CalibrationProfile): CalibrationProfile {
    const saved = this.calibrations.save(profile);
    if (
      profile.deviceId === this.lastTelemetry?.deviceId &&
      profile.layoutVersion === this.lastTelemetry.layoutVersion
    ) {
      this.profile = saved;
    }
    return saved;
  }

  channelHealth(): Record<DeviceChannel, 'ok' | 'saturated'> {
    return Object.fromEntries(
      DEVICE_CHANNELS.map((channel) => [
        channel,
        this.lastTelemetry?.saturatedChannels.includes(channel) ? 'saturated' : 'ok',
      ]),
    ) as Record<DeviceChannel, 'ok' | 'saturated'>;
  }
}
