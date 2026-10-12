/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('DEVICE_TOKEN', 'public-test-device-token');
  vi.stubEnv('LLM_API_KEY', undefined);
  vi.stubEnv('LLM_BASE_URL', undefined);
  vi.stubEnv('LLM_MODEL', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('server configuration', () => {
  it.each([undefined, '', 'short'])('rejects an unset or short device token: %s', async (token) => {
    vi.stubEnv('DEVICE_TOKEN', token);
    await expect(import('./env')).rejects.toThrow();
  });

  it('keeps model defaults without providing an API key', async () => {
    const { serverEnv } = await import('./env');
    expect(serverEnv.DEVICE_TOKEN).toBe('public-test-device-token');
    expect(serverEnv.LLM_BASE_URL).toBe('https://api.minimax.cn/v1');
    expect(serverEnv.LLM_MODEL).toBe('MiniMax-M3');
    expect(serverEnv.LLM_API_KEY).toBeUndefined();
  });

  it('treats a blank API key as unconfigured', async () => {
    vi.stubEnv('LLM_API_KEY', '   ');
    const { serverEnv } = await import('./env');
    expect(serverEnv.LLM_API_KEY).toBeUndefined();
  });
});
