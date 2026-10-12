import { z } from 'zod';

export const DEVICE_CHANNELS = ['S_L', 'S_R', 'B_L', 'B_R', 'P_C'] as const;
export type DeviceChannel = (typeof DEVICE_CHANNELS)[number];
export const PLACEMENT_VERSION = 'glute-thigh-back-v2' as const;
export const CHANNEL_LABELS: Record<DeviceChannel, string> = {
  S_L: '臀下左',
  S_R: '臀下右',
  B_L: '腿侧左',
  B_R: '腿侧右',
  P_C: '背部中央',
};
export const posturePatternSchema = z.enum([
  'balanced',
  'leaning_left',
  'leaning_right',
  'leaning_forward',
  'leaning_back',
  'crossed_left',
  'crossed_right',
  'off_reference',
]);

export const rawChannelValuesSchema = z.tuple([
  z.number().int().min(0).max(4095),
  z.number().int().min(0).max(4095),
  z.number().int().min(0).max(4095),
  z.number().int().min(0).max(4095),
  z.number().int().min(0).max(4095),
]);
export type RawChannelValues = z.infer<typeof rawChannelValuesSchema>;

export const deviceSampleSchema = z.object({
  seq: z.number().int().nonnegative(),
  tMs: z.number().int().nonnegative(),
  raw: rawChannelValuesSchema,
});
export type DeviceSample = z.infer<typeof deviceSampleSchema>;

export const deviceFrameBatchSchema = z.object({
  protocol: z.literal(1),
  deviceId: z.string().min(1).max(64),
  bootId: z.string().min(1).max(64),
  frameSeq: z.number().int().nonnegative(),
  layoutVersion: z.string().min(1).max(64),
  sampleHz: z.number().int().min(1).max(100),
  channels: z.tuple([
    z.literal('S_L'),
    z.literal('S_R'),
    z.literal('B_L'),
    z.literal('B_R'),
    z.literal('P_C'),
  ]),
  samples: z.array(deviceSampleSchema).min(1).max(10),
});
export type DeviceFrameBatch = z.infer<typeof deviceFrameBatchSchema>;

export const channelMapSchema = z.object({
  S_L: z.number(),
  S_R: z.number(),
  B_L: z.number(),
  B_R: z.number(),
  P_C: z.number(),
});
export type ChannelMap = z.infer<typeof channelMapSchema>;

export const exerciseReferenceSchema = z.object({
  delta: z.tuple([z.number(), z.number()]),
  amplitude: z.number().positive(),
  releaseTolerance: z.number().positive(),
  evaluationEnabled: z.boolean(),
  validationMatches: z.number().int().min(0).max(2),
  relaxedBaseline: z.tuple([z.number(), z.number()]).optional(),
});
export type ExerciseReference = z.infer<typeof exerciseReferenceSchema>;

export const exerciseDiagnosticSchema = z.object({
  reason: z.enum([
    'ready',
    'insufficient_samples',
    'saturated',
    'weak_signal',
    'unstable_demonstration',
    'validation_failed',
  ]),
  validationMatches: z.number().int().min(0).max(2),
  amplitude: z.number().nonnegative().optional(),
  minimumAmplitude: z.number().nonnegative().optional(),
});
export type ExerciseDiagnostic = z.infer<typeof exerciseDiagnosticSchema>;

export const calibrationProfileSchema = z.object({
  version: z.literal(2),
  placementVersion: z.literal(PLACEMENT_VERSION),
  deviceId: z.string().min(1),
  layoutVersion: z.string().min(1),
  createdAt: z.string(),
  baseline: channelMapSchema,
  empty: channelMapSchema,
  noise: channelMapSchema,
  scale: channelMapSchema,
  posture: z.object({
    seatDeltaThreshold: z.number().min(0.08).max(0.4),
    movementThreshold: z.number().min(0.1).max(0.8),
    neutralTolerance: z.number().positive(),
    references: z.array(
      z.object({
        state: posturePatternSchema,
        features: z.tuple([z.number(), z.number(), z.number(), z.number()]),
        radius: z.number().positive(),
        enabled: z.boolean(),
      }),
    ),
  }),
  exercises: z.object({
    pelvic_floor: exerciseReferenceSchema.nullable(),
    anal: exerciseReferenceSchema.nullable(),
  }),
  exerciseDiagnostics: z
    .object({
      pelvic_floor: exerciseDiagnosticSchema.optional(),
      anal: exerciseDiagnosticSchema.optional(),
    })
    .optional(),
});
export type CalibrationProfile = z.infer<typeof calibrationProfileSchema>;

export const deviceSnapshotSchema = z.object({
  sequence: z.number().int().nonnegative(),
  capturedAt: z.number().nonnegative(),
  connected: z.boolean(),
  stable: z.boolean(),
  calibrated: z.boolean(),
  gluteLeft: z.number().min(0).max(1),
  gluteRight: z.number().min(0).max(1),
  thighLeft: z.number().min(0).max(1),
  thighRight: z.number().min(0).max(1),
  backCenter: z.number().min(0).max(1),
  postureState: posturePatternSchema.optional(),
  contactIssue: z.enum(['unoccupied', 'poor_contact', 'saturated']).nullable().optional(),
  issueChannels: z.array(z.enum(DEVICE_CHANNELS)).optional(),
  thresholds: z.object({
    seatDelta: z.number().min(0).max(1),
    movement: z.number().min(0).max(1),
  }),
});
export type DeviceSnapshotDto = z.infer<typeof deviceSnapshotSchema>;

export const deviceTelemetrySchema = z.object({
  type: z.literal('telemetry'),
  deviceId: z.string(),
  bootId: z.string(),
  layoutVersion: z.string(),
  receivedAt: z.number(),
  raw: channelMapSchema,
  filteredRaw: channelMapSchema,
  saturatedChannels: z.array(z.enum(DEVICE_CHANNELS)),
  snapshot: deviceSnapshotSchema,
});
export type DeviceTelemetry = z.infer<typeof deviceTelemetrySchema>;

export const deviceStatusSchema = z.object({
  state: z.enum(['connecting', 'ready', 'unstable', 'offline']),
  deviceId: z.string().nullable(),
  layoutVersion: z.string().nullable(),
  lastSeenAt: z.number().nullable(),
  lastSequence: z.number().int().nonnegative().nullable(),
  receivedSamples: z.number().int().nonnegative(),
  droppedSamples: z.number().int().nonnegative(),
  dropRate: z.number().min(0).max(1),
  saturatedChannels: z.array(z.enum(DEVICE_CHANNELS)),
  calibrated: z.boolean(),
  needsRecalibration: z.boolean().optional(),
});
export type DeviceStatus = z.infer<typeof deviceStatusSchema>;
