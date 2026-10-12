import { describe, expect, it } from 'vitest';
import { advanceGuard, createGuard, deriveTrainingIssue } from './trainingGuard';
import { makeProfile, rawMap } from '../test/deviceFixtures';
import type { DeviceTelemetry } from '../contracts/device';
const telemetry: DeviceTelemetry = {
  type: 'telemetry',
  deviceId: 'device-1',
  layoutVersion: 'layout-1',
  bootId: 'boot',
  receivedAt: 1,
  raw: rawMap([1000, 1000, 700, 700, 0]),
  filteredRaw: rawMap([1000, 1000, 700, 700, 0]),
  saturatedChannels: [],
  snapshot: {
    sequence: 1,
    capturedAt: 1,
    connected: true,
    stable: true,
    calibrated: true,
    gluteLeft: 0.5,
    gluteRight: 0.5,
    thighLeft: 0.5,
    thighRight: 0.5,
    backCenter: 0,
    thresholds: { seatDelta: 0.2, movement: 0.35 },
  },
};
describe('training exception guard', () => {
  it('confirms posture at 2s and saturation at 1s, ignoring brief adjustments', () => {
    const issue = { reason: 'posture' as const, message: '调整' };
    let g = advanceGuard(createGuard(), issue, 100);
    expect(advanceGuard(g, issue, 2099).issue).toBeNull();
    expect(advanceGuard(g, issue, 2100).issue?.reason).toBe('posture');
    g = advanceGuard(g, null, 900);
    expect(g.issue).toBeNull();
    const saturated = { reason: 'saturated' as const, message: '检查' };
    g = advanceGuard(g, saturated, 1000);
    expect(advanceGuard(g, { ...saturated, message: '检查另一个点位' }, 2000).issue?.reason).toBe(
      'saturated',
    );
  });
  it('requires two healthy seconds and rechecks connection independently of frames', () => {
    let g = advanceGuard(createGuard(), null, 10);
    expect(advanceGuard(g, null, 2009).ready).toBe(false);
    expect(advanceGuard(g, null, 2010).ready).toBe(true);
    const issue = deriveTrainingIssue(telemetry, makeProfile(), 'pelvic_floor', false);
    g = advanceGuard(g, issue, 2500);
    expect(g).toMatchObject({ ready: false, issue: { reason: 'offline' } });
  });
  it('prioritizes contact and saturation; a validated contraction remains healthy', () => {
    const p = makeProfile();
    expect(
      deriveTrainingIssue(
        { ...telemetry, filteredRaw: rawMap([1200, 1190, 700, 700, 0]) },
        p,
        'pelvic_floor',
        true,
      ),
    ).toBeNull();
    expect(
      deriveTrainingIssue(
        { ...telemetry, filteredRaw: rawMap([0, 1000, 700, 700, 0]) },
        p,
        'pelvic_floor',
        true,
      )?.reason,
    ).toBe('poor_contact');
    expect(
      deriveTrainingIssue({ ...telemetry, saturatedChannels: ['P_C'] }, p, 'anal', true)?.message,
    ).toContain('背部中央');
    expect(deriveTrainingIssue(telemetry, null, 'anal', true)).toBeNull();
  });
});
