import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';

async function discover(baseUrl: string) {
  const discovered = new Set<string>();
  const client = axios.create({ timeout: 30000 });
  const parser = new XMLParser({ ignoreAttributes: false });

  async function parse(url: string) {
    try {
      const res = await client.get(url);
      const parsed = parser.parse(res.data);
      if (parsed.sitemapindex && parsed.sitemapindex.sitemap) {
        const sitemaps = Array.isArray(parsed.sitemapindex.sitemap)
          ? parsed.sitemapindex.sitemap
          : [parsed.sitemapindex.sitemap];
        for (const s of sitemaps) {
          if (s.loc) await parse(s.loc);
        }
      } else if (parsed.urlset && parsed.urlset.url) {
        const urls = Array.isArray(parsed.urlset.url) ? parsed.urlset.url : [parsed.urlset.url];
        for (const u of urls) {
          if (u.loc) discovered.add(u.loc.trim());
        }
      }
    } catch (e) {}
  }

  try {
    const robots = await client.get(`${baseUrl}/robots.txt`);
    const lines = robots.data.split('\n');
    let hasSitemap = false;
    for (const line of lines) {
      if (line.toLowerCase().startsWith('sitemap:')) {
        await parse(line.substring(8).trim());
        hasSitemap = true;
      }
    }
    if (!hasSitemap) {
      await parse(`${baseUrl}/sitemap.xml`);
    }
  } catch (e) {
    await parse(`${baseUrl}/sitemap.xml`);
  }

  if (discovered.size === 0) {
    discovered.add(baseUrl);
  }

  const urls = Array.from(discovered);
  fs.writeFileSync('discovered_urls.json', JSON.stringify(urls, null, 2), 'utf-8');
  console.log(JSON.stringify(urls));
}

const target = process.argv[2] || 'https://detailedvehiclehistory.com';
discover(target).catch(() => {
  fs.writeFileSync('discovered_urls.json', JSON.stringify([target]), 'utf-8');
  console.log(JSON.stringify([target]));
});
