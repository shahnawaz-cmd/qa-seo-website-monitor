import { PageReport, ValidationResult } from '../../../types';
import { ValidationRule } from '../ValidationRule';

export class H1TagRule implements ValidationRule {
  name = 'H1 Tag Validation';

  validate(report: PageReport): ValidationResult {
    const count = report.h1Tags.length;
    if (count === 0) {
      return {
        ruleName: this.name,
        passed: false,
        severity: 'warning',
        message: 'H1 tag is missing on this page',
        actual: '0 H1 tags',
        expected: 'Exactly 1 H1 tag'
      };
    }

    if (count > 1) {
      return {
        ruleName: this.name,
        passed: false,
        severity: 'warning',
        message: `Multiple H1 tags found (${count} tags). Good SEO requires exactly one H1 tag per page.`,
        actual: `${count} H1 tags`,
        expected: 'Exactly 1 H1 tag'
      };
    }

    const h1Content = report.h1Tags[0].trim();
    if (!h1Content) {
      return {
        ruleName: this.name,
        passed: false,
        severity: 'warning',
        message: 'H1 tag is present but contains no text',
        actual: 'Empty text',
        expected: 'Non-empty heading text'
      };
    }

    return {
      ruleName: this.name,
      passed: true,
      severity: 'error',
      message: `H1 tag is present and valid: "${h1Content}"`,
      actual: `1 H1: "${h1Content}"`,
      expected: '1 non-empty H1'
    };
  }
}
