import type { TrainingPrescription, TrainingStage } from '../contracts/training';
import { getDefaultPrescription } from './trainingPlan';
import { emptyExceptionStats, type ExceptionStats } from '../contracts/training';
import {
  ACTION_ISSUES,
  cycleProblem,
  type CycleObservation,
  type TrainingIssue,
} from './trainingGuard';
import type { ModuleId } from './modules';

export type TrainingModuleId = Exclude<ModuleId, 'posture'>;
export type TrainingPhase =
  | 'prepare'
  | 'contract'
  | 'hold'
  | 'release'
  | 'relax'
  | 'rest'
  | 'reprepare'
  | 'group_break'
  | 'complete';
export type TrainingStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'interrupted'
  | 'between_groups'
  | 'finished';
export type TrainingPattern = 'standard' | 'pulse' | 'long' | null;

export type TrainingSession = {
  moduleId: TrainingModuleId;
  stage: TrainingStage | null;
  prescription: TrainingPrescription | null;
  phase: TrainingPhase;
  status: TrainingStatus;
  pattern: TrainingPattern;
  remainingSeconds: number;
  elapsedSeconds: number;
  group: number;
  targetGroups: number;
  completedGroups: number;
  cycle: number;
  targetCycles: number;
  completedCycles: number;
  cycleAttempt: number;
  pauseMode: 'cycle' | 'finish' | null;
  endReason: 'complete' | 'stopped' | null;
  prescriptionVersion: string;
  interruption: TrainingIssue | null;
  recoveryReady: boolean;
  exceptions: ExceptionStats;
  actionStreak: { contract_unmatched: number; release_unrecovered: number };
  actionNotice: string | null;
};

export type TrainingAction =
  | { type: 'start' }
  | { type: 'tick'; observation?: CycleObservation }
  | { type: 'guard'; issue: TrainingIssue | null; ready: boolean }
  | { type: 'exception_time'; seconds: number }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'next_group' }
  | { type: 'stop' };

type PhaseDefinition = { label: string; seconds: number; cue: string; audioCue: string };

const LEGACY_ANAL_PHASES: Record<
  Extract<
    TrainingPhase,
    'prepare' | 'contract' | 'hold' | 'release' | 'rest' | 'reprepare' | 'complete'
  >,
  PhaseDefinition
> = {
  prepare: {
    label: '准备',
    seconds: 15,
    cue: '坐稳，双脚有支撑，保持自然呼吸',
    audioCue: '坐稳，保持自然呼吸',
  },
  contract: {
    label: '轻轻收住',
    seconds: 2,
    cue: '像忍住放屁一样轻轻收住肛门，自然呼吸',
    audioCue: '轻轻收住',
  },
  hold: { label: '保持', seconds: 3, cue: '轻柔保持，继续自然呼吸', audioCue: '保持' },
  release: { label: '慢慢松开', seconds: 2, cue: '慢慢松开，不要急', audioCue: '慢慢松开' },
  rest: { label: '完全放松', seconds: 6, cue: '完全放松，准备下一轮', audioCue: '完全放松' },
  reprepare: {
    label: '重新准备',
    seconds: 3,
    cue: '重新坐好，本轮会从头开始',
    audioCue: '重新坐好',
  },
  complete: { label: '完成', seconds: 5, cue: '很好，继续放松，自然呼吸', audioCue: '完成，放松' },
};

const getPelvicPattern = (
  prescription: TrainingPrescription,
  group: number,
  cycle: number,
): Exclude<TrainingPattern, null> => {
  if (prescription.mode === 'standard') return 'standard';
  const pulseFirst = group % 2 === 1;
  const firstBlock = cycle <= prescription.pulseRepetitions;
  return pulseFirst === firstBlock ? 'pulse' : 'long';
};

export const getTrainingPhase = (session: TrainingSession): PhaseDefinition => {
  if (session.moduleId === 'anal') {
    const phase =
      session.phase === 'relax' || session.phase === 'group_break' ? 'rest' : session.phase;
    return LEGACY_ANAL_PHASES[phase];
  }
  const prescription = session.prescription ?? getDefaultPrescription('beginner');
  switch (session.phase) {
    case 'prepare':
      return {
        label: '准备',
        seconds: prescription.prepareSeconds,
        cue: '坐稳，双脚有支撑，保持自然呼吸',
        audioCue: '坐稳，保持自然呼吸',
      };
    case 'reprepare':
      return {
        label: '重新准备',
        seconds: prescription.reprepareSeconds,
        cue: '重新坐好，本次收缩会从头开始',
        audioCue: '重新坐好',
      };
    case 'contract': {
      const pattern =
        session.pattern ?? getPelvicPattern(prescription, session.group, session.cycle);
      const seconds =
        prescription.mode === 'standard'
          ? prescription.contractionSeconds
          : pattern === 'pulse'
            ? prescription.pulseContractSeconds
            : prescription.longHoldSeconds;
      return {
        label: pattern === 'pulse' ? '快速收缩' : pattern === 'long' ? '长保持' : '轻轻收缩',
        seconds,
        cue: pattern === 'pulse' ? '轻快收住，保持呼吸' : '轻轻向上提，保持自然呼吸',
        audioCue: pattern === 'long' ? '保持' : '轻轻上提',
      };
    }
    case 'relax': {
      const pattern =
        session.pattern ?? getPelvicPattern(prescription, session.group, session.cycle);
      const seconds =
        prescription.mode === 'standard'
          ? prescription.relaxationSeconds
          : pattern === 'pulse'
            ? prescription.pulseRelaxSeconds
            : prescription.longRelaxSeconds;
      const releasing = seconds - session.remainingSeconds < Math.min(2, seconds);
      return {
        label: releasing ? '慢慢松开' : '完全放松',
        seconds,
        cue: releasing ? '慢慢松开，不要急' : '完全放松，准备下一次',
        audioCue: releasing ? '慢慢松开' : '完全放松',
      };
    }
    case 'group_break':
      return {
        label: '组间休息',
        seconds: 1,
        cue: '完全放松。准备好后，再开始下一组。',
        audioCue: '完全放松',
      };
    case 'complete':
      return {
        label: '完成',
        seconds: prescription.completeSeconds,
        cue: '今天的训练完成了，继续放松，自然呼吸',
        audioCue: '完成，放松',
      };
    case 'hold':
    case 'release':
    case 'rest':
      return LEGACY_ANAL_PHASES[session.phase];
  }
};

const nextPelvicPhase = (session: TrainingSession): TrainingSession => {
  const prescription = session.prescription ?? getDefaultPrescription('beginner');
  switch (session.phase) {
    case 'prepare':
    case 'reprepare': {
      const pattern = getPelvicPattern(prescription, session.group, session.cycle);
      const next = { ...session, phase: 'contract' as const, pattern };
      return { ...next, remainingSeconds: getTrainingPhase(next).seconds };
    }
    case 'contract': {
      const next = { ...session, phase: 'relax' as const };
      return { ...next, remainingSeconds: getTrainingPhase(next).seconds };
    }
    case 'relax': {
      const completedCycles = session.completedCycles + 1;
      if (session.cycle < session.targetCycles) {
        const next = {
          ...session,
          completedCycles,
          cycle: session.cycle + 1,
          cycleAttempt: 1,
          phase: 'contract' as const,
        };
        const patterned = {
          ...next,
          pattern: getPelvicPattern(prescription, next.group, next.cycle),
        };
        return { ...patterned, remainingSeconds: getTrainingPhase(patterned).seconds };
      }
      const completedGroups = session.completedGroups + 1;
      if (session.group < session.targetGroups) {
        return {
          ...session,
          completedCycles,
          completedGroups,
          status: 'between_groups',
          phase: 'group_break',
          pattern: null,
          remainingSeconds: 0,
        };
      }
      const next = {
        ...session,
        completedCycles,
        completedGroups,
        phase: 'complete' as const,
        pattern: null,
      };
      return { ...next, remainingSeconds: getTrainingPhase(next).seconds };
    }
    case 'complete':
      return { ...session, status: 'finished', endReason: 'complete', remainingSeconds: 0 };
    case 'group_break':
    case 'hold':
    case 'release':
    case 'rest':
      return session;
  }
};

const nextAnalPhase = (session: TrainingSession): TrainingSession => {
  switch (session.phase) {
    case 'prepare':
    case 'reprepare':
      return { ...session, phase: 'contract', remainingSeconds: 2 };
    case 'contract':
      return { ...session, phase: 'hold', remainingSeconds: 3 };
    case 'hold':
      return { ...session, phase: 'release', remainingSeconds: 2 };
    case 'release':
      return { ...session, phase: 'rest', remainingSeconds: 6 };
    case 'rest': {
      const completedCycles = session.completedCycles + 1;
      if (completedCycles === 5)
        return { ...session, completedCycles, phase: 'complete', remainingSeconds: 5 };
      return {
        ...session,
        completedCycles,
        cycle: session.cycle + 1,
        cycleAttempt: 1,
        phase: 'contract',
        remainingSeconds: 2,
      };
    }
    case 'complete':
      return { ...session, status: 'finished', endReason: 'complete', remainingSeconds: 0 };
    case 'relax':
    case 'group_break':
      return session;
  }
};

export const createTrainingSession = (
  moduleId: TrainingModuleId,
  prescription?: TrainingPrescription,
): TrainingSession => {
  if (moduleId === 'anal') {
    return {
      moduleId,
      stage: null,
      prescription: null,
      phase: 'prepare',
      status: 'idle',
      pattern: null,
      remainingSeconds: 15,
      elapsedSeconds: 0,
      group: 1,
      targetGroups: 1,
      completedGroups: 0,
      cycle: 1,
      targetCycles: 5,
      completedCycles: 0,
      cycleAttempt: 1,
      pauseMode: null,
      endReason: null,
      prescriptionVersion: 'anal-basic-v1',
      interruption: null,
      recoveryReady: false,
      exceptions: emptyExceptionStats(),
      actionStreak: { contract_unmatched: 0, release_unrecovered: 0 },
      actionNotice: null,
    };
  }
  const plan = prescription ?? getDefaultPrescription('beginner');
  return {
    moduleId,
    stage: plan.stage,
    prescription: plan,
    phase: 'prepare',
    status: 'idle',
    pattern: null,
    remainingSeconds: plan.prepareSeconds,
    elapsedSeconds: 0,
    group: 1,
    targetGroups: plan.targetGroups,
    completedGroups: 0,
    cycle: 1,
    targetCycles: plan.cyclesPerGroup,
    completedCycles: 0,
    cycleAttempt: 1,
    pauseMode: null,
    endReason: null,
    prescriptionVersion: plan.version,
    interruption: null,
    recoveryReady: false,
    exceptions: emptyExceptionStats(),
    actionStreak: { contract_unmatched: 0, release_unrecovered: 0 },
    actionNotice: null,
  };
};

export const trainingReducer = (
  session: TrainingSession,
  action: TrainingAction,
): TrainingSession => {
  switch (action.type) {
    case 'guard': {
      if (session.status === 'finished') return session;
      const next = { ...session, recoveryReady: action.ready };
      if (
        action.issue &&
        ((session.status === 'running' && session.phase !== 'complete') ||
          (session.status === 'interrupted' &&
            session.interruption?.reason !== action.issue.reason))
      ) {
        const events = session.exceptions.events.map((e) => ({ ...e }));
        const entry = events.find((e) => e.reason === action.issue!.reason);
        if (entry) entry.count += 1;
        else events.push({ reason: action.issue.reason, count: 1, seconds: 0 });
        return {
          ...next,
          status: 'interrupted',
          interruption: action.issue,
          exceptions: { ...session.exceptions, events },
        };
      }
      if (
        session.status === 'interrupted' &&
        action.issue &&
        session.interruption?.message !== action.issue.message
      ) {
        return { ...next, interruption: action.issue };
      }
      return next;
    }
    case 'exception_time':
      if (session.status !== 'interrupted' || !session.interruption) return session;
      return {
        ...session,
        exceptions: {
          ...session.exceptions,
          events: session.exceptions.events.map((e) =>
            e.reason === session.interruption!.reason
              ? { ...e, seconds: e.seconds + action.seconds }
              : e,
          ),
        },
      };
    case 'start':
      return session.status === 'idle' ? { ...session, status: 'running' } : session;
    case 'next_group':
      if (session.status !== 'between_groups' || !session.prescription) return session;
      return {
        ...session,
        status: 'running',
        group: session.group + 1,
        cycle: 1,
        cycleAttempt: 1,
        phase: 'reprepare',
        pattern: null,
        remainingSeconds: session.prescription.reprepareSeconds,
      };
    case 'tick':
      if (session.status !== 'running') return session;
      if (session.remainingSeconds > 1) {
        return {
          ...session,
          remainingSeconds: session.remainingSeconds - 1,
          elapsedSeconds: session.elapsedSeconds + 1,
        };
      }
      if ((session.phase === 'relax' || session.phase === 'rest') && action.observation) {
        const problem = cycleProblem(action.observation);
        const actionStreak = { contract_unmatched: 0, release_unrecovered: 0 };
        if (problem) actionStreak[problem] = session.actionStreak[problem] + 1;
        const evaluated = {
          ...session,
          actionStreak,
          actionNotice:
            problem === 'contract_unmatched'
              ? '本轮收缩未接近个人参考，下一轮轻柔尝试。'
              : problem === 'release_unrecovered'
                ? '本轮放松未回到参考，下一轮留意充分松开。'
                : null,
        };
        if (problem && actionStreak[problem] >= 2) {
          const interrupted = trainingReducer(evaluated, {
            type: 'guard',
            issue: ACTION_ISSUES[problem],
            ready: false,
          });
          return { ...interrupted, elapsedSeconds: session.elapsedSeconds + 1 };
        }
        session = evaluated;
      }
      return session.moduleId === 'pelvic_floor'
        ? nextPelvicPhase({ ...session, elapsedSeconds: session.elapsedSeconds + 1 })
        : nextAnalPhase({ ...session, elapsedSeconds: session.elapsedSeconds + 1 });
    case 'pause':
      if (session.status !== 'running') return session;
      return {
        ...session,
        status: 'paused',
        pauseMode: session.phase === 'complete' ? 'finish' : 'cycle',
      };
    case 'resume':
      if (session.status === 'interrupted') {
        if (!session.recoveryReady) return session;
        return {
          ...session,
          status: 'running',
          phase: 'reprepare',
          pattern: null,
          remainingSeconds: session.prescription?.reprepareSeconds ?? 3,
          cycleAttempt: session.cycleAttempt + 1,
          interruption: null,
          actionStreak: { contract_unmatched: 0, release_unrecovered: 0 },
          actionNotice: null,
          exceptions: { ...session.exceptions, redoCount: session.exceptions.redoCount + 1 },
        };
      }
      if (session.status !== 'paused') return session;
      if (session.pauseMode === 'finish') return { ...session, status: 'running', pauseMode: null };
      return {
        ...session,
        status: 'running',
        phase: 'reprepare',
        pattern: null,
        remainingSeconds: session.prescription?.reprepareSeconds ?? 3,
        cycleAttempt: session.cycleAttempt + 1,
        pauseMode: null,
        actionStreak: { contract_unmatched: 0, release_unrecovered: 0 },
        actionNotice: null,
        exceptions: { ...session.exceptions, redoCount: session.exceptions.redoCount + 1 },
      };
    case 'stop':
      return {
        ...session,
        status: 'finished',
        endReason: 'stopped',
        pauseMode: null,
        interruption: null,
      };
  }
};

export const getTrainingCue = (session: TrainingSession): string => getTrainingPhase(session).cue;
export const getTrainingAudioCue = (session: TrainingSession): string =>
  getTrainingPhase(session).audioCue;
