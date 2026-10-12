import { CHANNEL_LABELS, type CalibrationProfile, type DeviceTelemetry } from '../contracts/device';
import type { ExceptionReason } from '../contracts/training';
import { classifyPosture, contactProblem, POSTURE_ADVICE } from './posture';
import type { TrainingModuleId } from './training';
export type TrainingIssue = { reason: ExceptionReason; message: string };
export type GuardState = {
  candidate: TrainingIssue | null;
  since: number;
  healthySince: number | null;
  issue: TrainingIssue | null;
  ready: boolean;
};
export const createGuard = (): GuardState => ({
  candidate: null,
  since: 0,
  healthySince: null,
  issue: null,
  ready: false,
});
export const deriveTrainingIssue = (
  telemetry: DeviceTelemetry | null,
  profile: CalibrationProfile | null,
  moduleId: TrainingModuleId,
  fresh: boolean,
): TrainingIssue | null => {
  if (!telemetry || !fresh || !telemetry.snapshot.connected)
    return { reason: 'offline', message: '检查坐垫连接，恢复数据后再继续。' };
  if (telemetry.saturatedChannels.length)
    return {
      reason: 'saturated',
      message:
        '检查' +
        telemetry.saturatedChannels.map((ch) => CHANNEL_LABELS[ch]).join('、') +
        '的贴片与接触，读数恢复后再继续。',
    };
  if (
    profile &&
    (profile.deviceId !== telemetry.deviceId || profile.layoutVersion !== telemetry.layoutVersion)
  )
    return { reason: 'offline', message: '设备发生变化，请重新连接并建立对应的校准参考。' };
  if (profile) {
    const contact = contactProblem(telemetry.filteredRaw, profile);
    if (contact) return { reason: contact, message: POSTURE_ADVICE[contact].message };
    const posture = classifyPosture(telemetry.filteredRaw, profile, moduleId);
    if (posture !== 'balanced')
      return { reason: 'posture', message: POSTURE_ADVICE[posture].message };
    if (!telemetry.snapshot.stable)
      return { reason: 'moving', message: '先坐稳，保持自然呼吸，再继续本轮。' };
  }
  return null;
};
export const advanceGuard = (
  state: GuardState,
  candidate: TrainingIssue | null,
  now: number,
): GuardState => {
  if (!candidate) {
    const healthySince = state.healthySince ?? now;
    return {
      ...state,
      candidate: null,
      healthySince,
      issue: null,
      ready: now - healthySince >= 2000,
    };
  }
  const changed = state.candidate?.reason !== candidate.reason;
  const since = changed ? now : state.since;
  const delay = candidate.reason === 'offline' ? 0 : candidate.reason === 'saturated' ? 1000 : 2000;
  return {
    candidate,
    since,
    healthySince: null,
    issue: now - since >= delay ? candidate : null,
    ready: false,
  };
};
export type CycleObservation = {
  contract: number;
  matched: number;
  relax: number;
  recovered: number;
};
export const cycleProblem = (
  observation: CycleObservation,
): 'contract_unmatched' | 'release_unrecovered' | null => {
  if (observation.contract > 0 && observation.matched / observation.contract < 0.5)
    return 'contract_unmatched';
  if (observation.relax > 0 && observation.recovered / observation.relax < 0.5)
    return 'release_unrecovered';
  return null;
};
export const ACTION_ISSUES = {
  contract_unmatched: {
    reason: 'contract_unmatched' as const,
    message: '这两轮收缩未接近个人参考。先放松，再尝试轻柔收住，避免夹臀和挪动身体。',
  },
  release_unrecovered: {
    reason: 'release_unrecovered' as const,
    message: '这两轮放松未回到个人参考。先完全松开，保持自然呼吸，准备好后重做本轮。',
  },
};
