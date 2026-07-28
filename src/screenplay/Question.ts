import { Actor } from './Actor';

export abstract class Question<T> {
  abstract answeredBy(actor: Actor): Promise<T>;
}
