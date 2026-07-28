import { PageReport, ValidationResult } from '../../../types';
import { ValidationRule } from '../ValidationRule';

export class BrokenLinksRule implements ValidationRule {
  name = 'Broken Internal Links Validation';

  validate(report: PageReport): ValidationResult {
    const broken = report.brokenInternalLinks.filter(link => !link.passed);
    const passed = broken.length === 0;

    return {
      ruleName: this.name,
      passed,
      severity: 'warning',
      message: passed
        ? 'No broken internal links detected on the page.'
        : `Detected ${broken.length} broken internal link(s) on the page.`,
      actual: `${broken.length} broken links`,
      expected: '0 broken links'
    };
  }
}
