import { PageReport, ValidationResult } from '../../../types';
import { ValidationRule } from '../ValidationRule';

export class RobotsMetaRule implements ValidationRule {
  name = 'Robots Meta Tag Validation';

  validate(report: PageReport): ValidationResult {
    const robots = report.robotsMeta.toLowerCase().trim();
    if (!robots) {
      return {
        ruleName: this.name,
        passed: true,
        severity: 'warning',
        message: 'Robots meta tag is missing (standard behavior is index, follow)',
        actual: 'None',
        expected: 'index, follow or custom directives'
      };
    }

    const hasNoIndex = robots.includes('noindex');
    return {
      ruleName: this.name,
      passed: true,
      severity: 'warning',
      message: hasNoIndex
        ? `Robots tag restricts search engines (noindex found): "${report.robotsMeta}"`
        : `Robots tag allows indexing: "${report.robotsMeta}"`,
      actual: report.robotsMeta,
      expected: 'index directives'
    };
  }
}
