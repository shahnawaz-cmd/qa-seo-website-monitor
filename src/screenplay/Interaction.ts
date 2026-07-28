import { Actor } from './Actor';

export abstract class Interaction {
  abstract performAs(actor: Actor): Promise<void>;
}
