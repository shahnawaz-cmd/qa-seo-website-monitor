import { PageReport, ValidationResult } from '../../../types';
import { ValidationRule } from '../ValidationRule';

export class HttpStatusCodeRule implements ValidationRule {
  name = 'HTTP Status Code Validation';

  validate(report: PageReport): ValidationResult {
    const passed = report.statusCode >= 200 && report.statusCode < 400;
    return {
      ruleName: this.name,
      passed,
      severity: 'error',
      message: passed
        ? `Status code is healthy: ${report.statusCode}`
        : `Page returned broken status code: ${report.statusCode} (${report.statusText})`,
      actual: String(report.statusCode),
      expected: '200-399'
    };
  }
}
