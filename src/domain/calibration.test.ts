import { describe, expect, it } from 'vitest';
import {
  createCalibrationProfile,
  evaluateTrainingSignal,
  updateExerciseCalibration,
} from './calibration';
import { classifyPosture, contactProblem } from './posture';
import { makeSamples, rawMap, repeated } from '../test/deviceFixtures';
describe('new five-point calibration', () => {
  it('separates settling between seated phases from noise and uses the demonstrated relaxed baseline', () => {
    const samples = makeSamples();
    samples.seated = repeated([1300, 1300, 700, 700, 0]);
    for (const trials of [samples.pelvic_floor, samples.anal])
      for (const trial of trials) {
        for (const values of [...trial.contract, ...trial.release]) {
          values[0] += 100;
          values[1] += 100;
        }
      }
    const p = createCalibrationProfile('d', 'l', samples);
    expect(p.noise.S_L).toBe(0);
    expect(p.exercises.pelvic_floor).toMatchObject({
      relaxedBaseline: [1100, 1100],
      evaluationEnabled: true,
    });
    expect(p.exercises.anal?.evaluationEnabled).toBe(true);
    expect(evaluateTrainingSignal('pelvic_floor', rawMap([1100, 1100, 700, 700, 0]), p, true)).toBe(
      'released',
    );
    expect(classifyPosture(rawMap([1300, 1290, 700, 700, 0]), p, 'pelvic_floor')).toBe('balanced');
  });
  it('reports why an action failed and can update just that action without replacing existing references', () => {
    const samples = makeSamples();
    samples.anal = [];
    const p = createCalibrationProfile('d', 'l', samples);
    expect(p.exerciseDiagnostics?.anal?.reason).toBe('insufficient_samples');
    const updated = updateExerciseCalibration(p, 'anal', samples.rest, makeSamples().anal);
    expect(updated.exercises.anal?.evaluationEnabled).toBe(true);
    expect(updated.exercises.pelvic_floor).toEqual(p.exercises.pelvic_floor);
    expect(updated.posture).toEqual(p.posture);
    expect(p.exercises.anal).toBeNull();
  });
  it('learns independent signed glute references with two independent validations', () => {
    const p = createCalibrationProfile('device-1', 'layout-1', makeSamples());
    expect(p).toMatchObject({ version: 2, placementVersion: 'glute-thigh-back-v2' });
    expect(p.exercises.pelvic_floor).toMatchObject({
      delta: [200, 190],
      validationMatches: 2,
      evaluationEnabled: true,
    });
    expect(p.exercises.anal).toMatchObject({
      delta: [-200, -180],
      validationMatches: 2,
      evaluationEnabled: true,
    });
    expect(
      evaluateTrainingSignal('pelvic_floor', rawMap([1200, 1190, 700, 700, 0]), p, false),
    ).toBe('matched');
    expect(evaluateTrainingSignal('anal', rawMap([800, 820, 700, 700, 0]), p, false)).toBe(
      'matched',
    );
    expect(evaluateTrainingSignal('pelvic_floor', rawMap([1000, 1000, 700, 700, 0]), p, true)).toBe(
      'released',
    );
  });
  it('accepts natural non-contact at the back and ignores validated contractions in posture', () => {
    const p = createCalibrationProfile('device-1', 'layout-1', makeSamples());
    expect(classifyPosture(rawMap([1200, 1190, 700, 700, 0]), p, 'pelvic_floor')).toBe('balanced');
    expect(contactProblem(rawMap([1000, 1000, 700, 700, 0]), p)).toBeNull();
    expect(contactProblem(rawMap([0, 0, 700, 700, 0]), p)).toBe('unoccupied');
    expect(contactProblem(rawMap([0, 1000, 700, 700, 0]), p)).toBe('poor_contact');
  });
  it('distinguishes demonstrated crossed legs and side leaning', () => {
    const samples = makeSamples();
    const p = createCalibrationProfile('device-1', 'layout-1', samples);
    expect(classifyPosture(rawMap(samples.cross_left[0]!), p)).toBe('crossed_left');
    expect(classifyPosture(rawMap(samples.cross_right[0]!), p)).toBe('crossed_right');
    expect(classifyPosture(rawMap(samples.lean_left[0]!), p)).toBe('leaning_left');
    expect(classifyPosture(rawMap(samples.lean_right[0]!), p)).toBe('leaning_right');
  });
  it('disables only the failed exercise and does not infer ambiguous poses', () => {
    const samples = makeSamples();
    samples.anal[4]!.contract = repeated([1000, 1000, 700, 700, 0]);
    samples.cross_left = samples.lean_left;
    const p = createCalibrationProfile('device-1', 'layout-1', samples);
    expect(p.exercises.anal?.evaluationEnabled).toBe(false);
    expect(p.exercises.pelvic_floor?.evaluationEnabled).toBe(true);
    expect(classifyPosture(rawMap(samples.cross_left[0]!), p)).toBe('off_reference');
  });
  it('rejects missing and saturated posture samples', () => {
    const samples = makeSamples();
    samples.empty = [];
    expect(() => createCalibrationProfile('d', 'l', samples)).toThrow('不足');
    const saturated = makeSamples();
    saturated.seated[0]![0] = 4095;
    expect(() => createCalibrationProfile('d', 'l', saturated)).toThrow('饱和');
  });
  it('does not validate a body shift or a release that never returns to neutral', () => {
    const samples = makeSamples();
    samples.pelvic_floor[4]!.contract = repeated([1200, 1190, 150, 1000, 0]);
    samples.anal[3] = {
      contract: repeated([1100, 1120, 700, 700, 0]),
      release: repeated([1300, 1300, 700, 700, 0]),
    };
    const p = createCalibrationProfile('d', 'l', samples);
    expect(p.exercises.pelvic_floor).toMatchObject({
      evaluationEnabled: false,
      validationMatches: 1,
    });
    expect(p.exercises.anal).toMatchObject({ evaluationEnabled: false, validationMatches: 1 });
  });
});
