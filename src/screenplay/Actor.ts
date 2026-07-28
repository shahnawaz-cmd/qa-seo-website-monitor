import { Ability } from './Ability';
import { Task } from './Task';
import { Interaction } from './Interaction';
import { Question } from './Question';

export class Actor {
  private abilities: Map<string, Ability> = new Map();

  constructor(public readonly name: string) {}

  static named(name: string): Actor {
    return new Actor(name);
  }

  whoCan(ability: Ability): Actor {
    this.abilities.set(ability.constructor.name, ability);
    return this;
  }

  abilityTo<T extends Ability>(abilityClass: new (...args: any[]) => T): T {
    const ability = this.abilities.get(abilityClass.name);
    if (!ability) {
      throw new Error(`Actor ${this.name} does not have the ability: ${abilityClass.name}`);
    }
    return ability as T;
  }

  async attemptsTo(...performables: (Task | Interaction)[]): Promise<void> {
    for (const performable of performables) {
      await performable.performAs(this);
    }
  }

  async asks<T>(question: Question<T>): Promise<T> {
    return await question.answeredBy(this);
  }
}
