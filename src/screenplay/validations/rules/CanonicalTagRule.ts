import { PageReport, ValidationResult } from '../../../types';
import { ValidationRule } from '../ValidationRule';

export class CanonicalTagRule implements ValidationRule {
  name = 'Canonical Tag Validation';

  validate(report: PageReport): ValidationResult {
    const canonical = report.canonical.trim();
    if (!canonical) {
      return {
        ruleName: this.name,
        passed: false,
        severity: 'warning',
        message: 'Canonical link tag is missing',
        actual: '',
        expected: 'Canonical URL link tag'
      };
    }

    // A good canonical tag matches or is closely related to the current URL
    const isMatching = canonical === report.url;
    return {
      ruleName: this.name,
      passed: true,
      severity: 'warning',
      message: isMatching
        ? `Canonical tag is valid and matches the page URL: "${canonical}"`
        : `Canonical tag is present but differs from URL: "${canonical}" (Page URL: "${report.url}")`,
      actual: canonical,
      expected: report.url
    };
  }
}
