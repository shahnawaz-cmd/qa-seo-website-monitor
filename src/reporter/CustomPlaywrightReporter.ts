import { Reporter, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';
import { PageReport, RunReport, SummaryDashboard } from '../types';
import { ReportGenerator } from './ReportGenerator';

export default class CustomPlaywrightReporter implements Reporter {
  private pageReports: PageReport[] = [];
  private targetUrl: string = 'https://detailedvehiclehistory.com';
  private startTime: string = new Date().toISOString();

  onBegin(config: any, suite: any) {
    this.startTime = new Date().toISOString();
    console.log(`[Custom Reporter] Starting test execution...`);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    // Look for reports attached or logged from tests
    const reportAttachment = result.attachments.find(a => a.name === 'pageReport');
    if (reportAttachment && reportAttachment.body) {
      try {
        const report = JSON.parse(reportAttachment.body.toString()) as PageReport;
        this.pageReports.push(report);
      } catch (err: any) {
        console.error(`[Custom Reporter] Failed to parse pageReport attachment:`, err.message);
      }
    }
  }

  async onEnd(result: FullResult) {
    const endTime = new Date().toISOString();
    const timestamp = this.startTime.replace(/[:.]/g, '-');
    const outDir = path.resolve('./reports', `run_${timestamp}`);
    
    if (this.pageReports.length === 0) {
      console.log(`[Custom Reporter] No page reports collected.`);
      return;
    }

    // Determine the base URL from the collected reports
    try {
      const firstUrl = this.pageReports[0]?.url;
      if (firstUrl) {
        const parsed = new URL(firstUrl);
        this.targetUrl = `${parsed.protocol}//${parsed.host}`;
      }
    } catch (_) {}

    const summary = ReportGenerator.generateSummary(this.pageReports);
    const runReport: RunReport = {
      id: `run_${timestamp}`,
      targetUrl: this.targetUrl,
      startTime: this.startTime,
      endTime,
      pages: this.pageReports,
      summary
    };

    ReportGenerator.generateAllReports(runReport, outDir);

    console.log('\n==================================================');
    console.log('      CUSTOM DASHBOARD GENERATED VIA PLAYWRIGHT   ');
    console.log('==================================================');
    console.log(`Reports successfully written to: ${outDir}`);
    console.log('==================================================\n');
  }
}
