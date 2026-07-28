import * as fs from 'fs';
import { RunReport, PageReport } from '../types';

export class ReportComparer {
  static compare(run1Path: string, run2Path: string): any {
    const run1: RunReport = JSON.parse(fs.readFileSync(run1Path, 'utf-8'));
    const run2: RunReport = JSON.parse(fs.readFileSync(run2Path, 'utf-8'));

    const run1PagesMap = new Map<string, PageReport>();
    for (const p of run1.pages) {
      run1PagesMap.set(p.url, p);
    }

    const newBroken: string[] = [];
    const fixed: string[] = [];
    const newSlow: { url: string; oldTime: number; newTime: number }[] = [];
    const newValidationFailures: { url: string; rule: string; message: string }[] = [];
    const newPages: string[] = [];

    for (const p2 of run2.pages) {
      const p1 = run1PagesMap.get(p2.url);

      if (!p1) {
        newPages.push(p2.url);
        const isBroken = p2.statusCode >= 400 || p2.statusCode === 0;
        if (isBroken) {
          newBroken.push(`${p2.url} (New page is broken: ${p2.statusCode})`);
        }
        continue;
      }

      // Check if newly broken
      const p1Broken = p1.statusCode >= 400 || p1.statusCode === 0;
      const p2Broken = p2.statusCode >= 400 || p2.statusCode === 0;

      if (!p1Broken && p2Broken) {
        newBroken.push(`${p2.url} (Status changed from ${p1.statusCode} to ${p2.statusCode})`);
      } else if (p1Broken && !p2Broken) {
        fixed.push(`${p2.url} (Status fixed from ${p1.statusCode} to ${p2.statusCode})`);
      }

      // Check for new validation failures
      const p1FailedRules = new Set(p1.validations.filter(v => !v.passed).map(v => v.ruleName));
      const p2FailedRules = p2.validations.filter(v => !v.passed);

      for (const f of p2FailedRules) {
        if (!p1FailedRules.has(f.ruleName)) {
          newValidationFailures.push({
            url: p2.url,
            rule: f.ruleName,
            message: f.message
          });
        }
      }

      // Check if significantly slower (>1.5x and over 3s)
      if (p2.loadTimeMs > 3000 && p2.loadTimeMs > p1.loadTimeMs * 1.5) {
        newSlow.push({
          url: p2.url,
          oldTime: p1.loadTimeMs,
          newTime: p2.loadTimeMs
        });
      }
    }

    return {
      run1Id: run1.id,
      run2Id: run2.id,
      comparisonTime: new Date().toISOString(),
      newPagesCount: newPages.length,
      newPages,
      newBrokenCount: newBroken.length,
      newBroken,
      fixedCount: fixed.length,
      fixed,
      newValidationFailuresCount: newValidationFailures.length,
      newValidationFailures,
      newSlowCount: newSlow.length,
      newSlow
    };
  }

  static printComparisonReport(comparison: any): void {
    console.log('\n==================================================');
    console.log('            RUN COMPARISON REPORT                 ');
    console.log('==================================================');
    console.log(`Comparing ${comparison.run1Id} (Base) -> ${comparison.run2Id} (Current)`);
    console.log(`Generated at: ${comparison.comparisonTime}\n`);

    console.log(`New Pages Discovered: ${comparison.newPagesCount}`);
    if (comparison.newPagesCount > 0) {
      comparison.newPages.forEach((url: string) => console.log(`  + ${url}`));
    }

    console.log(`\nNew Broken Pages: ${comparison.newBrokenCount}`);
    if (comparison.newBrokenCount > 0) {
      comparison.newBroken.forEach((item: string) => console.log(`  x ${item}`));
    }

    console.log(`\nPages Fixed: ${comparison.fixedCount}`);
    if (comparison.fixedCount > 0) {
      comparison.fixed.forEach((item: string) => console.log(`  ✓ ${item}`));
    }

    console.log(`\nNew Validation Failures: ${comparison.newValidationFailuresCount}`);
    if (comparison.newValidationFailuresCount > 0) {
      comparison.newValidationFailures.forEach((item: any) => {
        console.log(`  ! ${item.url} -> [${item.rule}] ${item.message}`);
      });
    }

    console.log(`\nNew Slow Pages (>3s and significantly degraded): ${comparison.newSlowCount}`);
    if (comparison.newSlowCount > 0) {
      comparison.newSlow.forEach((item: any) => {
        console.log(`  ⏱ ${item.url} -> ${item.oldTime}ms to ${item.newTime}ms`);
      });
    }
    console.log('==================================================\n');
  }
}
