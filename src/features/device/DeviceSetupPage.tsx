import { useEffect, useRef, useState } from 'react';
import type { WellnessApplication } from '../../application/WellnessApplication';
import {
  CHANNEL_LABELS,
  DEVICE_CHANNELS,
  type CalibrationProfile,
  type DeviceStatus,
  type DeviceTelemetry,
  type RawChannelValues,
} from '../../contracts/device';
import {
  createCalibrationProfile,
  createEmptySamples,
  exerciseCalibrationMessage,
  updateExerciseCalibration,
  type CalibrationPhase,
  type CalibrationSamples,
} from '../../domain/calibration';
import type { TrainingModuleId } from '../../domain/training';
import { RefreshIcon } from '../../shared/ui/Icons';
import { TopBar } from '../../shared/ui/TopBar';

type Step = {
  phase?: CalibrationPhase;
  module?: 'pelvic_floor' | 'anal';
  trial?: number;
  part?: 'contract' | 'release';
  seconds: number;
  title: string;
  instruction: string;
};
const CALIBRATION_STEPS: Step[] = [
  { phase: 'empty', seconds: 5, title: '保持空载', instruction: '离开坐垫，不要触碰五个贴片。' },
  {
    phase: 'seated',
    seconds: 15,
    title: '自然坐好',
    instruction:
      '臀下左右位于臀大肌下侧、近大腿根；腿侧左右在大腿斜侧；背部中央使用方片。双脚落地，不必贴紧椅背。',
  },
  {
    phase: 'lean_left',
    seconds: 5,
    title: '轻轻向左',
    instruction: '小幅向左调整，保持臀部在坐垫上。',
  },
  {
    phase: 'lean_right',
    seconds: 5,
    title: '轻轻向右',
    instruction: '小幅向右调整，保持臀部在坐垫上。',
  },
  {
    phase: 'lean_forward',
    seconds: 5,
    title: '身体稍向前',
    instruction: '身体小幅前倾，臀部不离开坐垫。',
  },
  {
    phase: 'lean_back',
    seconds: 5,
    title: '身体稍向后',
    instruction: '小幅后靠，让背部中央形成自然接触，不要用力压紧。',
  },
  {
    phase: 'cross_left',
    seconds: 5,
    title: '左腿轻放在右腿上',
    instruction: '短暂记录左腿翘起的坐姿，保持舒适。',
  },
  {
    phase: 'cross_right',
    seconds: 5,
    title: '右腿轻放在左腿上',
    instruction: '换成右腿翘起，记录另一个姿态参考。',
  },
  {
    phase: 'rest',
    seconds: 10,
    title: '回到中立，完全放松',
    instruction: '放下双腿，双脚落地，回到自然坐姿。',
  },
  ...(['pelvic_floor', 'anal'] as const).flatMap((module) =>
    Array.from({ length: 5 }, (_, trial) => [
      {
        module,
        trial,
        part: 'contract' as const,
        seconds: module === 'anal' ? 5 : 3,
        title:
          (module === 'anal' ? '提肛' : '盆底肌') +
          (trial < 3 ? '示教' : '验证') +
          ' ' +
          (trial < 3 ? trial + 1 : trial - 2),
        instruction:
          module === 'anal'
            ? '轻柔收住并保持，自然呼吸，避免夹臀和挪动身体。'
            : '轻柔向上提，自然呼吸，避免夹臀和挪动身体。',
      },
      {
        module,
        trial,
        part: 'release' as const,
        seconds: 6,
        title: '完全放松',
        instruction: '慢慢松开，充分放松，保持中立坐姿。',
      },
    ]).flat(),
  ),
];
export const DeviceSetupPage = ({
  application,
  onBack,
}: {
  application: WellnessApplication;
  onBack: () => void;
}) => {
  const [telemetry, setTelemetry] = useState<DeviceTelemetry | null>(
    application.device.getLatestTelemetry(),
  );
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [profile, setProfile] = useState<CalibrationProfile | null>(null);
  const [index, setIndex] = useState(-1);
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [steps, setSteps] = useState(CALIBRATION_STEPS);
  const [exerciseOnly, setExerciseOnly] = useState<TrainingModuleId | null>(null);
  const samples = useRef<CalibrationSamples>(createEmptySamples());
  const indexRef = useRef(-1);
  const remainingRef = useRef(0);
  const blockedRef = useRef(false);
  const lastFrame = useRef(0);
  const saturatedSince = useRef<number | null>(null);
  const identity = useRef<{ deviceId: string; layoutVersion: string; bootId: string } | null>(null);
  const targetSamples = (step: Step): RawChannelValues[] => {
    if (step.phase) return samples.current[step.phase];
    const trials = samples.current[step.module!];
    trials[step.trial!] ??= { contract: [], release: [] };
    return trials[step.trial!]![step.part!];
  };
  const refresh = async () => {
    const [nextStatus, nextProfile] = await Promise.all([
      application.device.getStatus(),
      application.device.getCalibration(),
    ]);
    setStatus(nextStatus);
    setProfile(nextProfile);
  };
  useEffect(() => {
    void Promise.all([application.device.getStatus(), application.device.getCalibration()])
      .then(([s, p]) => {
        setStatus(s);
        setProfile(p);
      })
      .catch(() => setError('暂时无法读取设备服务。'));
    const unsubscribe = application.device.subscribeTelemetry((next) => {
      setTelemetry(next);
      lastFrame.current = performance.now();
      saturatedSince.current = next.saturatedChannels.length
        ? (saturatedSince.current ?? performance.now())
        : null;
      const step = steps[indexRef.current];
      if (
        !step ||
        blockedRef.current ||
        next.saturatedChannels.length ||
        remainingRef.current > step.seconds - 1
      )
        return;
      targetSamples(step).push(DEVICE_CHANNELS.map((ch) => next.raw[ch]) as RawChannelValues);
    });
    const poll = window.setInterval(
      () =>
        void application.device
          .getStatus()
          .then(setStatus)
          .catch(() => undefined),
      1000,
    );
    return () => {
      unsubscribe();
      window.clearInterval(poll);
    };
  }, [application, steps]);
  useEffect(() => {
    if (index < 0) return;
    const timer = window.setInterval(() => {
      const latest = application.device.getLatestTelemetry();
      const sameDevice =
        latest &&
        latest.deviceId === identity.current?.deviceId &&
        latest.layoutVersion === identity.current?.layoutVersion;
      const sameBoot = sameDevice && latest.bootId === identity.current?.bootId;
      const healthy =
        performance.now() - lastFrame.current <= 2000 &&
        sameDevice &&
        !latest?.saturatedChannels.length;
      setRecovered(Boolean(healthy));
      if (blockedRef.current) return;
      const saturation =
        saturatedSince.current !== null && performance.now() - saturatedSince.current >= 1000;
      if (!sameBoot || performance.now() - lastFrame.current > 2000 || saturation) {
        blockedRef.current = true;
        setBlocked(true);
        setError(
          saturation
            ? '贴片读数饱和，请调整后重采本步骤。'
            : '数据中断或设备发生变化，请恢复连接后重采本步骤。',
        );
        return;
      }
      // Never advance while pressure data is invalid, including transient saturation.
      if (!healthy) return;
      remainingRef.current -= 0.25;
      setRemaining(Math.ceil(remainingRef.current));
      if (remainingRef.current > 0) return;
      const step = steps[indexRef.current]!;
      if (targetSamples(step).length < 8) {
        blockedRef.current = true;
        setBlocked(true);
        setError('本步骤有效数据不足，请重采。');
        return;
      }
      const next = indexRef.current + 1;
      if (next < steps.length) {
        indexRef.current = next;
        remainingRef.current = steps[next]!.seconds;
        setIndex(next);
        setRemaining(remainingRef.current);
        return;
      }
      indexRef.current = -1;
      setIndex(-1);
      setSaving(true);
      try {
        const p =
          exerciseOnly && profile
            ? updateExerciseCalibration(
                profile,
                exerciseOnly,
                samples.current.rest,
                samples.current[exerciseOnly],
              )
            : createCalibrationProfile(
                identity.current!.deviceId,
                identity.current!.layoutVersion,
                samples.current,
              );
        void application.device
          .saveCalibration(p)
          .then((saved) => {
            setProfile(saved);
            setError('');
            void application.device.getStatus().then(setStatus);
          })
          .catch(() => setError('校准保存失败，请重试。'))
          .finally(() => setSaving(false));
      } catch (e) {
        setError(e instanceof Error ? e.message : '校准失败，请重试。');
        setSaving(false);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [application, index, steps, exerciseOnly, profile]);
  const start = (moduleId?: TrainingModuleId) => {
    const latest = application.device.getLatestTelemetry();
    if (!latest || status?.state === 'offline') {
      setError('请先连接坐垫，再开始校准。');
      return;
    }
    identity.current = {
      deviceId: latest.deviceId,
      layoutVersion: latest.layoutVersion,
      bootId: latest.bootId,
    };
    if (
      moduleId &&
      (!profile ||
        profile.deviceId !== latest.deviceId ||
        profile.layoutVersion !== latest.layoutVersion)
    ) {
      setError('设备或布局已变化，请先完成新布局校准。');
      return;
    }
    const nextSteps = moduleId
      ? [CALIBRATION_STEPS[8]!, ...CALIBRATION_STEPS.filter((s) => s.module === moduleId)]
      : CALIBRATION_STEPS;
    setSteps(nextSteps);
    setExerciseOnly(moduleId ?? null);
    samples.current = createEmptySamples();
    blockedRef.current = false;
    setBlocked(false);
    setError('');
    indexRef.current = 0;
    remainingRef.current = nextSteps[0]!.seconds;
    setIndex(0);
    setRemaining(remainingRef.current);
  };
  const step = steps[index];
  const statusLabel =
    status?.state === 'offline' ? '坐垫离线' : telemetry ? '坐垫已连接' : '等待坐垫数据';
  return (
    <main className="device-page page-tone--clay">
      <TopBar title="设备与校准" onBack={onBack} backLabel="返回" />
      <div className="device-workspace">
        <header className="device-heading">
          <div>
            <p className="eyebrow">五点压力坐垫</p>
            <h1>{statusLabel}</h1>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void refresh().catch(() => setError('读取失败，请确认设备服务已启动。'))}
          >
            <RefreshIcon />
            刷新
          </button>
        </header>
        {error ? (
          <p className="device-error" role="alert">
            {error}
          </p>
        ) : null}
        <section className="device-live-panel" aria-label="五路实时读数">
          <div className="device-live-panel__header">
            <strong>{statusLabel}</strong>
            <small>
              {profile
                ? '新布局已校准'
                : status?.needsRecalibration
                  ? '旧档案需重新校准'
                  : '尚未校准'}
            </small>
          </div>
          <div className="sensor-strip">
            {DEVICE_CHANNELS.map((ch) => (
              <div key={ch} className={(telemetry?.raw[ch] ?? 0) >= 4000 ? 'is-saturated' : ''}>
                <span>{CHANNEL_LABELS[ch]}</span>
                <strong>{telemetry?.raw[ch] ?? 0}</strong>
                <i
                  style={{
                    transform: 'scaleX(' + Math.min(1, (telemetry?.raw[ch] ?? 0) / 4095) + ')',
                  }}
                />
              </div>
            ))}
          </div>
          <p className="device-stream-meta">
            {status?.deviceId ?? '等待设备'} · 丢帧率 {((status?.dropRate ?? 0) * 100).toFixed(1)}%
          </p>
        </section>
        <section className="calibration-panel">
          {step ? (
            <>
              <div className="calibration-progress">
                <i style={{ transform: 'scaleX(' + (index + 1) / steps.length + ')' }} />
              </div>
              <p className="eyebrow">
                步骤 {index + 1} / {steps.length}
              </p>
              <div className="calibration-action">
                <div className="calibration-countdown">
                  {remaining}
                  <small>秒</small>
                </div>
                <div>
                  <h2>{step.title}</h2>
                  <p>{step.instruction}</p>
                </div>
              </div>
              {blocked ? (
                <button
                  className="primary-button"
                  type="button"
                  disabled={!recovered}
                  onClick={() => {
                    const latest = application.device.getLatestTelemetry();
                    if (latest && identity.current) identity.current.bootId = latest.bootId;
                    targetSamples(step).length = 0;
                    remainingRef.current = step.seconds;
                    setRemaining(step.seconds);
                    blockedRef.current = false;
                    setBlocked(false);
                    setError('');
                  }}
                >
                  恢复后重采本步骤
                </button>
              ) : null}
              <button
                className="quiet-button"
                type="button"
                onClick={() => {
                  indexRef.current = -1;
                  setIndex(-1);
                }}
              >
                取消校准
              </button>
            </>
          ) : (
            <>
              <p className="eyebrow">个人参考 · 新五点布局</p>
              <h2>{profile ? '校准档案已经保存' : '用一次引导建立个人参考'}</h2>
              <p>
                臀下两点观察收放，腿侧两点观察姿态，背部中央辅助观察前后变化。左右以坐着的人为准。
              </p>
              <p>
                依次采集空载、自然坐姿、六种姿态，以及两类动作各三次示教和两次验证，全程约三分钟。
              </p>
              {profile ? (
                <>
                  {(['pelvic_floor', 'anal'] as const).map((moduleId) => (
                    <div key={moduleId} className="calibration-exercise">
                      <p>
                        <strong>
                          {moduleId === 'anal' ? '提肛' : '盆底肌'}：
                          {profile.exercises[moduleId]?.evaluationEnabled ? '可评价' : '仅计时'}
                        </strong>
                      </p>
                      <p>{exerciseCalibrationMessage(profile, moduleId)}</p>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={saving || !telemetry || status?.state === 'offline'}
                        onClick={() => start(moduleId)}
                      >
                        {moduleId === 'anal' ? '重采提肛动作' : '重采盆底肌动作'}
                      </button>
                    </div>
                  ))}
                  <p>
                    单独重采约一分钟，保留已有姿态和另一类动作参考。无法区分的姿态只给通用调整提示。
                  </p>
                </>
              ) : null}
              <button
                className="primary-button"
                type="button"
                disabled={saving || !telemetry || status?.state === 'offline'}
                onClick={() => start()}
              >
                {saving ? '正在保存…' : profile ? '重新校准' : '开始引导校准'}
              </button>
            </>
          )}
        </section>
      </div>
    </main>
  );
};
