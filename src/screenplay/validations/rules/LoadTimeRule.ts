import { PageReport, ValidationResult } from '../../../types';
import { ValidationRule } from '../ValidationRule';

export class LoadTimeRule implements ValidationRule {
  name = 'Page Load Time Validation';
  private readonly thresholdMs = 3000; // 3 seconds threshold

  validate(report: PageReport): ValidationResult {
    const passed = report.loadTimeMs <= this.thresholdMs;
    return {
      ruleName: this.name,
      passed,
      severity: 'warning',
      message: passed
        ? `Page load time was healthy: ${report.loadTimeMs} ms`
        : `Page load time exceeded recommended threshold of ${this.thresholdMs} ms: ${report.loadTimeMs} ms`,
      actual: `${report.loadTimeMs} ms`,
      expected: `<= ${this.thresholdMs} ms`
    };
  }
}
