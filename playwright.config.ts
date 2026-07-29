import { defineConfig, devices } from '@playwright/test';

const testTimeout = process.env.TEST_TIMEOUT ? parseInt(process.env.TEST_TIMEOUT) : 60000;
const workerCount = process.env.WORKERS ? parseInt(process.env.WORKERS) : 10;

const batchIndex = process.env.BATCH_INDEX || '0';
const jsonOutputFile = `playwright-report/results-${batchIndex}.json`;

// Dynamic reporters configuration
const reporters: any[] = [['list']];

if (process.env.CI) {
  // CI uses Blob reports for parallel shard merging
  reporters.push(['blob']);
} else {
  // Local runs use standard HTML and JSON reporters
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
