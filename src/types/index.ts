export interface ValidationResult {
  ruleName: string;
  passed: boolean;
  severity: 'error' | 'warning';
  message: string;
  actual?: string;
  expected?: string;
}

export interface LinkStatus {
  url: string;
  statusCode: number;
  statusText: string;
  passed: boolean;
}

export interface PageReport {
  url: string;
  statusCode: number;
  statusText: string;
  loadTimeMs: number;
  loadTimeSec: number; // Added page load time in seconds
  title: string;
  metaDescription: string;
  h1Tags: string[];
  canonical: string;
  robotsMeta: string;
  isCrawlable: boolean; // Added crawlability indicator
  consoleErrors: string[];
  brokenInternalLinks: LinkStatus[];
  screenshotPath?: string;
  validations: ValidationResult[];
  timestamp: string;
}

export interface RobotsTxtReport {
  url: string;
  exists: boolean;
  statusCode: number;
  sitemapsDiscovered: string[];
  hasDisallowAll: boolean;
  raw?: string;
}

export interface SummaryDashboard {
  totalPages: number;
  healthyPages: number;
  brokenPages: number;
  redirects: number;
  slowPages: number;
  missingSeo: number;
  failedValidations: number;
  averageLoadTimeMs: number;
}

export interface RunReport {
  id: string;
  targetUrl: string;
  startTime: string;
  endTime: string;
  robotsTxt?: RobotsTxtReport;
  pages: PageReport[];
  summary: SummaryDashboard;
}
