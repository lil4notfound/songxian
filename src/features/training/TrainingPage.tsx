import { useEffect, useRef, useState } from 'react';
import type { AudioSettings } from '../../application/ports';
import type { WellnessApplication } from '../../application/WellnessApplication';
import type { EvaluationMode } from '../../contracts/training';
import { advanceGuard, createGuard, deriveTrainingIssue } from '../../domain/trainingGuard';
import { InterruptionDialog } from './InterruptionDialog';
import type { CalibrationProfile } from '../../contracts/device';
import {
  stageGoals,
  stageLabels,
  type SensorMetrics,
  type TrainingPlan,
  type TrainingPrescription,
  type TrainingStage,
} from '../../contracts/training';
import { getModule } from '../../domain/modules';
import {
  getTrainingAudioCue,
  getTrainingCue,
  getTrainingPhase,
  type TrainingModuleId,
  type TrainingSession,
} from '../../domain/training';
import { calculateSensorMetrics } from '../../domain/trainingPlan';
import {
  evaluateTrainingSignal,
  exerciseCalibrationMessage,
  type TrainingSignalState,
} from '../../domain/calibration';
import {
  CalendarIcon,
  DeviceIcon,
  LockIcon,
  PauseIcon,
  SoundIcon,
  StopIcon,
} from '../../shared/ui/Icons';
import { StartButton } from '../../shared/ui/StartButton';
import { StringVisual } from '../../shared/ui/StringVisual';
import { TopBar } from '../../shared/ui/TopBar';
import { AudioSheet } from '../audio/AudioSheet';
import { PauseDialog } from './PauseDialog';
import { useTrainingSession } from './useTrainingSession';

export type TrainingFinishPayload = {
  session: TrainingSession;
  recordId: string | null;
  metrics: SensorMetrics | null;
  evaluationMode: EvaluationMode;
};

type TrainingPageProps = {
  moduleId: TrainingModuleId;
  application: WellnessApplication;
  onFinish: (payload: TrainingFinishPayload) => void;
  onOpenRecords: () => void;
  onOpenDevice: () => void;
};

const stageOrder: TrainingStage[] = ['beginner', 'intermediate', 'advanced'];

const StageRail = ({
  plan,
  onSelect,
  onDemoUnlock,
}: {
  plan: TrainingPlan;
  onSelect: (stage: TrainingStage) => void;
  onDemoUnlock?: (stage: 'intermediate' | 'advanced', enabled: boolean) => void;
}) => (
  <>
    <section className="stage-rail" aria-label="训练阶段">
      {stageOrder.map((stage) => {
        const unlocked = plan.unlockedStages.includes(stage);
        const active = plan.selectedStage === stage;
        return (
          <button
            key={stage}
            type="button"
            className={active ? 'is-active' : ''}
            disabled={!unlocked}
            aria-pressed={active}
            onClick={() => onSelect(stage)}
          >
            <span>{stageLabels[stage]}</span>
            {!unlocked ? <LockIcon /> : null}
          </button>
        );
      })}
    </section>
    {onDemoUnlock ? (
      <details className="demo-unlocks">
        <summary>提前解锁后续训练</summary>
        <div className="demo-unlocks__actions">
          {(['intermediate', 'advanced'] as const).map((stage) => {
            const enabled = plan.demonstrationUnlockedStages?.includes(stage) ?? false;
            return (
              <button
                key={stage}
                type="button"
                className="quiet-button"
                onClick={() => onDemoUnlock(stage, !enabled)}
              >
                {enabled ? `取消${stageLabels[stage]}提前解锁` : `解锁${stageLabels[stage]}训练`}
              </button>
            );
          })}
        </div>
      </details>
    ) : null}
  </>
);

const TopActions = ({
  audioEnabled,
  onRecords,
  onAudio,
  recordsDisabled,
  onDevice,
}: {
  audioEnabled: boolean;
  onRecords: () => void;
  onAudio: () => void;
  recordsDisabled: boolean;
  onDevice: () => void;
}) => (
  <div className="top-actions">
    <button
      className="icon-button"
      type="button"
      onClick={onDevice}
      disabled={recordsDisabled}
      aria-label="设备与校准"
    >
      <DeviceIcon />
    </button>
    <button
      className="icon-button"
      type="button"
      onClick={onRecords}
      disabled={recordsDisabled}
      aria-label="训练记录"
    >
      <CalendarIcon />
    </button>
    <button className="icon-button" type="button" onClick={onAudio} aria-label="声音设置">
      <SoundIcon muted={!audioEnabled} />
    </button>
  </div>
);

const TrainingRunner = ({
  moduleId,
  application,
  prescription,
  plan,
  onSelectStage,
  onDemoUnlock,
  onFinish,
  onOpenRecords,
  onOpenDevice,
}: TrainingPageProps & {
  prescription?: TrainingPrescription;
  plan?: TrainingPlan;
  onSelectStage?: (stage: TrainingStage) => void;
  onDemoUnlock?: (stage: 'intermediate' | 'advanced', enabled: boolean) => void;
}) => {
  const module = getModule(moduleId);
  const signal = useRef({ contract: 0, matched: 0, relax: 0, recovered: 0 });
  const totals = useRef({ contract: 0, matched: 0, relax: 0, recovered: 0 });
  const [evaluationMode, setEvaluationMode] = useState<EvaluationMode>('sensor');
  const [modeChoice, setModeChoice] = useState(false);
  const { session, dispatch } = useTrainingSession(moduleId, prescription, () =>
    evaluationMode === 'sensor' ? { ...signal.current } : undefined,
  );
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  const [audio, setAudio] = useState<AudioSettings>(() => application.audio.getSettings());
  const [audioOpen, setAudioOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const [recordId, setRecordId] = useState<string | null>(null);
  const [calibration, setCalibration] = useState<CalibrationProfile | null>(null);
  const [signalState, setSignalState] = useState<TrainingSignalState>('uncalibrated');
  const lastSpokenPhase = useRef('');
  const finishSent = useRef(false);
  const completedRef = useRef(0);
  const cue = getTrainingCue(session);
  const audioCue = getTrainingAudioCue(session);
  const phase = getTrainingPhase(session);
  const progress = phase.seconds > 0 ? 1 - session.remainingSeconds / phase.seconds : 1;

  useEffect(() => {
    void application.device
      .getCalibration()
      .then(setCalibration)
      .catch(() => setCalibration(null));
  }, [application]);

  useEffect(() => {
    let latest = application.device.getLatestTelemetry();
    let lastReceived = latest?.snapshot.connected ? performance.now() : Number.NEGATIVE_INFINITY;
    let guard = createGuard();
    let lastInterruption = sessionRef.current.interruption;
    let lastKey = '';
    const unsubscribe = application.device.subscribeTelemetry((telemetry) => {
      latest = telemetry;
      if (telemetry.snapshot.connected) lastReceived = performance.now();
      const current = sessionRef.current;
      if (
        current.status !== 'running' ||
        evaluationMode !== 'sensor' ||
        !calibration?.exercises[moduleId]?.evaluationEnabled
      )
        return;
      const issue = deriveTrainingIssue(telemetry, calibration, moduleId, true);
      if (issue) return;
      const relaxing = ['release', 'relax', 'rest'].includes(current.phase);
      const next = evaluateTrainingSignal(moduleId, telemetry.filteredRaw, calibration, relaxing);
      setSignalState(next);
      if (['contract', 'hold'].includes(current.phase)) {
        signal.current.contract += 1;
        if (next === 'matched') signal.current.matched += 1;
      }
      if (relaxing) {
        signal.current.relax += 1;
        if (next === 'released') signal.current.recovered += 1;
      }
    });
    const timer = window.setInterval(() => {
      const now = performance.now();
      const currentInterruption =
        sessionRef.current.status === 'interrupted' ? sessionRef.current.interruption : null;
      if (currentInterruption && currentInterruption !== lastInterruption) {
        guard = { ...guard, healthySince: null, ready: false };
      }
      lastInterruption = currentInterruption;
      const candidate = deriveTrainingIssue(
        latest,
        calibration,
        moduleId,
        now - lastReceived <= 2000,
      );
      guard = advanceGuard(guard, candidate, now);
      const key = JSON.stringify([guard.issue, guard.ready]);
      if (
        key !== lastKey ||
        (guard.issue && sessionRef.current.status === 'running') ||
        (sessionRef.current.status === 'interrupted' &&
          sessionRef.current.recoveryReady !== guard.ready)
      ) {
        lastKey = key;
        dispatch({ type: 'guard', issue: guard.issue, ready: guard.ready });
      }
    }, 250);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [application, calibration, moduleId, evaluationMode, dispatch]);

  useEffect(() => {
    if (session.completedCycles > completedRef.current) {
      for (const key of ['contract', 'matched', 'relax', 'recovered'] as const)
        totals.current[key] += signal.current[key];
      completedRef.current = session.completedCycles;
    }
    signal.current = { contract: 0, matched: 0, relax: 0, recovered: 0 };
  }, [session.group, session.cycle, session.cycleAttempt, session.completedCycles]);

  useEffect(() => {
    if (session.status !== 'interrupted' || !session.interruption) return;
    application.audio.stop();
    void application.audio.speak(session.interruption.message);
    const timer = window.setInterval(() => dispatch({ type: 'exception_time', seconds: 1 }), 1000);
    return () => {
      window.clearInterval(timer);
      application.audio.stop();
    };
  }, [application, dispatch, session.status, session.interruption]);

  useEffect(() => {
    if (session.status !== 'finished' || finishSent.current) return;
    finishSent.current = true;
    const totalCycles = session.targetGroups * session.targetCycles;
    const metrics =
      evaluationMode === 'sensor' && totals.current.contract > 0 && totals.current.relax > 0
        ? calculateSensorMetrics(
            (totals.current.matched / totals.current.contract) * 100,
            (session.completedCycles / totalCycles) * 100,
            (totals.current.recovered / totals.current.relax) * 100,
          )
        : null;
    onFinish({ session, recordId, metrics, evaluationMode });
  }, [moduleId, onFinish, recordId, session, evaluationMode]);

  useEffect(() => {
    if (session.status !== 'running') return;
    const speechKey = `${session.phase}-${session.group}-${session.cycle}-${session.cycleAttempt}-${phase.label}`;
    if (speechKey === lastSpokenPhase.current) return;
    lastSpokenPhase.current = speechKey;
    void application.audio.speak(audioCue);
  }, [
    application,
    audioCue,
    phase.label,
    session.cycle,
    session.cycleAttempt,
    session.group,
    session.phase,
    session.status,
  ]);

  useEffect(() => {
    if (session.status !== 'running' && session.status !== 'interrupted') application.audio.stop();
  }, [application, session.status]);

  const stop = () => {
    application.audio.stop();
    dispatch({ type: 'stop' });
  };

  const start = async (timerMode = false) => {
    if (!timerMode && !calibration) {
      setModeChoice(true);
      return;
    }
    const mode =
      timerMode || !calibration?.exercises[moduleId]?.evaluationEnabled ? 'timer' : 'sensor';
    setEvaluationMode(mode);
    setModeChoice(false);
    setStarting(true);
    setStartError('');
    try {
      {
        const requestId = application.createRequestId();
        const record = await application.training.startSession({
          requestId,
          moduleId,
          evaluationMode: mode,
          stage: prescription?.stage ?? null,
          prescriptionVersion: prescription?.version ?? 'anal-basic-v1',
          startedAt: new Date().toISOString(),
        });
        setRecordId(record.id);
      }
      lastSpokenPhase.current = `${session.phase}-${session.group}-${session.cycle}-${session.cycleAttempt}-${phase.label}`;
      void application.audio.speak(audioCue);
      dispatch({ type: 'start' });
    } catch {
      setStartError('暂时无法保存训练记录，请重试。');
    } finally {
      setStarting(false);
    }
  };

  const isIdle = session.status === 'idle';
  const isGroupBreak = session.status === 'between_groups';

  return (
    <main className={`training-page page-tone--${module.tone}`}>
      <TopBar
        title={module.title}
        action={
          <TopActions
            audioEnabled={audio.enabled}
            onRecords={onOpenRecords}
            onAudio={() => setAudioOpen(true)}
            recordsDisabled={session.status !== 'idle' && session.status !== 'finished'}
            onDevice={onOpenDevice}
          />
        }
      />

      {plan && isIdle && onSelectStage ? (
        <StageRail plan={plan} onSelect={onSelectStage} onDemoUnlock={onDemoUnlock} />
      ) : null}

      <section className="training-stage" aria-live="polite">
        <div className="training-round">
          {moduleId === 'pelvic_floor' ? (
            <>
              <span>
                第 {session.group} / {session.targetGroups} 组
              </span>
              <span>
                本组 {session.cycle} / {session.targetCycles}
              </span>
            </>
          ) : (
            <>
              <span>第 {session.cycle} 轮</span>
              <span>{session.completedCycles} / 5 已完成</span>
            </>
          )}
        </div>

        <div className="training-focus">
          <p className="eyebrow">
            {isIdle && plan
              ? `${stageLabels[plan.selectedStage]} · ${stageGoals[plan.selectedStage]}`
              : isIdle
                ? '尚未开始'
                : isGroupBreak
                  ? `已完成 ${session.completedGroups} 组`
                  : session.phase === 'reprepare'
                    ? '本次收缩将重新开始'
                    : '跟随节奏'}
          </p>
          <h1>{phase.label}</h1>
          {isIdle ? (
            <StartButton
              ariaLabel={`开始${module.title}`}
              onClick={() => void start()}
              disabled={starting || modeChoice}
              label={starting ? '准备中' : '开始'}
            />
          ) : isGroupBreak ? (
            <StartButton
              ariaLabel={`开始第 ${session.group + 1} 组`}
              onClick={() => dispatch({ type: 'next_group' })}
              label="下一组"
            />
          ) : (
            <div className="countdown" aria-label={`剩余 ${session.remainingSeconds} 秒`}>
              <span>{session.remainingSeconds}</span>
              <small>秒</small>
            </div>
          )}
          <StringVisual
            tone={module.tone}
            active={session.status === 'running' && !['relax', 'rest'].includes(session.phase)}
          />
          <p className="training-cue">{cue}</p>
        </div>

        {!isGroupBreak ? (
          <div className="phase-progress" aria-hidden="true">
            <span style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
          </div>
        ) : null}

        {!isIdle && !isGroupBreak ? (
          <div className={`feedback-pill feedback-pill--${signalState}`}>
            <span aria-hidden="true" />
            <div>
              <strong>
                {signalState === 'matched'
                  ? '压力模式接近个人示教参考'
                  : signalState === 'released'
                    ? '已经回到放松参考'
                    : signalState === 'unmatched'
                      ? '收缩尚未接近个人参考，保持轻柔'
                      : signalState === 'not_released'
                        ? '留意完全放松，让压力回落'
                        : evaluationMode === 'timer'
                          ? '计时模式：未评价动作'
                          : '等待本轮收缩或放松'}
              </strong>
              <small>
                {evaluationMode === 'timer'
                  ? '完成量会记录，动作评价不可用'
                  : signalState === 'uncalibrated'
                    ? '准备时不评价动作'
                    : '仅比较外部压力模式，不代表医学诊断'}
              </small>
            </div>
          </div>
        ) : null}
      </section>

      {!isIdle && !isGroupBreak ? (
        <div className="training-controls">
          <button
            type="button"
            className="control-button"
            onClick={() => {
              application.audio.stop();
              dispatch({ type: 'pause' });
            }}
          >
            <PauseIcon />
            <span>暂停</span>
          </button>
          <button type="button" className="control-button control-button--stop" onClick={stop}>
            <StopIcon />
            <span>不舒服 / 停止</span>
          </button>
        </div>
      ) : null}

      {startError ? (
        <p className="training-action-notice" role="alert">
          {startError}
        </p>
      ) : null}
      {session.actionNotice ? (
        <p className="training-action-notice" role="status">
          {session.actionNotice}
        </p>
      ) : null}
      {modeChoice ? (
        <section className="mode-choice" role="region" aria-label="选择训练评价模式">
          <h2>尚未建立有效动作参考</h2>
          <p>{exerciseCalibrationMessage(calibration, moduleId)}</p>
          <p>可以跟随计时带练并保存记录、查看总结；计时模式不评价动作。</p>
          <button className="secondary-button" type="button" onClick={onOpenDevice}>
            去校准
          </button>
          <button className="primary-button" type="button" onClick={() => void start(true)}>
            计时带练
          </button>
        </section>
      ) : null}
      {session.status === 'interrupted' && session.interruption ? (
        <InterruptionDialog
          tone={module.tone}
          issue={session.interruption}
          ready={session.recoveryReady}
          onResume={() => dispatch({ type: 'resume' })}
          onStop={stop}
        />
      ) : null}
      {session.status === 'paused' ? (
        <PauseDialog
          tone={module.tone}
          cycle={session.cycle}
          finishing={session.pauseMode === 'finish'}
          onResume={() => dispatch({ type: 'resume' })}
          onStop={stop}
        />
      ) : null}

      {audioOpen ? (
        <AudioSheet
          application={application}
          sampleText={audioCue}
          onClose={() => setAudioOpen(false)}
          onChange={setAudio}
        />
      ) : null}
    </main>
  );
};

export const TrainingPage = (props: TrainingPageProps) => {
  const { moduleId, application } = props;
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [loading, setLoading] = useState(moduleId === 'pelvic_floor');
  const [planError, setPlanError] = useState('');

  useEffect(() => {
    if (moduleId !== 'pelvic_floor') return;
    let active = true;
    void application.training.getPlan().then((next) => {
      if (active) {
        setPlan(next);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [application, moduleId]);

  const selectStage = async (stage: TrainingStage) => {
    setLoading(true);
    setPlanError('');
    try {
      setPlan(await application.training.getPlan(stage));
    } catch {
      setPlanError('暂时无法切换课程，请重试。');
    } finally {
      setLoading(false);
    }
  };

  const demoUnlock = async (stage: 'intermediate' | 'advanced', enabled: boolean) => {
    setLoading(true);
    setPlanError('');
    try {
      setPlan(await application.training.setDemoUnlock(stage, enabled));
    } catch {
      setPlanError('解锁失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  if (moduleId === 'pelvic_floor' && (loading || !plan)) {
    return (
      <main className="training-page page-tone--moss">
        <TopBar title="盆底肌训练" />
        <div className="training-loading" role="status">
          正在准备今天的训练…
        </div>
      </main>
    );
  }

  return (
    <>
      {planError ? (
        <p className="training-action-notice" role="alert">
          {planError}
        </p>
      ) : null}
      <TrainingRunner
        key={plan?.prescription.version ?? 'anal'}
        {...props}
        prescription={plan?.prescription}
        plan={plan ?? undefined}
        onSelectStage={moduleId === 'pelvic_floor' ? (stage) => void selectStage(stage) : undefined}
        onDemoUnlock={
          moduleId === 'pelvic_floor'
            ? (stage, enabled) => void demoUnlock(stage, enabled)
            : undefined
        }
      />
    </>
  );
};
