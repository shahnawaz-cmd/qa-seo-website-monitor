import { Page, BrowserContext } from '@playwright/test';
import { Ability } from '../Ability';

export class BrowseTheWeb extends Ability {
  constructor(public readonly page: Page, public readonly context: BrowserContext) {
    super();
  }

  static using(page: Page, context: BrowserContext): BrowseTheWeb {
    return new BrowseTheWeb(page, context);
  }
}
