// Game facade: wires bus + state + rule engine together and exposes
// the only two entry points the UI needs: execute / can.

import { EventBus } from '../engine/events.js';
import { GameState } from '../engine/state.js';
import { RuleEngine } from '../engine/rules.js';
import { registerArenaRules, WEAPONS, ARMORS } from './rules.js';

export class Game {
  constructor() {
    this.bus = new EventBus();
    this.state = new GameState(this.bus);
    this.engine = new RuleEngine(this.state);
    registerArenaRules(this.engine);
  }

  execute(name, ctx = {}) {
    return this.engine.execute(name, ctx);
  }

  can(name, ctx = {}) {
    return this.engine.canExecute(name, ctx);
  }

  owns(id) {
    const p = this.state.player;
    if (!p) {
      return false;
    }
    return [p.equipment.weapon, p.equipment.armor, ...p.inventory]
      .some((i) => i && i.id === id);
  }

  // Shop stock: every catalog item the player doesn't own yet.
  // Escalation falls out naturally — once you own a tier, the next
  // tier is what's left on the shelves.
  shopStock() {
    return [...WEAPONS, ...ARMORS].filter((i) => !this.owns(i.id));
  }

  healCost() {
    return 5 + this.state.level * 3;
  }

  vigorCost() {
    return 30 + this.state.level * 15;
  }

  mightCost() {
    return 40 + this.state.level * 20;
  }
}
