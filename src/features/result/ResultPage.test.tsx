import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ResultPage } from './ResultPage';
import { makeTestApplication } from '../../test/testApplication';
import { createTrainingSession } from '../../domain/training';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each(['pelvic_floor', 'anal'] as const)(
  'saves a completed %s timer session and shows its summary when randomUUID is unavailable',
  async (moduleId) => {
    vi.stubGlobal('crypto', {
      getRandomValues: (values: Uint8Array) => {
        values.fill(7);
        return values;
      },
    });
    const fake = makeTestApplication();
    const completeSession = vi.fn().mockResolvedValue({ id: 'saved-record' });
    Object.assign(fake.application.training, {
      completeSession,
      getSummary: vi.fn().mockResolvedValue({
        headline: '训练已记录',
        body: '计时带练已完成。',
        nextAction: '充分放松。',
        source: 'template',
      }),
      getProgress: vi.fn().mockResolvedValue({ currentStreak: 0 }),
    });
    const session = {
      ...createTrainingSession(moduleId),
      status: 'finished' as const,
      endReason: 'complete' as const,
      completedCycles: 5,
      completedGroups: 1,
      elapsedSeconds: 85,
    };
    render(
      <ResultPage
        payload={{ session, recordId: 'record-1', metrics: null, evaluationMode: 'timer' }}
        application={fake.application}
        onAgain={vi.fn()}
        onDone={vi.fn()}
        onOpenRecords={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '合适' }));
    fireEvent.click(screen.getByRole('button', { name: '容易' }));
    fireEvent.click(screen.getByRole('button', { name: '没有' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '保存并查看总结' }));
      await Promise.resolve();
    });
    expect(completeSession).toHaveBeenCalledWith(
      'record-1',
      expect.objectContaining({
        requestId: '07070707-0707-4707-8707-070707070707',
        evaluationMode: 'timer',
        metrics: null,
        status: 'complete',
      }),
    );
    expect(screen.getByRole('heading', { name: '训练已记录' })).toBeVisible();
  },
);
