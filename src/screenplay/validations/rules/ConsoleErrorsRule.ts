import { PageReport, ValidationResult } from '../../../types';
import { ValidationRule } from '../ValidationRule';

export class ConsoleErrorsRule implements ValidationRule {
  name = 'Console Errors Validation';

  validate(report: PageReport): ValidationResult {
    const errorCount = report.consoleErrors.length;
    const passed = errorCount === 0;

    return {
      ruleName: this.name,
      passed,
      severity: 'warning',
      message: passed
        ? 'No console errors detected.'
        : `Detected ${errorCount} console error(s). First error: ${report.consoleErrors[0]}`,
      actual: `${errorCount} console error(s)`,
      expected: '0 console errors'
    };
  }
}
