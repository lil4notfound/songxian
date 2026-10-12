import { describe, expect, it } from 'vitest';
import {
  calculateSensorMetrics,
  getAdaptedPrescription,
  getDefaultPrescription,
} from './trainingPlan';

describe('three-stage training plan', () => {
  it('uses the documented lower bounds for each stage', () => {
    expect(getDefaultPrescription('beginner')).toMatchObject({
      targetGroups: 2,
      cyclesPerGroup: 10,
      contractionSeconds: 3,
      relaxationSeconds: 6,
    });
    expect(getDefaultPrescription('intermediate')).toMatchObject({
      targetGroups: 3,
      cyclesPerGroup: 15,
      contractionSeconds: 5,
      relaxationSeconds: 10,
    });
    expect(getDefaultPrescription('advanced')).toMatchObject({
      targetGroups: 4,
      cyclesPerGroup: 20,
      pulseRepetitions: 10,
      longRepetitions: 10,
    });
  });

  it('adapts beginner timing only for a medium and easy session', () => {
    const current = getDefaultPrescription('beginner');
    const next = getAdaptedPrescription('beginner', current, 'medium', {
      effort: 'easy',
      relaxation: 'easy',
      discomfort: false,
    });
    expect(next).toMatchObject({ contractionSeconds: 4, relaxationSeconds: 8 });
    expect(
      getAdaptedPrescription('beginner', next, 'weak', {
        effort: 'easy',
        relaxation: 'easy',
        discomfort: false,
      }),
    ).toMatchObject({ contractionSeconds: 3, relaxationSeconds: 6 });
  });

  it('classifies the weighted quality score', () => {
    expect(calculateSensorMetrics(80, 80, 80)).toMatchObject({ qualityScore: 80, quality: 'good' });
    expect(calculateSensorMetrics(50, 70, 60)).toMatchObject({ qualityScore: 59, quality: 'weak' });
  });
});
