import { describe, expect, it } from 'vitest';
import type { TrainingSession } from './training';
import { createTrainingSession, getTrainingAudioCue, trainingReducer } from './training';

describe('training state machine', () => {
  it('freezes an interrupted cycle and resumes only after healthy recovery without double counting', () => {
    let session: TrainingSession = {
      ...createTrainingSession('anal'),
      status: 'running' as const,
      phase: 'hold' as const,
      cycle: 3,
      completedCycles: 2,
    };
    let interrupted = trainingReducer(session, {
      type: 'guard',
      issue: { reason: 'poor_contact', message: '调整' },
      ready: false,
    });
    expect(trainingReducer(interrupted, { type: 'tick' })).toEqual(interrupted);
    const reprioritized = trainingReducer(interrupted, {
      type: 'guard',
      issue: { reason: 'offline', message: '检查连接' },
      ready: false,
    });
    expect(reprioritized.interruption?.reason).toBe('offline');
    expect(reprioritized.exceptions.events).toHaveLength(2);
    const corrected = trainingReducer(interrupted, {
      type: 'guard',
      issue: { reason: 'poor_contact', message: '检查左侧臀下' },
      ready: false,
    });
    expect(corrected.interruption?.message).toBe('检查左侧臀下');
    expect(corrected.exceptions.events).toHaveLength(1);
    expect(trainingReducer(interrupted, { type: 'resume' }).status).toBe('interrupted');
    interrupted = trainingReducer(interrupted, { type: 'exception_time', seconds: 4 });
    interrupted = trainingReducer(interrupted, { type: 'guard', issue: null, ready: true });
    const resumed = trainingReducer(interrupted, { type: 'resume' });
    expect(resumed).toMatchObject({
      status: 'running',
      phase: 'reprepare',
      cycle: 3,
      completedCycles: 2,
      cycleAttempt: 2,
      exceptions: { redoCount: 1, events: [{ reason: 'poor_contact', count: 1, seconds: 4 }] },
    });
    session = { ...session, phase: 'complete' };
    expect(
      trainingReducer(session, {
        type: 'guard',
        issue: { reason: 'offline', message: '连接' },
        ready: false,
      }).status,
    ).toBe('running');
  });
  it('branches after two consecutive failed full windows and resets the streak after success', () => {
    const session = {
      ...createTrainingSession('pelvic_floor'),
      status: 'running' as const,
      phase: 'relax' as const,
      remainingSeconds: 1,
    };
    const bad = { contract: 10, matched: 0, relax: 10, recovered: 10 };
    let first = trainingReducer(session, { type: 'tick', observation: bad });
    expect(first).toMatchObject({
      status: 'running',
      completedCycles: 1,
      actionStreak: { contract_unmatched: 1 },
    });
    const second = trainingReducer(
      { ...first, phase: 'relax', remainingSeconds: 1 },
      { type: 'tick', observation: bad },
    );
    expect(second).toMatchObject({
      status: 'interrupted',
      completedCycles: 1,
      cycle: 2,
      interruption: { reason: 'contract_unmatched' },
    });
    first = trainingReducer(
      { ...first, phase: 'relax', remainingSeconds: 1 },
      { type: 'tick', observation: { ...bad, matched: 10 } },
    );
    expect(first.actionStreak.contract_unmatched).toBe(0);
    const releasing = trainingReducer(
      { ...session, actionStreak: { contract_unmatched: 0, release_unrecovered: 1 } },
      { type: 'tick', observation: { contract: 10, matched: 10, relax: 10, recovered: 0 } },
    );
    expect(releasing.interruption?.reason).toBe('release_unrecovered');
  });
  it('does not advance until the user starts', () => {
    const session = createTrainingSession('pelvic_floor');
    expect(trainingReducer(session, { type: 'tick' })).toEqual(session);
    expect(trainingReducer(session, { type: 'start' }).status).toBe('running');
  });

  it('pauses and redoes the current cycle after a three-second preparation', () => {
    let session = createTrainingSession('pelvic_floor');
    session = { ...session, status: 'running', phase: 'hold', remainingSeconds: 2, cycle: 3 };
    session = trainingReducer(session, { type: 'pause' });
    expect(session.status).toBe('paused');

    session = trainingReducer(session, { type: 'resume' });
    expect(session).toMatchObject({
      status: 'running',
      phase: 'reprepare',
      remainingSeconds: 3,
      cycle: 3,
      cycleAttempt: 2,
    });

    session = trainingReducer(session, { type: 'tick' });
    session = trainingReducer(session, { type: 'tick' });
    session = trainingReducer(session, { type: 'tick' });
    expect(session).toMatchObject({ phase: 'contract', remainingSeconds: 3, cycle: 3 });
  });

  it('counts a cycle only when rest finishes', () => {
    let session = createTrainingSession('anal');
    session = { ...session, status: 'running', phase: 'rest', remainingSeconds: 1, cycle: 1 };
    session = trainingReducer(session, { type: 'tick' });
    expect(session).toMatchObject({ completedCycles: 1, cycle: 2, phase: 'contract' });
  });

  it('uses short spoken cues for two and three second phases', () => {
    const pelvic = createTrainingSession('pelvic_floor');
    const anal = createTrainingSession('anal');

    expect(getTrainingAudioCue({ ...pelvic, phase: 'contract' })).toBe('轻轻上提');
    expect(getTrainingAudioCue({ ...pelvic, phase: 'relax' })).toBe('慢慢松开');
    expect(getTrainingAudioCue({ ...pelvic, phase: 'reprepare' })).toBe('重新坐好');
    expect(getTrainingAudioCue({ ...anal, phase: 'contract' })).toBe('轻轻收住');
  });

  it('waits for the user between pelvic training groups', () => {
    let session = createTrainingSession('pelvic_floor');
    session = {
      ...session,
      status: 'running',
      phase: 'relax',
      remainingSeconds: 1,
      cycle: session.targetCycles,
      completedCycles: session.targetCycles - 1,
    };
    session = trainingReducer(session, { type: 'tick' });
    expect(session).toMatchObject({ status: 'between_groups', completedGroups: 1 });
    session = trainingReducer(session, { type: 'tick' });
    expect(session.status).toBe('between_groups');
    session = trainingReducer(session, { type: 'next_group' });
    expect(session).toMatchObject({ status: 'running', group: 2, cycle: 1, phase: 'reprepare' });
  });
});
