import { PageReport, ValidationResult } from '../../../types';
import { ValidationRule } from '../ValidationRule';

export class MetaDescriptionRule implements ValidationRule {
  name = 'Meta Description Validation';

  validate(report: PageReport): ValidationResult {
    const desc = report.metaDescription.trim();
    if (!desc) {
      return {
        ruleName: this.name,
        passed: false,
        severity: 'warning',
        message: 'Meta description is missing or empty',
        actual: '',
        expected: 'Non-empty string description'
      };
    }

    const length = desc.length;
    const isGoodLength = length >= 50 && length <= 160;

    return {
      ruleName: this.name,
      passed: true,
      severity: 'warning',
      message: isGoodLength
        ? `Meta description has optimal length (${length} characters)`
        : `Meta description length is sub-optimal (${length} characters, recommended 50-160)`,
      actual: `${length} chars`,
      expected: '50-160 chars'
    };
  }
}
