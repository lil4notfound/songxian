import type {
  SelfAssessment,
  SensorMetrics,
  SignalQuality,
  TrainingPrescription,
  TrainingStage,
  TrainingSummary,
} from '../contracts/training';

export const TRAINING_PLAN_VERSION = 'pelvic-three-stage-v1';

export const getDefaultPrescription = (stage: TrainingStage): TrainingPrescription => {
  if (stage === 'beginner') {
    return {
      mode: 'standard',
      stage,
      version: `${TRAINING_PLAN_VERSION}-beginner-3-6`,
      targetGroups: 2,
      cyclesPerGroup: 10,
      contractionSeconds: 3,
      relaxationSeconds: 6,
      prepareSeconds: 15,
      reprepareSeconds: 3,
      completeSeconds: 5,
    };
  }
  if (stage === 'intermediate') {
    return {
      mode: 'standard',
      stage,
      version: `${TRAINING_PLAN_VERSION}-intermediate-5-10`,
      targetGroups: 3,
      cyclesPerGroup: 15,
      contractionSeconds: 5,
      relaxationSeconds: 10,
      prepareSeconds: 15,
      reprepareSeconds: 3,
      completeSeconds: 5,
    };
  }
  return {
    mode: 'advanced',
    stage,
    version: `${TRAINING_PLAN_VERSION}-advanced-1-1-10-20`,
    targetGroups: 4,
    cyclesPerGroup: 20,
    pulseRepetitions: 10,
    pulseContractSeconds: 1,
    pulseRelaxSeconds: 1,
    longRepetitions: 10,
    longHoldSeconds: 10,
    longRelaxSeconds: 20,
    prepareSeconds: 15,
    reprepareSeconds: 3,
    completeSeconds: 5,
  };
};

export const calculateSensorMetrics = (
  patternMatchRate: number,
  timingAdherence: number,
  releaseRecovery: number,
): SensorMetrics => {
  const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
  const pattern = clamp(patternMatchRate);
  const timing = clamp(timingAdherence);
  const release = clamp(releaseRecovery);
  const qualityScore = clamp(pattern * 0.4 + timing * 0.3 + release * 0.3);
  const quality: SignalQuality = qualityScore < 60 ? 'weak' : qualityScore < 80 ? 'medium' : 'good';
  return {
    patternMatchRate: pattern,
    timingAdherence: timing,
    releaseRecovery: release,
    qualityScore,
    quality,
  };
};

export const getAdaptedPrescription = (
  stage: TrainingStage,
  previous: TrainingPrescription | null,
  quality: SignalQuality,
  assessment: SelfAssessment | null,
): TrainingPrescription => {
  const fallback = getDefaultPrescription(stage);
  if (!previous || previous.stage !== stage || previous.mode === 'advanced') return fallback;
  if (quality === 'weak' || assessment?.effort === 'tired') return fallback;
  if (quality !== 'medium' || assessment?.effort !== 'easy') return previous;

  if (stage === 'beginner' && previous.stage === 'beginner') {
    const contractionSeconds = Math.min(5, previous.contractionSeconds + 1);
    const relaxationSeconds = Math.min(10, previous.relaxationSeconds + 2);
    return {
      ...previous,
      contractionSeconds,
      relaxationSeconds,
      version: `${TRAINING_PLAN_VERSION}-beginner-${contractionSeconds}-${relaxationSeconds}`,
    };
  }
  if (stage === 'intermediate' && previous.stage === 'intermediate') {
    return {
      ...previous,
      contractionSeconds: 8,
      relaxationSeconds: 15,
      version: `${TRAINING_PLAN_VERSION}-intermediate-8-15`,
    };
  }
  return previous;
};

export const getNextAction = (
  stage: TrainingStage,
  quality: SignalQuality,
  assessment: SelfAssessment,
): string => {
  if (assessment.discomfort) return '先停止加量并休息；如不适持续，请咨询专业人员。';
  if (assessment.effort === 'tired') return '下次回到本阶段的起始节奏，先把动作做稳。';
  if (stage === 'beginner') {
    if (quality === 'weak') return '下次先找感觉，不加时间。';
    if (quality === 'medium') return '保持当前节奏，轻松时可尝试延长 1 秒。';
    return '继续保持，把注意力放在充分放松上。';
  }
  if (stage === 'intermediate') {
    if (quality === 'weak') return '回到 5 秒收缩，先稳节奏，不急着加时间。';
    if (quality === 'medium') return '尝试 8 秒收缩，放松时间也相应加长。';
    return '保持 8 秒节奏，不急着增加到 10 秒。';
  }
  if (quality === 'weak') return '下次可以选择中级的 8 秒节奏，先把动作做稳。';
  return '继续保持交替节奏，并给放松阶段留足时间。';
};

export const createTemplateSummary = (input: {
  stage: TrainingStage;
  completedGroups: number;
  completedCycles: number;
  metrics: SensorMetrics | null;
  assessment: SelfAssessment;
}): TrainingSummary => {
  const quality = input.metrics?.quality ?? 'unavailable';
  const nextAction = getNextAction(input.stage, quality, input.assessment);
  const amount = `今天完成了 ${input.completedGroups} 组，共 ${input.completedCycles} 次收缩。`;
  if (quality === 'weak') {
    return {
      headline: '先把感觉找回来',
      body: `${amount}这次压力信号整体偏弱，不需要勉强加力。把节奏放慢、保持自然呼吸，比完成更大的动作更重要。`,
      nextAction,
      source: 'template',
    };
  }
  if (quality === 'medium') {
    return {
      headline: '节奏正在变得稳定',
      body: `${amount}这次压力信号比较平稳，动作和放松基本跟上了节奏。继续用轻柔、可呼吸的方式完成训练。`,
      nextAction,
      source: 'template',
    };
  }
  if (quality === 'good') {
    return {
      headline: '今天的控制很清晰',
      body: `${amount}这次压力信号清晰，节奏也跟得不错。保持放松，不需要因为表现良好而额外用力。`,
      nextAction,
      source: 'template',
    };
  }
  return {
    headline: '今天的训练已记录',
    body: `${amount}本次没有足够的压力数据用于判断表现，训练完成度已经保存。`,
    nextAction,
    source: 'template',
  };
};
