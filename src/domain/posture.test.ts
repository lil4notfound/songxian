import { describe, expect, it } from 'vitest';
import { derivePostureAdvice, type DeviceSnapshot } from './posture';
const snapshot: DeviceSnapshot = {
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
  postureState: 'balanced',
};
describe('posture advice', () => {
  it('does not require back contact', () =>
    expect(derivePostureAdvice(snapshot).state).toBe('balanced'));
  it('prioritizes connection and contact over pose', () => {
    expect(
      derivePostureAdvice({ ...snapshot, connected: false, postureState: 'crossed_left' }).state,
    ).toBe('unknown');
    expect(
      derivePostureAdvice({
        ...snapshot,
        contactIssue: 'poor_contact',
        postureState: 'crossed_right',
      }).state,
    ).toBe('poor_contact');
  });
  it('requires a new profile and identifies a known crossed-leg pattern', () => {
    expect(derivePostureAdvice({ ...snapshot, calibrated: false }).state).toBe('uncalibrated');
    expect(derivePostureAdvice({ ...snapshot, postureState: 'crossed_left' }).message).toContain(
      '放下左腿',
    );
  });
});
