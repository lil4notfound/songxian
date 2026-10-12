/** @vitest-environment node */
// 本文件中的设备标识、令牌和采样数据为脱敏样例，仅用于测试。
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CalibrationProfile } from '../../src/contracts/device';
import { DeviceService, type DeviceCalibrationRepository } from '../application/DeviceService';
import { TrainingService } from '../application/TrainingService';
import type { SummaryGenerator } from '../application/ports';
import { SQLiteTrainingRepository } from '../infrastructure/SQLiteTrainingRepository';
import { createServer } from './createServer';

class MemoryCalibrationRepository implements DeviceCalibrationRepository {
  value: CalibrationProfile | null = null;
  find(): CalibrationProfile | null {
    return this.value;
  }
  save(profile: CalibrationProfile): CalibrationProfile {
    this.value = profile;
    return profile;
  }
}

const summaries: SummaryGenerator = {
  configured: () => false,
  generate: ({ fallback }) => Promise.resolve(fallback),
};

const payload = {
  protocol: 1,
  deviceId: 'cushion-route-test',
  bootId: 'boot-1',
  frameSeq: 1,
  layoutVersion: 'layout-cushion2-v1',
  sampleHz: 50,
  channels: ['S_L', 'S_R', 'B_L', 'B_R', 'P_C'],
  samples: [{ seq: 0, tMs: 0, raw: [100, 200, 300, 400, 500] }],
};

describe('device HTTP routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const training = new TrainingService(
      new SQLiteTrainingRepository(':memory:'),
      summaries,
      'Asia/Shanghai',
    );
    app = await createServer(training, {
      device: {
        service: new DeviceService(new MemoryCalibrationRepository()),
        token: 'test-device-token',
      },
    });
  });

  afterEach(async () => app.close());

  it('rejects uploads without the device token', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/v1/device/frames', payload });
    expect(response.statusCode).toBe(401);
  });

  it('accepts valid ordered channels and exposes status', async () => {
    const upload = await app.inject({
      method: 'POST',
      url: '/api/v1/device/frames',
      headers: { 'x-device-token': 'test-device-token' },
      payload,
    });
    expect(upload.statusCode).toBe(202);
    const status = await app.inject({ method: 'GET', url: '/api/v1/device/status' });
    expect(status.json()).toMatchObject({ deviceId: 'cushion-route-test', receivedSamples: 1 });
  });

  it('rejects a swapped channel order', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/device/frames',
      headers: { 'x-device-token': 'test-device-token' },
      payload: { ...payload, channels: ['S_R', 'S_L', 'B_L', 'B_R', 'P_C'] },
    });
    expect(response.statusCode).toBe(400);
  });
});
