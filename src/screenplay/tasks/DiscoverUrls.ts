import { XMLParser } from 'fast-xml-parser';
import { Actor } from '../Actor';
import { Task } from '../Task';
import { CallAnApi } from '../abilities/CallAnApi';

export class DiscoverUrls extends Task {
  private urls: string[] = [];

  constructor(private readonly sitemapOrWebUrl: string) {
    super();
  }

  static from(sitemapOrWebUrl: string): DiscoverUrls {
    return new DiscoverUrls(sitemapOrWebUrl);
  }

  async performAs(actor: Actor): Promise<void> {
    const api = actor.abilityTo(CallAnApi);
    const discovered = new Set<string>();

    // Determine if it is likely an XML sitemap
    const isXml = this.sitemapOrWebUrl.endsWith('.xml') || this.sitemapOrWebUrl.includes('/sitemap');

    if (isXml) {
      await this.fetchAndParseSitemap(this.sitemapOrWebUrl, api, discovered);
    } else {
      // If it's a website home page, we can try to fetch robots.txt and find sitemaps there,
      // or check standard sitemap paths: /sitemap.xml, /sitemap_index.xml
      const urlObj = new URL(this.sitemapOrWebUrl);
      const host = `${urlObj.protocol}//${urlObj.host}`;
      const defaultSitemap = `${host}/sitemap.xml`;
      const defaultIndex = `${host}/sitemap_index.xml`;
      
      console.log(`[DiscoverUrls] Checking default sitemaps for: ${this.sitemapOrWebUrl}`);
      
      let foundSitemaps = false;
      try {
        const robotsRes = await api.client.get(`${host}/robots.txt`);
        const lines = (robotsRes.data || '').split('\n');
        for (const line of lines) {
          if (line.trim().toLowerCase().startsWith('sitemap:')) {
            const sitemapUrl = line.substring(8).trim();
            console.log(`[DiscoverUrls] Discovered sitemap from robots.txt: ${sitemapUrl}`);
            await this.fetchAndParseSitemap(sitemapUrl, api, discovered);
            foundSitemaps = true;
          }
        }
      } catch (e) {
        // robots.txt not available or error
      }

      if (!foundSitemaps) {
        // Try checking /sitemap_index.xml
        try {
          console.log(`[DiscoverUrls] Trying sitemap index: ${defaultIndex}`);
          await this.fetchAndParseSitemap(defaultIndex, api, discovered);
          foundSitemaps = true;
        } catch (e) {
          // Try /sitemap.xml
          try {
            console.log(`[DiscoverUrls] Trying sitemap: ${defaultSitemap}`);
            await this.fetchAndParseSitemap(defaultSitemap, api, discovered);
            foundSitemaps = true;
          } catch (err) {
            // Fallback: Just return the input web URL itself
            console.log(`[DiscoverUrls] No sitemap found. Using root URL: ${this.sitemapOrWebUrl}`);
            discovered.add(this.sitemapOrWebUrl);
          }
        }
      }
    }

    this.urls = Array.from(discovered);
    console.log(`[DiscoverUrls] Total discovered URLs: ${this.urls.length}`);
  }

  private async fetchAndParseSitemap(url: string, api: CallAnApi, discovered: Set<string>): Promise<void> {
    try {
      console.log(`[DiscoverUrls] Fetching sitemap: ${url}`);
      const res = await api.client.get(url);
      const xml = res.data;
      if (typeof xml !== 'string') {
        console.warn(`[DiscoverUrls] Received non-string data for sitemap ${url}`);
        return;
      }

      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_'
      });
      const parsed = parser.parse(xml);

      // Handle Sitemap Index
      if (parsed.sitemapindex && parsed.sitemapindex.sitemap) {
        const sitemaps = Array.isArray(parsed.sitemapindex.sitemap)
          ? parsed.sitemapindex.sitemap
          : [parsed.sitemapindex.sitemap];
        
        console.log(`[DiscoverUrls] Sitemap index detected. Found ${sitemaps.length} sub-sitemaps.`);
        for (const s of sitemaps) {
          if (s.loc) {
            await this.fetchAndParseSitemap(s.loc, api, discovered);
          }
        }
      }
      // Handle Urlset (Standard Sitemap)
      else if (parsed.urlset && parsed.urlset.url) {
        const urls = Array.isArray(parsed.urlset.url)
          ? parsed.urlset.url
          : [parsed.urlset.url];
        
        console.log(`[DiscoverUrls] Found ${urls.length} URLs in sitemap: ${url}`);
        for (const u of urls) {
          if (u.loc) {
            discovered.add(u.loc.trim());
          }
        }
      }
    } catch (error: any) {
      console.error(`[DiscoverUrls] Failed to parse sitemap: ${url}. Error: ${error.message}`);
      throw error;
    }
  }

  getUrls(): string[] {
    return this.urls;
  }
}
