import { ValidationRule } from '../ValidationRule';
import { HttpStatusCodeRule } from './HttpStatusCodeRule';
import { PageTitleRule } from './PageTitleRule';
import { MetaDescriptionRule } from './MetaDescriptionRule';
import { H1TagRule } from './H1TagRule';
import { CanonicalTagRule } from './CanonicalTagRule';
import { RobotsMetaRule } from './RobotsMetaRule';
import { BrokenLinksRule } from './BrokenLinksRule';
import { ConsoleErrorsRule } from './ConsoleErrorsRule';
import { LoadTimeRule } from './LoadTimeRule';

export const defaultValidationRules: ValidationRule[] = [
  new HttpStatusCodeRule(),
  new PageTitleRule(),
  new MetaDescriptionRule(),
  new H1TagRule(),
  new CanonicalTagRule(),
  new RobotsMetaRule(),
  new BrokenLinksRule(),
  new ConsoleErrorsRule(),
  new LoadTimeRule()
];
