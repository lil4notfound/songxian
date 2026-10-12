import {
  DEVICE_CHANNELS,
  PLACEMENT_VERSION,
  type CalibrationProfile,
  type ChannelMap,
  type ExerciseReference,
  type ExerciseDiagnostic,
  type RawChannelValues,
} from '../contracts/device';
import type { TrainingModuleId } from './training';
export const POSTURE_PHASES = [
  'empty',
  'seated',
  'lean_left',
  'lean_right',
  'lean_forward',
  'lean_back',
  'cross_left',
  'cross_right',
  'rest',
] as const;
export type CalibrationPhase = (typeof POSTURE_PHASES)[number];
export type ExerciseTrial = { contract: RawChannelValues[]; release: RawChannelValues[] };
export type CalibrationSamples = Record<CalibrationPhase, RawChannelValues[]> & {
  pelvic_floor: ExerciseTrial[];
  anal: ExerciseTrial[];
};
export const createEmptySamples = (): CalibrationSamples => ({
  empty: [],
  seated: [],
  lean_left: [],
  lean_right: [],
  lean_forward: [],
  lean_back: [],
  cross_left: [],
  cross_right: [],
  rest: [],
  pelvic_floor: [],
  anal: [],
});
export const median = (values: number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};
const mapSamples = (samples: RawChannelValues[], fn: (values: number[]) => number): ChannelMap =>
  Object.fromEntries(
    DEVICE_CHANNELS.map((ch, i) => [ch, fn(samples.map((s) => s[i]!))]),
  ) as ChannelMap;
const mad = (values: number[]) => {
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
};
const distance = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]!));
// Later samples exclude settling into a pose or gradually releasing an action.
const settled = (samples: RawChannelValues[]) => samples.slice(Math.floor(samples.length / 2));
const phaseNoise = (phases: RawChannelValues[][]): ChannelMap =>
  Object.fromEntries(
    DEVICE_CHANNELS.map((ch, i) => [
      ch,
      Math.max(0, ...phases.map((samples) => mad(settled(samples).map((s) => s[i]!)))),
    ]),
  ) as ChannelMap;
export const postureFeatures = (
  raw: ChannelMap,
  baseline: ChannelMap,
  scale: ChannelMap,
): [number, number, number, number] => [
  (raw.S_L - baseline.S_L - (raw.S_R - baseline.S_R)) / Math.max(scale.S_L, scale.S_R),
  (raw.B_L - baseline.B_L) / scale.B_L,
  (raw.B_R - baseline.B_R) / scale.B_R,
  (raw.P_C - baseline.P_C) / scale.P_C,
];
const buildExercise = (
  trials: ExerciseTrial[],
  noise: ChannelMap,
  baseline: ChannelMap,
  scale: ChannelMap,
  neutralTolerance: number,
): { reference: ExerciseReference | null; diagnostic: ExerciseDiagnostic } => {
  const failed = (
    reason: ExerciseDiagnostic['reason'],
    amplitude?: number,
    minimumAmplitude?: number,
  ) => ({
    reference: null,
    diagnostic: { reason, validationMatches: 0, amplitude, minimumAmplitude },
  });
  const usable = trials.filter((t) => t.contract.length >= 8 && t.release.length >= 8);
  if (usable.length !== 5) return failed('insufficient_samples');
  if (usable.some((t) => [...t.contract, ...t.release].some((s) => s.some((v) => v >= 4000))))
    return failed('saturated');
  const deltas = usable.map((t) =>
    [0, 1].map(
      (i) =>
        median(settled(t.contract).map((s) => s[i]!)) -
        median(settled(t.release).map((s) => s[i]!)),
    ),
  );
  const delta: [number, number] = [
    median(deltas.slice(0, 3).map((v) => v[0]!)),
    median(deltas.slice(0, 3).map((v) => v[1]!)),
  ];
  const amplitude = Math.hypot(...delta);
  const localNoise = phaseNoise(usable.flatMap((t) => [t.contract, t.release]));
  const noiseAmplitude = Math.hypot(
    Math.max(noise.S_L, localNoise.S_L),
    Math.max(noise.S_R, localNoise.S_R),
  );
  const minimumAmplitude = Math.max(12, noiseAmplitude * 6);
  if (amplitude < minimumAmplitude) return failed('weak_signal', amplitude, minimumAmplitude);
  const releaseTolerance = Math.max(12, amplitude * 0.25, noiseAmplitude * 6);
  // An exercise has its own relaxed reference; uniform load settling since the posture
  // step must not erase an otherwise repeatable action. Both validations remain independent.
  const relaxedBaseline: [number, number] = [0, 1].map((i) =>
    median(usable.slice(0, 3).map((t) => median(settled(t.release).map((s) => s[i]!)))),
  ) as [number, number];
  const stableTrial = (trial: ExerciseTrial) => {
    const contract = mapSamples(settled(trial.contract), median);
    const release = mapSamples(settled(trial.release), median);
    const auxiliaryChange = Math.hypot(
      ...(['B_L', 'B_R', 'P_C'] as const).map((ch) => (contract[ch] - release[ch]) / scale[ch]),
    );
    return (
      Math.hypot(release.S_L - relaxedBaseline[0], release.S_R - relaxedBaseline[1]) <=
        releaseTolerance &&
      Math.hypot(...postureFeatures(release, baseline, scale)) <= neutralTolerance &&
      auxiliaryChange <= neutralTolerance
    );
  };
  const matches = (v: number[]) => {
    const projection = (v[0]! * delta[0] + v[1]! * delta[1]) / (amplitude * amplitude);
    const residual = Math.hypot(v[0]! - projection * delta[0], v[1]! - projection * delta[1]);
    return (
      projection >= 0.6 &&
      projection <= 1.5 &&
      residual <= Math.max(amplitude * 0.4, noiseAmplitude * 6, 12)
    );
  };
  if (!usable.slice(0, 3).every((t, i) => stableTrial(t) && matches(deltas[i]!)))
    return failed('unstable_demonstration', amplitude, minimumAmplitude);
  const validationMatches = deltas.slice(3).filter((v, i) => {
    return stableTrial(usable[i + 3]!) && matches(v);
  }).length;
  return {
    reference: {
      delta,
      amplitude,
      releaseTolerance,
      relaxedBaseline,
      validationMatches,
      evaluationEnabled: validationMatches === 2,
    },
    diagnostic: {
      reason: validationMatches === 2 ? 'ready' : 'validation_failed',
      validationMatches,
      amplitude,
      minimumAmplitude,
    },
  };
};

export const exerciseCalibrationMessage = (
  profile: CalibrationProfile | null,
  moduleId: TrainingModuleId,
): string => {
  if (!profile) return '尚未校准，请先建立个人参考。';
  const reference = profile.exercises[moduleId];
  const diagnostic = profile.exerciseDiagnostics?.[moduleId];
  if (reference?.evaluationEnabled) return '动作参考已通过两次独立验证。';
  if (diagnostic?.reason === 'weak_signal')
    return '收放变化不足以区别于噪声，请检查臀下两片的位置后重采动作。';
  if (diagnostic?.reason === 'unstable_demonstration')
    return '三次示教的收放或坐姿不够一致，请保持自然坐姿、充分放松后重采。';
  if (diagnostic?.reason === 'saturated') return '动作采集出现饱和，请调整对应贴片后重采。';
  if (diagnostic?.reason === 'insufficient_samples') return '动作有效数据不足，请恢复连接后重采。';
  if (reference)
    return `独立验证通过 ${reference.validationMatches}/2 次，请单独重采动作；姿态档案已保留。`;
  return '未形成稳定的收放参考，请检查臀下两片的位置并单独重采动作；姿态档案已保留。';
};

export const updateExerciseCalibration = (
  profile: CalibrationProfile,
  moduleId: TrainingModuleId,
  neutral: RawChannelValues[],
  trials: ExerciseTrial[],
): CalibrationProfile => {
  if (neutral.length < 8 || neutral.some((s) => s.some((v) => v >= 4000)))
    throw new Error('自然坐姿数据不足或饱和，请重采本步骤');
  const result = buildExercise(
    trials,
    phaseNoise([neutral]),
    profile.baseline,
    profile.scale,
    profile.posture.neutralTolerance,
  );
  return {
    ...profile,
    createdAt: new Date().toISOString(),
    exercises: { ...profile.exercises, [moduleId]: result.reference },
    exerciseDiagnostics: { ...profile.exerciseDiagnostics, [moduleId]: result.diagnostic },
  };
};
export const createCalibrationProfile = (
  deviceId: string,
  layoutVersion: string,
  samples: CalibrationSamples,
): CalibrationProfile => {
  if (POSTURE_PHASES.some((p) => samples[p].length < 8))
    throw new Error('校准步骤数据不足，请重采');
  const all = POSTURE_PHASES.flatMap((p) => samples[p]);
  if (all.some((s) => s.some((v) => v >= 4000))) throw new Error('校准信号饱和，请检查贴片后重采');
  const baseline = mapSamples(settled(samples.rest), median);
  const empty = mapSamples(settled(samples.empty), median);
  // Estimate within-pose noise, not the load difference between two separate poses.
  const noise = phaseNoise([samples.seated, samples.rest]);
  if (
    ['S_L', 'S_R'].some(
      (ch) =>
        baseline[ch as keyof ChannelMap] - empty[ch as keyof ChannelMap] <
        Math.max(20, noise[ch as keyof ChannelMap] * 6),
    )
  )
    throw new Error('臀下贴片接触不足，请调整后重采');
  const guided = POSTURE_PHASES.filter((p) => p !== 'empty').flatMap((p) => settled(samples[p]));
  const scale = Object.fromEntries(
    DEVICE_CHANNELS.map((ch, i) => [
      ch,
      Math.max(60, noise[ch] * 8, ...guided.map((s) => Math.abs(s[i]! - baseline[ch]))),
    ]),
  ) as ChannelMap;
  const neutralFeatures = settled(samples.rest).map((s) =>
    postureFeatures(mapSamples([s], median), baseline, scale),
  );
  const neutralTolerance = Math.max(0.22, ...neutralFeatures.map((v) => Math.hypot(...v) * 1.5));
  const states = {
    lean_left: 'leaning_left',
    lean_right: 'leaning_right',
    lean_forward: 'leaning_forward',
    lean_back: 'leaning_back',
    cross_left: 'crossed_left',
    cross_right: 'crossed_right',
  } as const;
  const references = Object.entries(states).map(([phase, state]) => {
    const values = settled(samples[phase as CalibrationPhase]);
    const features = postureFeatures(mapSamples(values, median), baseline, scale);
    const radius = Math.max(
      0.2,
      ...values.map(
        (s) => distance(postureFeatures(mapSamples([s], median), baseline, scale), features) * 1.5,
      ),
    );
    return { state, features, radius, enabled: Math.hypot(...features) > neutralTolerance * 1.5 };
  });
  const ambiguous = references.filter((ref) =>
    references.some(
      (other) =>
        other !== ref &&
        distance(ref.features, other.features) < Math.max(ref.radius, other.radius) * 1.5,
    ),
  );
  for (const ref of ambiguous) ref.enabled = false;
  const pelvic = buildExercise(samples.pelvic_floor, noise, baseline, scale, neutralTolerance);
  const anal = buildExercise(samples.anal, noise, baseline, scale, neutralTolerance);
  return {
    version: 2,
    placementVersion: PLACEMENT_VERSION,
    deviceId,
    layoutVersion,
    createdAt: new Date().toISOString(),
    baseline,
    empty,
    noise,
    scale,
    posture: { seatDeltaThreshold: 0.2, movementThreshold: 0.35, neutralTolerance, references },
    exercises: {
      pelvic_floor: pelvic.reference,
      anal: anal.reference,
    },
    exerciseDiagnostics: { pelvic_floor: pelvic.diagnostic, anal: anal.diagnostic },
  };
};
export type TrainingSignalState =
  | 'matched'
  | 'released'
  | 'unmatched'
  | 'not_released'
  | 'uncalibrated';
export const evaluateTrainingSignal = (
  moduleId: TrainingModuleId,
  raw: ChannelMap,
  profile: CalibrationProfile | null,
  relaxing: boolean,
): TrainingSignalState => {
  const reference = profile?.exercises[moduleId];
  if (!profile || !reference?.evaluationEnabled) return 'uncalibrated';
  const baseline = reference.relaxedBaseline ?? [profile.baseline.S_L, profile.baseline.S_R];
  const values = [raw.S_L - baseline[0], raw.S_R - baseline[1]];
  if (relaxing)
    return Math.hypot(...values) <= reference.releaseTolerance ? 'released' : 'not_released';
  const projection =
    (values[0]! * reference.delta[0] + values[1]! * reference.delta[1]) / reference.amplitude ** 2;
  const residual = Math.hypot(
    values[0]! - projection * reference.delta[0],
    values[1]! - projection * reference.delta[1],
  );
  return projection >= 0.6 &&
    projection <= 1.5 &&
    residual <=
      Math.max(12, reference.amplitude * 0.4, Math.hypot(profile.noise.S_L, profile.noise.S_R) * 6)
    ? 'matched'
    : 'unmatched';
};
// A validated contraction may change buttock pressure without changing posture.
export const removeContraction = (
  raw: ChannelMap,
  profile: CalibrationProfile,
  moduleId?: TrainingModuleId,
): ChannelMap => {
  const references = moduleId ? [profile.exercises[moduleId]] : Object.values(profile.exercises);
  for (const ref of references) {
    if (!ref?.evaluationEnabled) continue;
    const baseline = ref.relaxedBaseline ?? [profile.baseline.S_L, profile.baseline.S_R];
    const values = [raw.S_L - baseline[0], raw.S_R - baseline[1]];
    const p = (values[0]! * ref.delta[0] + values[1]! * ref.delta[1]) / ref.amplitude ** 2;
    if (p < 0 || p > 1.5) continue;
    const residual = Math.hypot(values[0]! - p * ref.delta[0], values[1]! - p * ref.delta[1]);
    if (residual <= Math.max(12, ref.amplitude * 0.4))
      return {
        ...raw,
        S_L: profile.baseline.S_L + values[0]! - p * ref.delta[0],
        S_R: profile.baseline.S_R + values[1]! - p * ref.delta[1],
      };
  }
  return raw;
};
