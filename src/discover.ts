import { chromium } from 'playwright';
import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function discover(baseUrl: string) {
  const discovered = new Set<string>();
  const parsedSitemaps = new Set<string>(); // Prevent infinite loop recursion
  const parser = new XMLParser({ ignoreAttributes: false });

  const isCi = !!process.env.CI;
  console.log(`[Discover] Starting sitemap crawler (CI: ${isCi})`);
  
  const browser = await chromium.launch({ headless: isCi });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  async function parse(url: string) {
    if (parsedSitemaps.has(url)) {
      return;
    }
    parsedSitemaps.add(url);

    try {
      console.log(`[Discover] Navigating to sitemap: ${url}`);
      const res = await page.goto(url, { waitUntil: 'commit', timeout: 60000 });
      
      if (res && res.status() === 200) {
        const text = await res.text();
        
        // 1. Try Namespace-aware Regex Loc matching (for raw XML responses)
        const locRegex = /<(?:[a-zA-Z0-9_:-]+:)?loc>(https?:\/\/[^<]+)<\/(?:[a-zA-Z0-9_:-]+:)?loc>/gi;
        let match;
        const sitemapsToParse: string[] = [];
        let locFound = false;

        while ((match = locRegex.exec(text)) !== null) {
          const locUrl = match[1].trim();
          if (locUrl.endsWith('.xml')) {
            sitemapsToParse.push(locUrl);
          } else {
            discovered.add(locUrl);
          }
          locFound = true;
        }

        // 2. If no <loc> matches, try href links (for sitemaps rendered as HTML by browser XSL transformation)
        if (!locFound) {
          const hrefRegex = /href=["'](https?:\/\/[^"'\s>]+)/gi;
          while ((match = hrefRegex.exec(text)) !== null) {
            const linkUrl = match[1].trim();
            // Skip sitemap plugin homepages and credits
            if (linkUrl.includes('rankmath.com') || linkUrl.includes('sitemaps.org') || linkUrl.includes('yoast.com') || linkUrl.includes('w3.org')) {
              continue;
            }
            if (linkUrl.endsWith('.xml')) {
              sitemapsToParse.push(linkUrl);
            } else {
              discovered.add(linkUrl);
            }
            locFound = true;
          }
        }

        // Fallback to XML parsing library if regex found nothing
        if (!locFound) {
          const parsed = parser.parse(text.trim());
          if (parsed.sitemapindex && parsed.sitemapindex.sitemap) {
            const sitemaps = Array.isArray(parsed.sitemapindex.sitemap)
              ? parsed.sitemapindex.sitemap
              : [parsed.sitemapindex.sitemap];
            
            for (const s of sitemaps) {
              if (s.loc) {
                sitemapsToParse.push(s.loc.trim());
              }
            }
          } else if (parsed.urlset && parsed.urlset.url) {
            const urls = Array.isArray(parsed.urlset.url) ? parsed.urlset.url : [parsed.urlset.url];
            for (const u of urls) {
              if (u.loc) discovered.add(u.loc.trim());
            }
          }
        }

        // Recursively crawl nested sitemaps
        for (const sitemapUrl of sitemapsToParse) {
          if (!parsedSitemaps.has(sitemapUrl)) {
            await delay(1500);
            await parse(sitemapUrl);
          }
        }
      } else {
        console.warn(`[Discover] Non-200 status for sitemap ${url}: ${res ? res.status() : 'No Response'}`);
      }
    } catch (e: any) {
      console.error(`[Discover] Error parsing sitemap ${url}:`, e.message);
    }
  }

  try {
    console.log(`[Discover] Fetching robots.txt for ${baseUrl}`);
    const res = await page.goto(`${baseUrl}/robots.txt`, { waitUntil: 'commit', timeout: 60000 });
    let hasSitemap = false;

    if (res && res.status() === 200) {
      const text = await res.text();
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.toLowerCase().startsWith('sitemap:')) {
          const sitemapUrl = line.substring(8).trim();
          await delay(1000);
          await parse(sitemapUrl);
          hasSitemap = true;
        }
      }
    }

    if (!hasSitemap) {
      await delay(1000);
      await parse(`${baseUrl}/sitemap.xml`);
    }
  } catch (e: any) {
    console.warn(`[Discover] Robots.txt fetch failed, falling back to sitemap.xml directly:`, e.message);
    await delay(1000);
    await parse(`${baseUrl}/sitemap.xml`);
  }

  await browser.close();

  // Determine dynamic Site Name
  const urlObj = new URL(baseUrl);
  let siteName = urlObj.host.replace('www.', '').split('.')[0].toUpperCase();

  // Check KOD configuration file
  try {
    if (fs.existsSync('kod-sites.json')) {
      const kodSites = JSON.parse(fs.readFileSync('kod-sites.json', 'utf-8'));
      const matchingSite = kodSites.find((s: any) => new URL(s.url).host === urlObj.host);
      if (matchingSite) {
        siteName = matchingSite.id;
      }
    }
  } catch (err) {
    console.error('Failed to read kod-sites.json:', err);
  }
  if (urlObj.host.includes('detailedvehiclehistory.com')) {
    siteName = 'DVH';
  } else if (urlObj.host.includes('vehiclesreport.com')) {
    siteName = 'VSR';
  } else if (urlObj.host.includes('vehiclehistory.eu')) {
    siteName = 'VHREU';
  } else if (urlObj.host.includes('classicdecoder.com')) {
    siteName = 'CD';
  } else if (urlObj.host.includes('instantvinreports.com')) {
    siteName = 'IVR';
  } else if (urlObj.host.includes('vinnumber.ca')) {
    siteName = 'VNCA';
  } else if (urlObj.host.includes('motorcyclevinlookup.com')) {
    siteName = 'MVL';
  } else if (urlObj.host.includes('smartcarcheck.uk')) {
    siteName = 'SCC';
  } else if (urlObj.host.includes('consultadevin.com')) {
    siteName = 'CNV';
  } else if (urlObj.host.includes('premiumvin.com')) {
    siteName = 'PV';
  } else if (urlObj.host.includes('windowstickerslookup.com')) {
    siteName = 'WSL';
  } else if (urlObj.host.includes('vehicledatabases.com')) {
    siteName = 'VDB';
  }

  if (!fs.existsSync('playwright-report')) {
    fs.mkdirSync('playwright-report', { recursive: true });
  }

  // Save metadata to file to pass it to slack-notify.js
  const metadata = { siteName, targetUrl: baseUrl };
  fs.writeFileSync('playwright-report/metadata.json', JSON.stringify(metadata, null, 2), 'utf-8');
  console.log(`[Discover] Saved metadata: ${JSON.stringify(metadata)}`);

  if (discovered.size === 0) {
    if (fs.existsSync('playwright-report/discovered_urls.json')) {
      console.log('[Discover] WAF Blocked or no URLs found. Preserving committed discovered_urls.json fallback list.');
      return;
    }
    discovered.add(baseUrl);
  }

  const urls = Array.from(discovered);
  fs.writeFileSync('playwright-report/discovered_urls.json', JSON.stringify(urls, null, 2), 'utf-8');
  console.log(`[Discover] Discovery complete. Found ${urls.length} URLs.`);
}

const target = process.argv[2] || 'https://detailedvehiclehistory.com';
discover(target).catch((err) => {
  console.error('[Discover] Fatal discovery error:', err);
  if (!fs.existsSync('playwright-report/discovered_urls.json')) {
    if (!fs.existsSync('playwright-report')) {
      fs.mkdirSync('playwright-report', { recursive: true });
    }
    fs.writeFileSync('playwright-report/discovered_urls.json', JSON.stringify([target]), 'utf-8');
  }
});
