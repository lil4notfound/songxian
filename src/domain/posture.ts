import type { CalibrationProfile, ChannelMap, DeviceSnapshotDto } from '../contracts/device';
import { postureFeatures, removeContraction } from './calibration';
import type { TrainingModuleId } from './training';
export type DeviceSnapshot = DeviceSnapshotDto;
export type PostureState =
  | NonNullable<DeviceSnapshot['postureState']>
  | 'adjusting'
  | 'unknown'
  | 'uncalibrated'
  | 'unoccupied'
  | 'poor_contact'
  | 'saturated';
export type PostureAdvice = { state: PostureState; label: string; message: string };
export const POSTURE_ADVICE: Record<PostureState, Omit<PostureAdvice, 'state'>> = {
  balanced: { label: '接近舒适参考', message: '当前支撑接近你的舒适参考，保持舒服，自然呼吸。' },
  leaning_left: {
    label: '左侧支撑较多',
    message: '双脚放稳，身体轻轻向右调整，让两侧支撑更均衡。',
  },
  leaning_right: {
    label: '右侧支撑较多',
    message: '双脚放稳，身体轻轻向左调整，让两侧支撑更均衡。',
  },
  leaning_forward: { label: '身体偏向前方', message: '双脚放稳，让躯干回到自然中立的位置。' },
  leaning_back: { label: '身体偏向后方', message: '轻轻回到自然中立的位置，不必刻意贴紧椅背。' },
  crossed_left: { label: '左腿翘起的趋势', message: '放下左腿，让双脚落地，两侧臀下自然承重。' },
  crossed_right: { label: '右腿翘起的趋势', message: '放下右腿，让双脚落地，两侧臀下自然承重。' },
  off_reference: {
    label: '坐姿偏离个人参考',
    message: '放下翘起的腿，双脚落地，回到校准时的自然坐姿。',
  },
  adjusting: { label: '正在调整', message: '先坐稳，保持两秒，我们再观察。' },
  unknown: { label: '连接待确认', message: '检查坐垫连接，恢复数据后再继续。' },
  uncalibrated: {
    label: '请先建立坐姿参考',
    message: '完成新布局校准后，才能比较坐姿；当前只显示接触读数。',
  },
  unoccupied: { label: '还没有坐稳', message: '坐回坐垫，让左右臀下贴片自然承重。' },
  poor_contact: { label: '臀下接触不足', message: '调整坐垫位置，让左右臀下贴片保持接触。' },
  saturated: { label: '贴片读数饱和', message: '检查提示点位的贴片与接触，调整后再继续。' },
};
export const classifyPosture = (
  raw: ChannelMap,
  profile: CalibrationProfile,
  moduleId?: TrainingModuleId,
): NonNullable<DeviceSnapshot['postureState']> => {
  const features = postureFeatures(
    removeContraction(raw, profile, moduleId),
    profile.baseline,
    profile.scale,
  );
  const norm = Math.hypot(...features);
  if (norm <= profile.posture.neutralTolerance) return 'balanced';
  const nearest = profile.posture.references
    .filter((r) => r.enabled)
    .map((r) => ({ r, distance: Math.hypot(...features.map((v, i) => v - r.features[i]!)) }))
    .sort((a, b) => a.distance - b.distance);
  const first = nearest[0];
  if (
    !first ||
    first.distance > first.r.radius ||
    first.distance > norm * 0.65 ||
    (nearest[1] && nearest[1].distance - first.distance < 0.1)
  )
    return 'off_reference';
  return first.r.state;
};
export const contactProblem = (
  raw: ChannelMap,
  profile: CalibrationProfile,
): 'unoccupied' | 'poor_contact' | null => {
  const missing = ['S_L', 'S_R'].filter((ch) => {
    const key = ch as keyof ChannelMap;
    return (
      raw[key] - profile.empty[key] <
      Math.max(12, profile.noise[key] * 6, (profile.baseline[key] - profile.empty[key]) * 0.15)
    );
  });
  return missing.length === 2 ? 'unoccupied' : missing.length ? 'poor_contact' : null;
};
export const derivePostureAdvice = (snapshot: DeviceSnapshot): PostureAdvice => {
  const state: PostureState = !snapshot.connected
    ? 'unknown'
    : (snapshot.contactIssue ??
      (!snapshot.calibrated
        ? 'uncalibrated'
        : !snapshot.stable
          ? 'adjusting'
          : (snapshot.postureState ?? 'balanced')));
  return { state, ...POSTURE_ADVICE[state] };
};
