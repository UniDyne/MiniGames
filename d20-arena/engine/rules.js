// Rule framework.
//
// A Rule is a named action with two parts:
//   when(state, ctx)  -> guard. Must return true for the action to be legal.
//   apply(state, ctx) -> effect. Mutates state through state mutators only.
//
// Enforcement contract: the RuleEngine is the ONLY path by which game
// state may change. UI code dispatches named actions via engine.execute
// (and pre-checks with engine.canExecute to enable/disable controls).
// A guard failure raises RuleViolation instead of silently no-op'ing,
// so illegal actions are loud, not invisible.

export class RuleViolation extends Error {
  constructor(message) {
    super(message);
    this.name = 'RuleViolation';
  }
}

export class Rule {
  constructor(def) {
    this.name = def.name;
    this.description = def.description ?? def.name;
    this.when = def.when;
    this.apply = def.apply;
  }
}

export class RuleEngine {
  constructor(state) {
    this.state = state;
    this.rules = new Map();
  }

  register(rule) {
    if (this.rules.has(rule.name)) {
      throw new Error(`Duplicate rule: ${rule.name}`);
    }
    this.rules.set(rule.name, rule);
    return this;
  }

  list() {
    return [...this.rules.values()];
  }

  canExecute(name, ctx = {}) {
    const rule = this.rules.get(name);
    if (!rule) {
      return false;
    }
    try {
      return rule.when(this.state, ctx) === true;
    } catch {
      return false;
    }
  }

  execute(name, ctx = {}) {
    const rule = this.rules.get(name);
    if (!rule) {
      throw new RuleViolation(`Unknown action: ${name}`);
    }
    if (rule.when(this.state, ctx) !== true) {
      throw new RuleViolation(`Illegal now: ${rule.description}`);
    }
    const result = rule.apply(this.state, ctx);
    this.state.bus.emit('action', { name, result });
    return result ?? {};
  }
}
