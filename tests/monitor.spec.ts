import { test, expect } from '@playwright/test';
import { Actor } from '../src/screenplay/Actor';
import { BrowseTheWeb } from '../src/screenplay/abilities/BrowseTheWeb';
import { CallAnApi } from '../src/screenplay/abilities/CallAnApi';
import { ValidatePageTask } from '../src/screenplay/tasks/ValidatePageTask';
import * as fs from 'fs';
import * as path from 'path';

// Read target URL
const TARGET_URL = process.env.MONITOR_URL || 'https://detailedvehiclehistory.com';

// Read discovered URLs from sitemap setup
let urlsToAudit: string[] = [];
const jsonPath = path.resolve('./discovered_urls.json');

if (fs.existsSync(jsonPath)) {
  try {
    urlsToAudit = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  } catch (err: any) {
    console.error(`[Playwright Spec] Failed to parse discovered_urls.json:`, err.message);
    urlsToAudit = [TARGET_URL];
  }
} else {
  urlsToAudit = [TARGET_URL];
}

// Resolve the current batch segment
let finalUrls = urlsToAudit;
const isAll = process.env.BATCH_SIZE === 'all';
const batchSize = isAll ? urlsToAudit.length : (process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE) : 50);
const batchIndex = isAll ? 0 : (process.env.BATCH_INDEX ? parseInt(process.env.BATCH_INDEX) : 0);

if (!isAll) {
  const startIndex = batchIndex * batchSize;
  const endIndex = startIndex + batchSize;
  finalUrls = urlsToAudit.slice(startIndex, endIndex);
}

console.log(`[Playwright Spec] Loaded batch ${isAll ? 'ALL' : batchIndex + 1} (Size: ${batchSize}). Auditing ${finalUrls.length} total URLs.`);

test.describe('Universal Website Audit', () => {
  for (const url of finalUrls) {
    test(`Auditing: ${url}`, async ({ page, context }) => {
      const auditor = Actor.named(`Auditor for ${url}`)
        .whoCan(BrowseTheWeb.using(page, context))
        .whoCan(CallAnApi.at(url));

      const validateTask = ValidatePageTask.of(url, './reports/screenshots');
      await auditor.attemptsTo(validateTask);
      const report = validateTask.getReport();

      if (report) {
        // Attach all page data, SEO audits, console errors, load time, and link status to the Playwright report
        await test.info().attach('pageReport', {
          body: JSON.stringify(report, null, 2),
          contentType: 'application/json'
        });

        // Perform standard Playwright assertions
        expect(report.statusCode).toBeGreaterThan(0);
        expect(report.statusCode).toBeLessThan(400);
        
        const failedRules = report.validations.filter(v => !v.passed && v.severity === 'error');
        expect(failedRules).toEqual([]);
      }
    });
  }
});
