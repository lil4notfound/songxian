import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeviceSetupPage } from './DeviceSetupPage';
import { makeTestApplication } from '../../test/testApplication';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe('guided calibration recovery', () => {
  it('blocks after stream loss and resamples the current step following device restart', async () => {
    vi.useFakeTimers();
    const fake = makeTestApplication(false);
    render(<DeviceSetupPage application={fake.application} onBack={vi.fn()} />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: '开始引导校准' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2250);
    });
    const retry = screen.getByRole('button', { name: '恢复后重采本步骤' });
    expect(retry).toBeDisabled();
    expect(screen.getByText('步骤 1 / 29')).toBeVisible();
    const heartbeat = window.setInterval(() => fake.emit({ bootId: 'rebooted' }), 100);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5250);
    });
    expect(screen.getByText('步骤 2 / 29')).toBeVisible();
    window.clearInterval(heartbeat);
  });
  it('halts a saturated step until the affected channel recovers', async () => {
    vi.useFakeTimers();
    const fake = makeTestApplication(false);
    render(<DeviceSetupPage application={fake.application} onBack={vi.fn()} />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: '开始引导校准' }));
    const heartbeat = window.setInterval(() => fake.emit({ saturatedChannels: ['B_L'] }), 100);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('饱和');
    expect(screen.getByRole('button', { name: '恢复后重采本步骤' })).toBeDisabled();
    window.clearInterval(heartbeat);
    act(() => fake.emit({ saturatedChannels: [] }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(screen.getByRole('button', { name: '恢复后重采本步骤' })).toBeEnabled();
  });
});
