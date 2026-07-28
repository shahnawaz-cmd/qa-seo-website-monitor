import { PageReport, ValidationResult } from '../../../types';
import { ValidationRule } from '../ValidationRule';

export class PageTitleRule implements ValidationRule {
  name = 'Page Title Validation';

  validate(report: PageReport): ValidationResult {
    const title = report.title.trim();
    if (!title) {
      return {
        ruleName: this.name,
        passed: false,
        severity: 'warning',
        message: 'Page title is missing or empty',
        actual: '',
        expected: 'Non-empty string'
      };
    }

    const length = title.length;
    const isGoodLength = length >= 10 && length <= 60;
    
    return {
      ruleName: this.name,
      passed: true, // It exists, so passes main check
      severity: 'warning',
      message: isGoodLength
        ? `Page title has optimal length (${length} characters): "${title}"`
        : `Page title length is sub-optimal (${length} characters, recommended 10-60): "${title}"`,
      actual: `${length} chars`,
      expected: '10-60 chars'
    };
  }
}
