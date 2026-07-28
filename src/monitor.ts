import { Command } from 'commander';
import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { Actor } from './screenplay/Actor';
import { CallAnApi } from './screenplay/abilities/CallAnApi';
import { BrowseTheWeb } from './screenplay/abilities/BrowseTheWeb';
import { CheckRobotsTxtTask } from './screenplay/tasks/CheckRobotsTxtTask';
import { DiscoverUrls } from './screenplay/tasks/DiscoverUrls';
import { ValidatePageTask } from './screenplay/tasks/ValidatePageTask';
import { ReportGenerator } from './reporter/ReportGenerator';
import { ReportComparer } from './reporter/ReportComparer';
import { RunReport, PageReport } from './types';

const program = new Command();

program
  .name('universal-website-monitor')
  .description('Universal Website Monitoring CLI using Screenplay Pattern & Playwright')
  .version('1.0.0');

program
  .option('-u, --url <url>', 'Website URL or Sitemap XML URL to monitor')
  .option('--urls <urls>', 'Comma-separated list of specific URLs to monitor (ignores discovery)')
  .option('--parallel <limit>', 'Max parallel pages to monitor', '3')
  .option('--out <dir>', 'Output directory for reports', './reports')
  .option('--compare <runs>', 'Comma-separated paths to two JSON reports to compare: base.json,current.json')
  .option('--schedule <frequency>', 'Schedule execution (daily or weekly)')
  .parse(process.argv);

const options = program.opts();

async function run() {
  // Scenario 1: Report Comparison
  if (options.compare) {
    const paths = options.compare.split(',');
    if (paths.length !== 2) {
      console.error('Error: Please provide exactly two comma-separated paths for comparison. Example: --compare base.json,current.json');
      process.exit(1);
    }
    const diff = ReportComparer.compare(paths[0], paths[1]);
    ReportComparer.printComparisonReport(diff);
    process.exit(0);
  }

  // Scenario 2: Scheduling guidance
  if (options.schedule) {
    const freq = options.schedule.toLowerCase();
    if (freq !== 'daily' && freq !== 'weekly') {
      console.error('Error: Invalid schedule frequency. Choose "daily" or "weekly".');
      process.exit(1);
    }
    console.log(`\n[Scheduler] Setup guidance for ${freq} monitoring:`);
    console.log('To run this automatically, add the following cron job to your system:');
    const cliPath = path.resolve(__filename);
    const nodePath = process.execPath;
    const cronTime = freq === 'daily' ? '0 0 * * *' : '0 0 * * 0';
    console.log(`\n${cronTime} "${nodePath}" "${cliPath}" --url "${options.url || 'https://detailedvehiclehistory.com'}"\n`);
    process.exit(0);
  }

  // Validate base requirements
  if (!options.url && !options.urls) {
    console.error('Error: Please specify a target URL (--url) or a list of URLs (--urls).');
    program.help();
    process.exit(1);
  }

  const startTime = new Date().toISOString();
  const timestamp = startTime.replace(/[:.]/g, '-');
  const runOutputDir = path.resolve(options.out, `run_${timestamp}`);
  const screenshotDir = path.join(runOutputDir, 'screenshots');

  console.log(`[Monitor] Starting monitoring session...`);
  console.log(`[Monitor] Output directory: ${runOutputDir}`);

  // 1. Initialise Playwright browser
  const browser = await chromium.launch({ headless: true });
  const browserContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  // Create primary navigation page
  const page = await browserContext.newPage();

  // Create Actor
  const auditor = Actor.named('SEO & Performance Auditor')
    .whoCan(BrowseTheWeb.using(page, browserContext));

  // Determine starting point
  const targetUrl = options.url || options.urls.split(',')[0].trim();
  auditor.whoCan(CallAnApi.at(targetUrl));

  let urlsToCrawl: string[] = [];

  // 2. Discover URLs
  if (options.urls) {
    urlsToCrawl = options.urls.split(',').map((u: string) => u.trim());
    console.log(`[Monitor] Monitoring ${urlsToCrawl.length} user-specified URLs.`);
  } else if (options.url) {
    console.log(`[Monitor] Running discovery for target: ${options.url}`);
    const discoverTask = DiscoverUrls.from(options.url);
    await auditor.attemptsTo(discoverTask);
    urlsToCrawl = discoverTask.getUrls();
  }

  if (urlsToCrawl.length === 0) {
    console.error('Error: No URLs discovered or specified.');
    await browser.close();
    process.exit(1);
  }

  // 3. Verify Robots.txt
  console.log(`[Monitor] Verifying robots.txt...`);
  const robotsTask = CheckRobotsTxtTask.of(targetUrl);
  await auditor.attemptsTo(robotsTask);
  const robotsReport = robotsTask.getReport();

  // 4. Crawl pages in parallel using a concurrency queue
  const parallelLimit = parseInt(options.parallel, 10);
  console.log(`[Monitor] Processing ${urlsToCrawl.length} pages in parallel (limit: ${parallelLimit})...`);

  const pageReports: PageReport[] = [];
  const activeWorkers: Promise<void>[] = [];
  const queue = [...urlsToCrawl];

  const worker = async () => {
    while (queue.length > 0) {
      const url = queue.shift();
      if (!url) break;

      console.log(`[Monitor] [Queue: ${queue.length}] Crawling: ${url}`);
      
      // For each worker URL, spawn a clean browser page to avoid state contamination
      const workerPage = await browserContext.newPage();
      const workerActor = Actor.named(`Page Auditor for ${url}`)
        .whoCan(BrowseTheWeb.using(workerPage, browserContext))
        .whoCan(CallAnApi.at(url));

      try {
        const validateTask = ValidatePageTask.of(url, screenshotDir);
        await workerActor.attemptsTo(validateTask);
        const report = validateTask.getReport();
        if (report) {
          pageReports.push(report);
        }
      } catch (err: any) {
        console.error(`Error processing URL ${url}:`, err.message);
      } finally {
        await workerPage.close();
      }
    }
  };

  // Start initial set of workers
  for (let i = 0; i < Math.min(parallelLimit, queue.length); i++) {
    activeWorkers.push(worker());
  }

  // Wait for all workers to finish
  await Promise.all(activeWorkers);

  // 5. Build final report objects
  const endTime = new Date().toISOString();
  const summary = ReportGenerator.generateSummary(pageReports);

  const runReport: RunReport = {
    id: `run_${timestamp}`,
    targetUrl,
    startTime,
    endTime,
    robotsTxt: robotsReport || undefined,
    pages: pageReports,
    summary
  };

  // 6. Generate reports & Output console summary
  ReportGenerator.generateAllReports(runReport, runOutputDir);

  console.log('\n==================================================');
  console.log('            MONITOR RUN SUMMARY                   ');
  console.log('==================================================');
  console.log(`Target URL:         ${runReport.targetUrl}`);
  console.log(`Total Pages:        ${summary.totalPages}`);
  console.log(`Healthy Pages:      ${summary.healthyPages}`);
  console.log(`Broken Pages:       ${summary.brokenPages}`);
  console.log(`Redirects:          ${summary.redirects}`);
  console.log(`Slow Pages (>3s):   ${summary.slowPages}`);
  console.log(`Missing SEO Elements: ${summary.missingSeo}`);
  console.log(`Failed Validations: ${summary.failedValidations}`);
  console.log(`Average Load Time:  ${summary.averageLoadTimeMs} ms`);
  console.log('==================================================');
  console.log(`Reports successfully written to: ${runOutputDir}`);
  console.log('==================================================\n');

  // Close main browser page and connection
  await page.close();
  await browser.close();
}

run().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
