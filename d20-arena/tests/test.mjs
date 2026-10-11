// Headless tests for the engine + reference game.
// Run: node d20-arena/tests/test.mjs

import assert from 'node:assert/strict';
import { rollDice, rollD20, modifier } from '../engine/dice.js';
import { RuleViolation } from '../engine/rules.js';
import { Game } from '../game/game.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

// Force the next round to be a guaranteed player win:
// enemy at 1 HP and AC 1 (any hit, even a natural 1, kills it) and 0
// damage (0d4), so even a natural-20 crit off a -100 attack bonus
// deals nothing.
function forceWin(g) {
  const s = g.state;
  s.enemy.hp = 1;
  s.enemy.baseAc = 1;
  s.enemy.fixedAtk = -100;
  s.enemy.fixedDmg = '0d4';
}

test('dice: rollDice parses and bounds totals', () => {
  for (let i = 0; i < 500; i++) {
    const { total } = rollDice('2d6+3');
    assert.ok(total >= 5 && total <= 15, `2d6+3 out of range: ${total}`);
  }
  const single = rollDice('1d20');
  assert.ok(single.total >= 1 && single.total <= 20);
});

test('dice: rollD20 flags crits and fumbles', () => {
  for (let i = 0; i < 500; i++) {
    const r = rollD20();
    assert.equal(r.isCrit, r.value === 20);
    assert.equal(r.isFumble, r.value === 1);
  }
});

test('dice: modifier(14) === 2', () => {
  assert.equal(modifier(14), 2);
  assert.equal(modifier(9), -1);
});

test('rules: unknown action raises RuleViolation', () => {
  const g = new Game();
  assert.throws(() => g.execute('teleport'), RuleViolation);
});

test('rules: endTurn is illegal while idle', () => {
  const g = new Game();
  assert.equal(g.can('endTurn'), false);
  assert.throws(() => g.execute('endTurn'), RuleViolation);
});

test('rules: startGame works from idle and sets up combat', () => {
  const g = new Game();
  g.execute('startGame');
  const s = g.state;
  assert.equal(s.phase, 'combat');
  assert.equal(s.level, 1);
  assert.ok(s.enemy && !s.enemy.isDead());
  assert.equal(s.player.weapon.name, 'Rusty Dagger');
  assert.equal(s.player.inventory.length, 0); // dagger equipped, not in bag
});

test('rules: combat resolves to victory, gold awarded', () => {
  const g = new Game();
  g.execute('startGame');
  const s = g.state;
  const goldBefore = s.player.gold;
  forceWin(g);
  g.execute('endTurn');
  assert.equal(s.phase, 'victory');
  assert.equal(s.player.gold, goldBefore + s.enemy.gold);
  assert.equal(s.lastReward.gold, s.enemy.gold);
});

test('rules: buyItem requires shop phase and gold', () => {
  const g = new Game();
  g.execute('startGame');
  const s = g.state;
  const shortsword = { id: 'w1', name: 'Shortsword', type: 'weapon', atk: 3, dmg: '1d6', cost: 25, desc: '' };
  assert.throws(() => g.execute('buyItem', { item: shortsword, cost: 25 }), RuleViolation);
  forceWin(g);
  g.execute('endTurn');
  g.execute('enterShop');
  assert.equal(s.phase, 'shop');
  const goldBefore = s.player.gold;
  g.execute('buyItem', { item: shortsword, cost: 25 });
  assert.equal(s.player.gold, goldBefore - 25);
  assert.ok(s.player.inventory.some((i) => i.id === 'w1'));
  const expensive = { id: 'a3', name: 'Plate Armor', type: 'armor', ac: 6, cost: 9999, desc: '' };
  assert.throws(() => g.execute('buyItem', { item: expensive, cost: 9999 }), RuleViolation);
});

test('rules: equipItem swaps slots and returns old item to inventory', () => {
  const g = new Game();
  g.execute('startGame');
  const s = g.state;
  forceWin(g);
  g.execute('endTurn');
  g.execute('enterShop');
  const p = s.player;
  const shortsword = { id: 'w1', name: 'Shortsword', type: 'weapon', atk: 3, dmg: '1d6', cost: 25, desc: '' };
  g.execute('buyItem', { item: shortsword, cost: 25 });
  const bought = p.inventory.find((i) => i.id === 'w1');
  g.execute('equipItem', { uid: bought.uid, item: bought });
  assert.equal(p.weapon.id, 'w1');
  assert.ok(p.inventory.some((i) => i.id === 'w0'), 'old dagger should be back in inventory');
  const dagger = p.inventory.find((i) => i.id === 'w0');
  g.execute('equipItem', { uid: dagger.uid, item: dagger });
  assert.equal(p.weapon.id, 'w0');
  assert.ok(p.inventory.some((i) => i.id === 'w1'));
});

test('rules: continueFight escalates level from victory and from shop', () => {
  const g = new Game();
  g.execute('startGame');
  const s = g.state;
  forceWin(g);
  g.execute('endTurn');
  g.execute('continueFight');
  assert.equal(s.phase, 'combat');
  assert.equal(s.level, 2);
  assert.ok(s.enemy && !s.enemy.isDead());
  // From the shop, continueFight also advances (shop is not a dead end).
  forceWin(g);
  g.execute('endTurn');
  g.execute('enterShop');
  g.execute('continueFight');
  assert.equal(s.phase, 'combat');
  assert.equal(s.level, 3);
});

test('rules: defeat phase allows restart and blocks combat actions', () => {
  const g = new Game();
  g.execute('startGame');
  const s = g.state;
  s.player.hp = 1;
  s.enemy.baseAc = 99; // player cannot kill it first
  s.enemy.hp = 999;
  s.enemy.fixedAtk = 100;
  s.enemy.fixedDmg = '4d10';
  g.execute('endTurn');
  assert.equal(s.phase, 'defeat');
  assert.throws(() => g.execute('endTurn'), RuleViolation);
  assert.throws(() => g.execute('enterShop'), RuleViolation);
  g.execute('restart');
  assert.equal(s.phase, 'idle');
  assert.equal(s.level, 0);
});

test('rules: useAbility respects cooldown and phase', () => {
  const g = new Game();
  g.execute('startGame');
  const s = g.state;
  assert.throws(() => g.execute('useAbility', { abilityId: 'nope' }), RuleViolation);
  g.execute('useAbility', { abilityId: 'secondWind' });
  const a = s.player.getAbility('secondWind');
  assert.ok(a.cooldown > 0, 'cooldown should be active after use');
  assert.throws(() => g.execute('useAbility', { abilityId: 'secondWind' }), RuleViolation);
});

test('rules: buyVigor raises max HP permanently (shop only)', () => {
  const g = new Game();
  g.execute('startGame');
  const s = g.state;
  assert.throws(() => g.execute('buyVigor', { cost: 45 }), RuleViolation);
  forceWin(g);
  g.execute('endTurn');
  g.execute('enterShop');
  const hpBefore = s.player.maxHp;
  const hpNow = s.player.hp;
  g.execute('buyVigor', { cost: 45 });
  assert.equal(s.player.maxHp, hpBefore + 10);
  assert.equal(s.player.hp, Math.min(s.player.maxHp, hpNow + 10));
});

test('rules: buyMight raises STR permanently (shop only)', () => {
  const g = new Game();
  g.execute('startGame');
  const s = g.state;
  assert.throws(() => g.execute('buyMight', { cost: 60 }), RuleViolation);
  forceWin(g);
  g.execute('endTurn');
  g.execute('enterShop');
  const strBefore = s.player.stats.str;
  const atkBefore = s.player.attackBonus;
  g.execute('buyMight', { cost: 60 });
  assert.equal(s.player.stats.str, strBefore + 2);
  assert.equal(s.player.attackBonus, atkBefore + 1); // +2 STR = +1 mod
});

test('rules: shop is unreachable from combat; restart is idle-only', () => {
  const g = new Game();
  g.execute('startGame');
  assert.throws(() => g.execute('enterShop'), RuleViolation);
  assert.throws(() => g.execute('restart'), RuleViolation);
});

console.log(`\n${passed} tests passed`);
