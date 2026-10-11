# D20 Engine + Arena Fighter

A small D20 game engine (rules + game state) and a reference game built on it:
an arena fighter with escalating difficulty and an inventory shop between fights.
Runs in the web browser, no build step, no dependencies.

## Run

Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server
# then visit http://localhost:8000/
```

## Test

```
node d20-arena/tests/test.mjs
```

## Layout

```
engine/          the reusable framework (game-agnostic)
  dice.js        d20 / NdM rolls, ability modifiers
  events.js      EventBus — the only channel state changes reach the UI
  state.js       GameState (phase machine) + Entity (stats, inventory, equipment)
  rules.js       Rule / RuleEngine — the rule framework + enforcement
  combat.js      initiative, attack resolution, enemy AI
game/            the reference game (uses the engine)
  rules.js       arena rules + all game data (items, enemies, abilities)
  game.js        Game facade: wires bus+state+engine, exposes execute/can
ui.js            browser UI — talks to the game ONLY via game.execute/can
index.html       page + styles
tests/
  test.mjs       headless test suite (node)
```

## The rule framework

A `Rule` is a named action with two parts:

```js
new Rule({
  name: 'buyItem',
  when: (state, ctx) => state.phase === 'shop' && state.player.gold >= ctx.cost, // guard
  apply: (state, ctx) => { /* mutate state */ },                                 // effect
})
```

**Enforcement contract:** the `RuleEngine` is the *only* path by which game
state may change. UI code calls `engine.execute(name, ctx)` (and pre-checks with
`engine.canExecute` to enable/disable controls). A guard failure raises
`RuleViolation` — illegal actions are loud, not silently ignored.

This is what makes rules *enforced*, not just *described*: the UI cannot buy
outside the shop, attack outside combat, or spend gold it doesn't have, because
those transitions simply don't exist outside the rules.

## Game state

`GameState` is a phase machine: `idle → combat → victory → shop → combat → … → defeat`.
`Entity` (player or enemy) owns stats, HP, gold, inventory, and equipment.
Two stat models: derived (player — STR + weapon) and fixed (NPCs).

## The reference game

- **Combat**: initiative (DEX) each round, d20 attack vs AC, crits on 20,
  fumbles on 1, STR adds to melee damage. Player has two abilities on cooldowns
  (Power Strike, Second Wind).
- **Escalating difficulty**: 10-enemy roster; each level past 10 wraps with a
  tier bonus (flat HP/AC/atk + gold), so it escalates without bound.
- **Shop between fights**: buy weapons/armor (swap equipment), full heal, and
  two permanent upgrades — Vigor (+10 max HP) and Might (+2 STR). STR feeds
  damage, so Might is the growth axis that keeps pace with escalating enemies.

## Design note: why the player can keep up

Enemy HP scales linearly with level. The player's damage is capped by weapon
tier, so without a *damage* growth axis the player hits an unwinnable wall.
Might (+STR → +melee damage) provides that axis; Vigor (+max HP) provides the
survival axis. Tuning the gold economy is what makes the curve feel fair — see
the test suite's simulation for the current balance point (median ~level 7).
