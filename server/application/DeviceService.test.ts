/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import type { CalibrationProfile, DeviceFrameBatch } from '../../src/contracts/device';
import { DeviceService, type DeviceCalibrationRepository } from './DeviceService';

class MemoryCalibrationRepository implements DeviceCalibrationRepository {
  value: CalibrationProfile | null = null;
  find(deviceId: string, layoutVersion: string): CalibrationProfile | null {
    return this.value?.deviceId === deviceId && this.value.layoutVersion === layoutVersion
      ? this.value
      : null;
  }
  save(profile: CalibrationProfile): CalibrationProfile {
    this.value = profile;
    return profile;
  }
}

const batch = (frameSeq = 1, sampleSeq = 0): DeviceFrameBatch => ({
  protocol: 1,
  deviceId: 'cushion-1',
  bootId: 'boot-1',
  frameSeq,
  layoutVersion: 'layout-cushion2-v1',
  sampleHz: 50,
  channels: ['S_L', 'S_R', 'B_L', 'B_R', 'P_C'],
  samples: [{ seq: sampleSeq, tMs: sampleSeq * 20, raw: [100, 200, 300, 400, 500] }],
});

describe('DeviceService', () => {
  it('filters valid frames, reports status, and ignores duplicate batches', () => {
    const service = new DeviceService(new MemoryCalibrationRepository());
    expect(service.ingest(batch())).toEqual({ accepted: 1, duplicate: false });
    expect(service.ingest(batch())).toEqual({ accepted: 0, duplicate: true });
    expect(service.latest()?.raw.P_C).toBe(500);
    expect(service.status().receivedSamples).toBe(1);
  });

  it('counts sequence gaps and marks stale input offline', () => {
    const service = new DeviceService(new MemoryCalibrationRepository());
    service.ingest(batch(1, 0));
    service.ingest(batch(2, 3));
    expect(service.status().droppedSamples).toBe(2);
    expect(service.status(Date.now() + 3000).state).toBe('offline');
  });
});
