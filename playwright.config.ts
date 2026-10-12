import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    viewport: { width: 390, height: 844 },
    ...(process.platform === 'win32' ? { channel: 'chrome' as const } : {}),
  },
  webServer: {
    command: 'npm run dev -- --port 4174',
    env: { ...process.env, VITE_DEVICE_MODE: 'mock' },
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
