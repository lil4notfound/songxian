import { z } from 'zod';

export const trainingStageSchema = z.enum(['beginner', 'intermediate', 'advanced']);
export type TrainingStage = z.infer<typeof trainingStageSchema>;
export const evaluationModeSchema = z.enum(['sensor', 'timer']);
export type EvaluationMode = z.infer<typeof evaluationModeSchema>;
export const exceptionReasonSchema = z.enum([
  'offline',
  'saturated',
  'unoccupied',
  'poor_contact',
  'posture',
  'moving',
  'contract_unmatched',
  'release_unrecovered',
]);
export type ExceptionReason = z.infer<typeof exceptionReasonSchema>;
export const exceptionStatsSchema = z.object({
  events: z.array(
    z.object({
      reason: exceptionReasonSchema,
      count: z.number().int().nonnegative(),
      seconds: z.number().nonnegative(),
    }),
  ),
  redoCount: z.number().int().nonnegative(),
});
export type ExceptionStats = z.infer<typeof exceptionStatsSchema>;
export const emptyExceptionStats = (): ExceptionStats => ({ events: [], redoCount: 0 });

export const signalQualitySchema = z.enum(['weak', 'medium', 'good', 'unavailable']);
export type SignalQuality = z.infer<typeof signalQualitySchema>;

export const standardPrescriptionSchema = z.object({
  mode: z.literal('standard'),
  stage: z.enum(['beginner', 'intermediate']),
  version: z.string().min(1),
  targetGroups: z.number().int().positive(),
  cyclesPerGroup: z.number().int().positive(),
  contractionSeconds: z.number().int().positive(),
  relaxationSeconds: z.number().int().positive(),
  prepareSeconds: z.number().int().positive(),
  reprepareSeconds: z.number().int().positive(),
  completeSeconds: z.number().int().positive(),
});

export const advancedPrescriptionSchema = z.object({
  mode: z.literal('advanced'),
  stage: z.literal('advanced'),
  version: z.string().min(1),
  targetGroups: z.number().int().positive(),
  cyclesPerGroup: z.number().int().positive(),
  pulseRepetitions: z.number().int().positive(),
  pulseContractSeconds: z.number().int().positive(),
  pulseRelaxSeconds: z.number().int().positive(),
  longRepetitions: z.number().int().positive(),
  longHoldSeconds: z.number().int().positive(),
  longRelaxSeconds: z.number().int().positive(),
  prepareSeconds: z.number().int().positive(),
  reprepareSeconds: z.number().int().positive(),
  completeSeconds: z.number().int().positive(),
});

export const trainingPrescriptionSchema = z.discriminatedUnion('mode', [
  standardPrescriptionSchema,
  advancedPrescriptionSchema,
]);
export type TrainingPrescription = z.infer<typeof trainingPrescriptionSchema>;

export const trainingPlanSchema = z.object({
  selectedStage: trainingStageSchema,
  unlockedStages: z.array(trainingStageSchema),
  demonstrationUnlockedStages: z.array(trainingStageSchema).optional(),
  qualifyingDays: z.object({ beginner: z.number().int(), intermediate: z.number().int() }),
  nextUnlock: z
    .object({ stage: trainingStageSchema, current: z.number().int(), required: z.number().int() })
    .nullable(),
  prescription: trainingPrescriptionSchema,
});
export type TrainingPlan = z.infer<typeof trainingPlanSchema>;

export const sensorMetricsSchema = z.object({
  patternMatchRate: z.number().min(0).max(100),
  timingAdherence: z.number().min(0).max(100),
  releaseRecovery: z.number().min(0).max(100),
  qualityScore: z.number().min(0).max(100),
  quality: signalQualitySchema,
});
export type SensorMetrics = z.infer<typeof sensorMetricsSchema>;

export const selfAssessmentSchema = z.object({
  effort: z.enum(['easy', 'appropriate', 'tired']),
  relaxation: z.enum(['easy', 'neutral', 'difficult']),
  discomfort: z.boolean(),
});
export type SelfAssessment = z.infer<typeof selfAssessmentSchema>;

export const trainingSummarySchema = z.object({
  headline: z.string().min(1).max(48),
  body: z.string().min(1).max(360),
  nextAction: z.string().min(1).max(120),
  source: z.enum(['ai', 'template']),
});
export type TrainingSummary = z.infer<typeof trainingSummarySchema>;

export const improvementSchema = z.object({
  metric: z.enum(['signal_clarity', 'rhythm_stability', 'relaxation_recovery']),
  label: z.string(),
  change: z.number(),
  message: z.string(),
});
export type Improvement = z.infer<typeof improvementSchema>;

export const trainingSessionRecordSchema = z.object({
  id: z.string(),
  requestId: z.string(),
  moduleId: z.enum(['pelvic_floor', 'anal']).optional(),
  evaluationMode: evaluationModeSchema.optional(),
  exceptions: exceptionStatsSchema.optional(),
  stage: trainingStageSchema.nullable(),
  prescriptionVersion: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  localDate: z.string(),
  status: z.enum(['active', 'complete', 'stopped']),
  targetGroups: z.number().int(),
  completedGroups: z.number().int(),
  targetCycles: z.number().int(),
  completedCycles: z.number().int(),
  elapsedSeconds: z.number().int(),
  metrics: sensorMetricsSchema.nullable(),
  assessment: selfAssessmentSchema.nullable(),
  summary: trainingSummarySchema.nullable(),
});
export type TrainingSessionRecord = z.infer<typeof trainingSessionRecordSchema>;

export const calendarDaySchema = z.object({
  date: z.string(),
  status: z.enum(['complete', 'partial']),
  completedGroups: z.number().int(),
  targetGroups: z.number().int(),
  sessionCount: z.number().int(),
  quality: signalQualitySchema.nullable(),
});
export type CalendarDay = z.infer<typeof calendarDaySchema>;

export const progressSnapshotSchema = z.object({
  currentStreak: z.number().int(),
  longestStreak: z.number().int(),
  trainingDays: z.number().int(),
  unlockedStages: z.array(trainingStageSchema),
  qualifyingDays: z.object({ beginner: z.number().int(), intermediate: z.number().int() }),
  improvements: z.array(improvementSchema),
  message: z.string(),
});
export type ProgressSnapshot = z.infer<typeof progressSnapshotSchema>;

export const startTrainingRequestSchema = z
  .object({
    requestId: z.string().min(1),
    moduleId: z.enum(['pelvic_floor', 'anal']).optional(),
    evaluationMode: evaluationModeSchema.optional(),
    stage: trainingStageSchema.nullable(),
    prescriptionVersion: z.string().min(1),
    startedAt: z.string().datetime(),
  })
  .refine(
    (input) => (input.moduleId === 'anal' ? input.stage === null : input.stage !== null),
    '训练模块与阶段不匹配',
  );
export type StartTrainingRequest = z.infer<typeof startTrainingRequestSchema>;

export const completeTrainingRequestSchema = z.object({
  requestId: z.string().min(1),
  endedAt: z.string().datetime(),
  status: z.enum(['complete', 'stopped']),
  targetGroups: z.number().int().positive(),
  completedGroups: z.number().int().nonnegative(),
  targetCycles: z.number().int().positive(),
  completedCycles: z.number().int().nonnegative(),
  elapsedSeconds: z.number().int().nonnegative(),
  metrics: sensorMetricsSchema.nullable(),
  assessment: selfAssessmentSchema,
  evaluationMode: evaluationModeSchema.optional(),
  exceptions: exceptionStatsSchema.optional(),
});
export type CompleteTrainingRequest = z.infer<typeof completeTrainingRequestSchema>;

export const stageLabels: Record<TrainingStage, string> = {
  beginner: '初级',
  intermediate: '中级',
  advanced: '高级',
};

export const stageGoals: Record<TrainingStage, string> = {
  beginner: '找到正确的收缩感觉',
  intermediate: '稳定节奏，建立耐力',
  advanced: '交替练习，整合控制',
};
