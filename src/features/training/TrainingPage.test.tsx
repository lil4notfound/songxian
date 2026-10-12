import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrainingPage } from './TrainingPage';
import { makeTestApplication } from '../../test/testApplication';
import { makeProfile, rawMap } from '../../test/deviceFixtures';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('training interruption UI', () => {
  it.each(['pelvic_floor', 'anal'] as const)(
    'starts %s on an HTTP phone with the existing disabled reference and pauses on empty load',
    async (moduleId) => {
      vi.useFakeTimers();
      vi.stubGlobal('crypto', {
        getRandomValues: (values: Uint8Array) => {
          values.fill(3);
          return values;
        },
      });
      const fake = makeTestApplication();
      const profile = makeProfile();
      profile.exercises.pelvic_floor!.evaluationEnabled = false;
      profile.exercises.anal = null;
      vi.spyOn(fake.application.device, 'getCalibration').mockResolvedValue(profile);
      render(
        <TrainingPage
          moduleId={moduleId}
          application={fake.application}
          onFinish={vi.fn()}
          onOpenDevice={vi.fn()}
          onOpenRecords={vi.fn()}
        />,
      );
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: moduleId === 'anal' ? '开始提肛' : '开始盆底肌训练' }),
        );
        await Promise.resolve();
      });
      expect(fake.training.startSession).toHaveBeenCalledWith(
        expect.objectContaining({
          moduleId,
          evaluationMode: 'timer',
          requestId: '03030303-0303-4303-8303-030303030303',
        }),
      );
      expect(screen.getByText('计时模式：未评价动作')).toBeVisible();
      const heartbeat = window.setInterval(
        () => fake.emit({ filteredRaw: rawMap([0, 0, 0, 0, 0]) }),
        100,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });
      expect(screen.getByRole('dialog', { name: '先调整，再继续' })).toHaveTextContent('坐回坐垫');
      const frozen = screen.getByLabelText(/剩余 \d+ 秒/).textContent;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(screen.getByLabelText(/剩余 \d+ 秒/).textContent).toBe(frozen);
      expect(fake.audio.stop).toHaveBeenCalled();
      window.clearInterval(heartbeat);
    },
  );
  it('stops countdown and audio after no new frames, then requires stable recovery and manual restart', async () => {
    vi.useFakeTimers();
    const fake = makeTestApplication();
    render(
      <TrainingPage
        moduleId="anal"
        application={fake.application}
        onFinish={vi.fn()}
        onOpenDevice={vi.fn()}
        onOpenRecords={vi.fn()}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '开始提肛' }));
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(screen.getByRole('dialog', { name: '先调整，再继续' })).toBeVisible();
    const frozen = screen.getByLabelText(/剩余 \d+ 秒/).textContent;
    expect(fake.audio.stop).toHaveBeenCalled();
    const restart = screen.getByRole('button', { name: '调整后重做本轮' });
    expect(restart).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByLabelText(/剩余 \d+ 秒/).textContent).toBe(frozen);
    const heartbeat = window.setInterval(() => fake.emit(), 100);
    for (let i = 0; i < 10; i++)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250);
      });
    expect(restart).toBeEnabled();
    fireEvent.click(restart);
    expect(screen.getByRole('heading', { name: '重新准备' })).toBeVisible();
    expect(screen.queryByRole('dialog', { name: '先调整，再继续' })).toBeNull();
    window.clearInterval(heartbeat);
  });
  it('requires an explicit timer choice when no new reference exists', async () => {
    const fake = makeTestApplication(false);
    const open = vi.fn();
    render(
      <TrainingPage
        moduleId="anal"
        application={fake.application}
        onFinish={vi.fn()}
        onOpenDevice={open}
        onOpenRecords={vi.fn()}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: '开始提肛' }));
    expect(screen.getByRole('region', { name: '选择训练评价模式' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '去校准' }));
    expect(open).toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '计时带练' }));
      await Promise.resolve();
    });
    expect(screen.getByText('计时模式：未评价动作')).toBeVisible();
  });
});
