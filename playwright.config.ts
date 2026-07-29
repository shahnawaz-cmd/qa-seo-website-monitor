import { defineConfig, devices } from '@playwright/test';

const testTimeout = process.env.TEST_TIMEOUT ? parseInt(process.env.TEST_TIMEOUT) : 60000;

// Smart Worker Scaling: 3 concurrent workers in CI to prevent 2-core VM CPU saturation, 10 workers locally
const workerCount = process.env.CI 
  ? 3 
  : (process.env.WORKERS ? parseInt(process.env.WORKERS) : 10);

const batchIndex = process.env.BATCH_INDEX || '0';
const jsonOutputFile = `playwright-report/results-${batchIndex}.json`;

const reporters: any[] = [['list']];

if (process.env.CI) {
  reporters.push(['blob']);
} else {
  reporters.push(['html', { open: 'never' }]);
  reporters.push(['json', { outputFile: jsonOutputFile }]);
}

export default defineConfig({
  testDir: './tests',
  timeout: testTimeout,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.RETRIES ? parseInt(process.env.RETRIES) : 1,
  workers: workerCount,
  reporter: reporters,
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
