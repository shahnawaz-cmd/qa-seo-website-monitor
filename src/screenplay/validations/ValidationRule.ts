import { PageReport, ValidationResult } from '../../types';

export interface ValidationRule {
  name: string;
  validate(report: PageReport): ValidationResult;
}
