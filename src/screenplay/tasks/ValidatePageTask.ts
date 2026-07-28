import * as fs from 'fs';
import * as path from 'path';
import { Page, Response } from '@playwright/test';
import { Actor } from '../Actor';
import { Task } from '../Task';
import { BrowseTheWeb } from '../abilities/BrowseTheWeb';
import { CallAnApi } from '../abilities/CallAnApi';
import { PageReport, LinkStatus, ValidationResult } from '../../types';
import { ValidationRule } from '../validations/ValidationRule';
import { defaultValidationRules } from '../validations/rules';

export class ValidatePageTask extends Task {
  private report: PageReport | null = null;
  
  // Condition-based configuration parameters
  private readonly maxRetries = process.env.MAX_RETRIES ? parseInt(process.env.MAX_RETRIES) : 1;
  private readonly navigationTimeout = process.env.NAVIGATION_TIMEOUT ? parseInt(process.env.NAVIGATION_TIMEOUT) : 45000;
  private readonly linkTimeout = process.env.LINK_TIMEOUT ? parseInt(process.env.LINK_TIMEOUT) : 10000;

  constructor(
    private readonly url: string,
    private readonly screenshotDir: string,
    private readonly rules: ValidationRule[] = defaultValidationRules
  ) {
    super();
  }

  static of(url: string, screenshotDir: string, rules?: ValidationRule[]): ValidatePageTask {
    return new ValidatePageTask(url, screenshotDir, rules);
  }

  async performAs(actor: Actor): Promise<void> {
    const { page } = actor.abilityTo(BrowseTheWeb);

    // Speed Optimization 1: Network Resource blocking
    await page.route('**/*', (route) => {
      const type = route.request().resourceType();
      const url = route.request().url();
      if (
        type === 'image' ||
        type === 'stylesheet' ||
        type === 'font' ||
        type === 'media' ||
        url.includes('google-analytics') ||
        url.includes('googletagmanager') ||
        url.includes('facebook') ||
        url.includes('hotjar')
      ) {
        route.abort();
      } else {
        route.continue();
      }
    });

    const consoleErrors: string[] = [];
    const handleConsole = (msg: any) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    };
    page.on('console', handleConsole);

    let attempts = 0;
    let response: Response | null = null;
    let loadTimeMs = 0;
    let errorMsg = '';

    while (attempts <= this.maxRetries) {
      try {
        const startTime = Date.now();
        response = await page.goto(this.url, { waitUntil: 'domcontentloaded', timeout: this.navigationTimeout });
        loadTimeMs = Date.now() - startTime;
        break;
      } catch (err: any) {
        attempts++;
        errorMsg = err.message;
        if (attempts > this.maxRetries) {
          break;
        }
        console.log(`[ValidatePageTask] Retry ${attempts}/${this.maxRetries} for URL: ${this.url}`);
      }
    }

    const statusCode = response ? response.status() : 0;
    const statusText = response ? response.statusText() : errorMsg || 'Unknown Error';

    let title = '';
    let metaDescription = '';
    let h1Tags: string[] = [];
    let canonical = '';
    let robotsMeta = '';
    const brokenInternalLinks: LinkStatus[] = [];

    if (statusCode > 0 && statusCode < 400) {
      try {
        title = await page.title();
        
        metaDescription = await page.evaluate(() => {
          const element = document.querySelector('meta[name="description"]');
          return element ? element.getAttribute('content') || '' : '';
        });

        h1Tags = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('h1')).map(el => el.textContent || '');
        });

        canonical = await page.evaluate(() => {
          const element = document.querySelector('link[rel="canonical"]');
          return element ? element.getAttribute('href') || '' : '';
        });

        robotsMeta = await page.evaluate(() => {
          const element = document.querySelector('meta[name="robots"]');
          return element ? element.getAttribute('content') || '' : '';
        });

        // Discover and check internal links
        const internalLinks = await page.evaluate((currentHost) => {
          const anchors = Array.from(document.querySelectorAll('a'));
          return anchors
            .map(a => a.href)
            .filter(href => {
              try {
                const urlObj = new URL(href);
                return urlObj.host === currentHost && !href.includes('#') && !href.startsWith('javascript:');
              } catch (e) {
                return false;
              }
            });
        }, new URL(this.url).host);

        // Deduplicate internal links (Limit link check per page for speed)
        const uniqueLinks = Array.from(new Set(internalLinks)).slice(0, 15);

        // Playwright Request Context bypasses Cloudflare/firewall blocks by routing through the active browser network stack
        await Promise.all(
          uniqueLinks.map(async (link) => {
            try {
              let res;
              try {
                // Try HEAD request first using Chromium context
                res = await page.request.head(link, { timeout: this.linkTimeout });
              } catch (headErr) {
                // Fallback to GET
                res = await page.request.get(link, { timeout: this.linkTimeout });
              }

              const ok = res.status() >= 200 && res.status() < 400;
              brokenInternalLinks.push({
                url: link,
                statusCode: res.status(),
                statusText: res.statusText(),
                passed: ok
              });
            } catch (linkErr: any) {
              brokenInternalLinks.push({
                url: link,
                statusCode: 500,
                statusText: linkErr.message || 'Timeout/Error',
                passed: false
              });
            }
          })
        );

      } catch (extractErr) {
        console.error(`[ValidatePageTask] Error extracting DOM elements for ${this.url}:`, extractErr);
      }
    }

    // Clean up event listener
    page.off('console', handleConsole);

    // Calculate Load Time in seconds
    const loadTimeSec = Math.round((loadTimeMs / 1000) * 100) / 100;

    // A page is crawlable if: status is healthy, AND robots meta doesn't restrict search engines (noindex)
    const isCrawlable = (statusCode >= 200 && statusCode < 400) && !robotsMeta.toLowerCase().includes('noindex');

    // Build the initial report object
    const pageReport: PageReport = {
      url: this.url,
      statusCode,
      statusText,
      loadTimeMs,
      loadTimeSec,
      title,
      metaDescription,
      h1Tags,
      canonical,
      robotsMeta,
      isCrawlable,
      consoleErrors,
      brokenInternalLinks,
      timestamp: new Date().toISOString(),
      validations: []
    };

    // Run modular validation rules
    const validations: ValidationResult[] = [];
    let hasCriticalFailure = statusCode >= 400 || statusCode === 0;

    for (const rule of this.rules) {
      try {
        const result = rule.validate(pageReport);
        validations.push(result);
        if (!result.passed && result.severity === 'error') {
          hasCriticalFailure = true;
        }
      } catch (ruleErr: any) {
        validations.push({
          ruleName: rule.name,
          passed: false,
          severity: 'error',
          message: `Rule threw exception: ${ruleErr.message}`
        });
        hasCriticalFailure = true;
      }
    }

    pageReport.validations = validations;

    // Take screenshot on failure
    if (hasCriticalFailure) {
      try {
        if (!fs.existsSync(this.screenshotDir)) {
          fs.mkdirSync(this.screenshotDir, { recursive: true });
        }
        const safeName = this.url.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const screenshotPath = path.join(this.screenshotDir, `${safeName}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        pageReport.screenshotPath = screenshotPath;
      } catch (screenshotErr) {
        console.error(`[ValidatePageTask] Failed to capture screenshot for ${this.url}:`, screenshotErr);
      }
    }

    this.report = pageReport;
  }

  getReport(): PageReport | null {
    return this.report;
  }
}
