import * as fs from 'fs';
import * as path from 'path';
import { Page, Response, APIRequestContext } from '@playwright/test';
import * as cheerio from 'cheerio';
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
  private readonly navigationTimeout = process.env.NAVIGATION_TIMEOUT ? parseInt(process.env.NAVIGATION_TIMEOUT) : 180000;

  constructor(
    private readonly url: string,
    private readonly screenshotDir: string,
    private readonly mode: 'fast' | 'full' = 'fast',
    private readonly requestContext?: APIRequestContext,
    private readonly rules: ValidationRule[] = defaultValidationRules
  ) {
    super();
  }

  static of(
    url: string, 
    screenshotDir: string, 
    mode?: 'fast' | 'full', 
    requestContext?: APIRequestContext, 
    rules?: ValidationRule[]
  ): ValidatePageTask {
    return new ValidatePageTask(url, screenshotDir, mode, requestContext, rules);
  }

  async performAs(actor: Actor): Promise<void> {
    if (this.mode === 'fast') {
      await this.performFastAudit(actor);
    } else {
      await this.performFullBrowserAudit(actor);
    }
  }

  /**
   * Mode A: Fast HTTP Crawl using Cheerio
   * Extracts links to memory but does not check them over network, avoiding WAF triggers.
   */
  private async performFastAudit(actor: Actor): Promise<void> {
    let attempts = 0;
    let statusCode = 0;
    let statusText = 'Unknown Error';
    let loadTimeMs = 0;
    let html = '';

    while (attempts <= this.maxRetries) {
      try {
        const startTime = Date.now();
        if (this.requestContext) {
          const res = await this.requestContext.get(this.url, { 
            timeout: this.navigationTimeout,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          loadTimeMs = Date.now() - startTime;
          statusCode = res.status();
          statusText = res.statusText();
          html = await res.text();
        } else {
          const api = actor.abilityTo(CallAnApi);
          const res = await api.client.get(this.url, { timeout: this.navigationTimeout });
          loadTimeMs = Date.now() - startTime;
          statusCode = res.status;
          statusText = res.statusText;
          html = res.data;
        }
        break;
      } catch (err: any) {
        attempts++;
        statusText = err.message || 'Error';
        statusCode = err.response?.status || 0;
        if (attempts > this.maxRetries) {
          break;
        }
      }
    }

    let title = '';
    let metaDescription = '';
    let h1Tags: string[] = [];
    let canonical = '';
    let robotsMeta = '';
    const extractedLinks: string[] = [];

    if (statusCode > 0 && statusCode < 400 && html) {
      try {
        const $ = cheerio.load(html);
        title = $('title').text() || '';
        metaDescription = $('meta[name="description"]').attr('content') || '';
        h1Tags = $('h1').map((_, el) => $(el).text() || '').get();
        canonical = $('link[rel="canonical"]').attr('href') || '';
        robotsMeta = $('meta[name="robots"]').attr('content') || '';

        // Extract internal links for later consolidated validation
        const currentHost = new URL(this.url).host;
        $('a').each((_, el) => {
          const href = $(el).attr('href');
          if (href) {
            try {
              const urlObj = new URL(href, this.url);
              if (urlObj.host === currentHost && !href.includes('#') && !href.startsWith('javascript:')) {
                extractedLinks.push(urlObj.href);
              }
            } catch (e) {
              // Ignore invalid links
            }
          }
        });
      } catch (parseErr: any) {
        console.error(`[ValidatePageTask] Cheerio parse error for ${this.url}:`, parseErr.message);
      }
    }

    const loadTimeSec = Math.round((loadTimeMs / 1000) * 100) / 100;
    const isCrawlable = (statusCode >= 200 && statusCode < 400) && !robotsMeta.toLowerCase().includes('noindex');

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
      consoleErrors: [],
      brokenInternalLinks: [],
      extractedLinks: Array.from(new Set(extractedLinks)), // Deduplicated list of page links
      timestamp: new Date().toISOString(),
      validations: []
    };

    this.runValidations(pageReport);
  }

  /**
   * Mode B: Full Browser Audit using Playwright/Chromium
   * Extracts links to memory without making redundant network link checks during page load.
   */
  private async performFullBrowserAudit(actor: Actor): Promise<void> {
    const { page } = actor.abilityTo(BrowseTheWeb);

    // Speed Optimization: Network Resource blocking
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
        const text = msg.text();
        if (
          text.includes('net::ERR_FAILED') ||
          text.includes('net::ERR_ABORTED') ||
          text.includes('Failed to load resource')
        ) {
          return;
        }
        consoleErrors.push(text);
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
      }
    }

    const statusCode = response ? response.status() : 0;
    const statusText = response ? response.statusText() : errorMsg || 'Unknown Error';

    let title = '';
    let metaDescription = '';
    let h1Tags: string[] = [];
    let canonical = '';
    let robotsMeta = '';
    const extractedLinks: string[] = [];

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

        // Extract internal links
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

        extractedLinks.push(...internalLinks);

      } catch (extractErr: any) {
        console.error(`[ValidatePageTask] Browser extraction error for ${this.url}:`, extractErr.message);
      }
    }

    // Clean up listener
    page.off('console', handleConsole);

    const loadTimeSec = Math.round((loadTimeMs / 1000) * 100) / 100;
    const isCrawlable = (statusCode >= 200 && statusCode < 400) && !robotsMeta.toLowerCase().includes('noindex');

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
      brokenInternalLinks: [],
      extractedLinks: Array.from(new Set(extractedLinks)),
      timestamp: new Date().toISOString(),
      validations: []
    };

    // Take screenshot on failure
    let hasCriticalFailure = statusCode >= 400 || statusCode === 0;
    for (const rule of this.rules) {
      const result = rule.validate(pageReport);
      if (!result.passed && result.severity === 'error') {
        hasCriticalFailure = true;
      }
    }

    if (hasCriticalFailure) {
      try {
        if (!fs.existsSync(this.screenshotDir)) {
          fs.mkdirSync(this.screenshotDir, { recursive: true });
        }
        const safeName = this.url.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const screenshotPath = path.join(this.screenshotDir, `${safeName}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        pageReport.screenshotPath = screenshotPath;
      } catch (screenshotErr: any) {
        console.error(`[ValidatePageTask] Failed to capture screenshot for ${this.url}:`, screenshotErr.message);
      }
    }

    this.runValidations(pageReport);
  }

  private runValidations(pageReport: PageReport): void {
    const validations: ValidationResult[] = [];
    
    for (const rule of this.rules) {
      try {
        validations.push(rule.validate(pageReport));
      } catch (ruleErr: any) {
        validations.push({
          ruleName: rule.name,
          passed: false,
          severity: 'error',
          message: `Rule exception: ${ruleErr.message}`
        });
      }
    }

    pageReport.validations = validations;
    this.report = pageReport;
  }

  getReport(): PageReport | null {
    return this.report;
  }
}
