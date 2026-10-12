import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PosturePage } from './PosturePage';
import { makeTestApplication } from '../../test/testApplication';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe('automatic posture advice', () => {
  it('announces a persistent crossed-leg state once, respects cooldown, and clears after correction', async () => {
    vi.useFakeTimers();
    const fake = makeTestApplication();
    render(
      <PosturePage application={fake.application} onOpenDevice={vi.fn()} onOpenRecords={vi.fn()} />,
    );
    fireEvent.pointerDown(document.body);
    act(() =>
      fake.emit({ snapshot: { ...fake.getLatest().snapshot, postureState: 'crossed_left' } }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(screen.getByText('左腿翘起的趋势')).toBeVisible();
    expect(fake.audio.speak).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(fake.audio.speak).toHaveBeenCalledTimes(1);
    act(() => fake.emit({ snapshot: { ...fake.getLatest().snapshot, postureState: 'balanced' } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(screen.getByText('接近舒适参考')).toBeVisible();
  });
  it('keeps visual correction with audio muted', async () => {
    vi.useFakeTimers();
    const fake = makeTestApplication(true, false);
    render(
      <PosturePage application={fake.application} onOpenDevice={vi.fn()} onOpenRecords={vi.fn()} />,
    );
    fireEvent.pointerDown(document.body);
    act(() =>
      fake.emit({ snapshot: { ...fake.getLatest().snapshot, postureState: 'crossed_right' } }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByText('右腿翘起的趋势')).toBeVisible();
    expect(fake.audio.speak).not.toHaveBeenCalled();
  });
});
