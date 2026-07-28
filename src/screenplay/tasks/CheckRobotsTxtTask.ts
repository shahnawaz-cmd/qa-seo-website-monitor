import { Actor } from '../Actor';
import { Task } from '../Task';
import { CallAnApi } from '../abilities/CallAnApi';
import { RobotsTxtReport } from '../../types';

export class CheckRobotsTxtTask extends Task {
  private report: RobotsTxtReport | null = null;

  constructor(private readonly targetUrl: string) {
    super();
  }

  static of(targetUrl: string): CheckRobotsTxtTask {
    return new CheckRobotsTxtTask(targetUrl);
  }

  async performAs(actor: Actor): Promise<void> {
    const api = actor.abilityTo(CallAnApi);
    const urlObj = new URL(this.targetUrl);
    const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;

    try {
      const response = await api.client.get(robotsUrl);
      const text = response.data || '';
      
      const sitemaps: string[] = [];
      const lines = text.split('\n');
      let hasDisallowAll = false;

      for (const line of lines) {
        const clean = line.trim();
        if (clean.toLowerCase().startsWith('sitemap:')) {
          sitemaps.push(clean.substring(8).trim());
        }
        if (clean.toLowerCase().replace(/\s/g, '') === 'disallow:/') {
          hasDisallowAll = true;
        }
      }

      this.report = {
        url: robotsUrl,
        exists: response.status === 200,
        statusCode: response.status,
        sitemapsDiscovered: sitemaps,
        hasDisallowAll,
        raw: text
      };
    } catch (error: any) {
      this.report = {
        url: robotsUrl,
        exists: false,
        statusCode: error.response?.status || 500,
        sitemapsDiscovered: [],
        hasDisallowAll: false,
        raw: error.message
      };
    }
  }

  getReport(): RobotsTxtReport | null {
    return this.report;
  }
}
