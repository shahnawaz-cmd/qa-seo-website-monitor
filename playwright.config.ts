import { defineConfig, devices } from '@playwright/test';

// Configurable timeouts via environment variables
const testTimeout = process.env.TEST_TIMEOUT ? parseInt(process.env.TEST_TIMEOUT) : 60000;
const workerCount = process.env.WORKERS ? parseInt(process.env.WORKERS) : 10; // Set default workers to 10 for both local and CI

export default defineConfig({
  testDir: './tests',
  timeout: testTimeout,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.RETRIES ? parseInt(process.env.RETRIES) : 1, // 1 retry to handle network flakiness
  workers: workerCount,
  reporter: [
    ['html', { open: 'never' }],
    ['list']
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 800 },
    javaScriptEnabled: true
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    }
  ]
});
