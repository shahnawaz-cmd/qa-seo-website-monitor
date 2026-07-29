import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function checkLinks() {
  const resultsDir = path.resolve('./playwright-report');
  const allExtractedLinks = new Set<string>();
  const linkMapping: Record<string, string[]> = {};

  // 1. Gather all extracted links from batch reports
  if (fs.existsSync(resultsDir)) {
    const files = fs.readdirSync(resultsDir).filter(f => f.startsWith('results-') && f.endsWith('.json'));
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(resultsDir, file), 'utf-8'));
        
        function parseSuites(suite: any) {
          if (suite.specs) {
            for (const spec of suite.specs) {
              for (const testItem of spec.tests) {
                if (testItem.results && testItem.results.length > 0) {
                  const lastResult = testItem.results[testItem.results.length - 1];
                  const attachment = lastResult.attachments && lastResult.attachments.find((a: any) => a.name === 'pageReport');
                  if (attachment && attachment.body) {
                    try {
                      let body = attachment.body;
                      if (body && !body.trim().startsWith('{')) {
                        body = Buffer.from(body, 'base64').toString('utf-8');
                      }
                      const pageReport = JSON.parse(body);
                      if (pageReport.extractedLinks) {
                        for (const link of pageReport.extractedLinks) {
                          allExtractedLinks.add(link);
                          if (!linkMapping[link]) {
                            linkMapping[link] = [];
                          }
                          linkMapping[link].push(pageReport.url);
                        }
                      }
                    } catch (e) {}
                  }
                }
              }
            }
          }
          if (suite.suites) {
            for (const subSuite of suite.suites) {
              parseSuites(subSuite);
            }
          }
        }

        if (data.suites) {
          for (const suite of data.suites) {
            parseSuites(suite);
          }
        }
      } catch (e) {
        console.error(`Failed to parse ${file}:`, e);
      }
    }
  }

  const uniqueLinks = Array.from(allExtractedLinks);
  console.log(`[Link Checker] Verifying ${uniqueLinks.length} unique internal links via Playwright Chromium request stack...`);

  if (uniqueLinks.length === 0) {
    console.log('[Link Checker] No links extracted. Writing empty broken links list.');
    fs.writeFileSync(path.join(resultsDir, 'broken-links.json'), JSON.stringify([], null, 2), 'utf-8');
    return;
  }

  // 2. Launch browser to get request context (bypasses TLS JA3 fingerprint checks)
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const requestContext = context.request;

  const brokenLinks: any[] = [];
  const linkTimeout = 30000;
  const concurrencyLimit = 5; // Query in batches of 5 to prevent triggering WAF rate limits/timeouts

  // 3. Query all unique links sequentially in small concurrent batches
  for (let i = 0; i < uniqueLinks.length; i += concurrencyLimit) {
    const chunk = uniqueLinks.slice(i, i + concurrencyLimit);
    
    await Promise.all(
      chunk.map(async (link) => {
        try {
          const res = await requestContext.get(link, {
            timeout: linkTimeout,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          
          if (res.status() < 200 || res.status() >= 400) {
            brokenLinks.push({
              url: link,
              statusCode: res.status(),
              statusText: res.statusText(),
              pagesFoundOn: linkMapping[link] || []
            });
          }
        } catch (err: any) {
          brokenLinks.push({
            url: link,
            statusCode: 0,
            statusText: err.message || 'Timeout/Error',
            pagesFoundOn: linkMapping[link] || []
          });
        }
      })
    );
    
    // Tiny delay between chunks to be respectful of rate limit boundaries
    await delay(100);
  }

  await browser.close();
  console.log(`[Link Checker] Link verification complete. Found ${brokenLinks.length} broken links.`);

  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(resultsDir, 'broken-links.json'),
    JSON.stringify(brokenLinks, null, 2),
    'utf-8'
  );
}

checkLinks().catch(err => {
  console.error('[Link Checker] Fatal error:', err);
});
