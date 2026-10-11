// Reference game rules: arena fighter.
//
// Phases: idle -> combat -> victory -> shop -> combat -> ... -> defeat
//
// Every state change goes through a Rule. The UI can only call
// engine.execute(name) — see the enforcement contract in rules.js.

import { Rule } from '../engine/rules.js';
import { Entity } from '../engine/state.js';
import { initiativeOrder, attack, enemyAct } from '../engine/combat.js';

// ---- Data -------------------------------------------------------------

export const WEAPONS = [
  { id: 'w0', name: 'Rusty Dagger', type: 'weapon', atk: 2, dmg: '1d6', cost: 0, desc: 'Better than fists.' },
  { id: 'w1', name: 'Shortsword', type: 'weapon', atk: 3, dmg: '1d8', cost: 25, desc: 'A solid blade.' },
  { id: 'w2', name: 'Battle Axe', type: 'weapon', atk: 4, dmg: '1d10', cost: 70, desc: 'Heavy, honest steel.' },
  { id: 'w3', name: 'Flamebrand', type: 'weapon', atk: 6, dmg: '1d12', cost: 160, desc: 'Burns with inner fire.' },
  { id: 'w4', name: 'Sunforged Greatsword', type: 'weapon', atk: 8, dmg: '2d10', cost: 350, desc: 'Forged in a dying star.' },
];

export const ARMORS = [
  { id: 'a1', name: 'Leather Armor', type: 'armor', ac: 2, cost: 20, desc: 'Stiffened hide.' },
  { id: 'a2', name: 'Chainmail', type: 'armor', ac: 4, cost: 55, desc: 'Ten thousand rings.' },
  { id: 'a3', name: 'Plate Armor', type: 'armor', ac: 6, cost: 140, desc: 'A walking fortress.' },
];

export const PLAYER_ABILITIES = [
  { id: 'powerStrike', name: 'Power Strike', maxCooldown: 3, desc: 'One devastating blow: 1d8 + STR damage.',
    apply: (s, { user, target }) => {
      const strMod = Math.floor((user.stats.str - 10) / 2);
      const dmg = 1 + Math.floor(Math.random() * 8) + strMod;
      target.takeDamage(dmg);
      s.addLog(`Power Strike! ${dmg} damage.`);
    } },
  { id: 'secondWind', name: 'Second Wind', maxCooldown: 4, desc: 'Catch your breath: heal 12 HP.',
    apply: (s, { user }) => {
      user.heal(12);
      s.addLog(`Second Wind. (${user.hp}/${user.maxHp} HP)`);
    } },
];

export const ENEMIES = [
  { name: 'Gutter Rat', maxHp: 8, ac: 11, atk: 1, dmg: '1d4', gold: 28, ai: 'aggressive' },
  { name: 'Bandit', maxHp: 14, ac: 12, atk: 2, dmg: '1d6', gold: 42, ai: 'aggressive' },
  { name: 'Goblin Raider', maxHp: 18, ac: 13, atk: 3, dmg: '1d6', gold: 62, ai: 'cunning',
    abilities: [{ id: 'gkick', name: 'Dirty Kick', maxCooldown: 3, cooldown: 0,
      apply: (s, { user, target }) => { target.takeDamage(4); s.addLog(`It lands a dirty kick for 4 damage!`); } }] },
  { name: 'Orc Brute', maxHp: 28, ac: 14, atk: 4, dmg: '1d8', gold: 95, ai: 'berserk' },
  { name: 'Skeleton Knight', maxHp: 34, ac: 15, atk: 5, dmg: '1d8', gold: 140, ai: 'cunning',
    abilities: [{ id: 'sweep', name: 'Bone Sweep', maxCooldown: 3, cooldown: 0,
      apply: (s, { user, target }) => { target.takeDamage(7); s.addLog(`A bone sweep rakes for 7 damage!`); } }] },
  { name: 'Ogre Chieftain', maxHp: 45, ac: 16, atk: 6, dmg: '1d10', gold: 200, ai: 'berserk' },
  { name: 'Wraith', maxHp: 50, ac: 17, atk: 7, dmg: '1d10', gold: 270, ai: 'cunning',
    abilities: [{ id: 'drain', name: 'Life Drain', maxCooldown: 3, cooldown: 0,
      apply: (s, { user, target }) => {
        const dmg = 6;
        target.takeDamage(dmg);
        user.heal(dmg);
        s.addLog(`It drains ${dmg} life!`);
      } }] },
  { name: 'Stone Golem', maxHp: 60, ac: 18, atk: 8, dmg: '1d10', gold: 350, ai: 'aggressive' },
  { name: 'Vampire Lord', maxHp: 75, ac: 19, atk: 9, dmg: '2d6', gold: 460, ai: 'berserk' },
  { name: 'Dragon Whelp', maxHp: 90, ac: 20, atk: 10, dmg: '2d8', gold: 600, ai: 'cunning',
    abilities: [{ id: 'flame', name: 'Flame Breath', maxCooldown: 3, cooldown: 0,
      apply: (s, { user, target }) => { target.takeDamage(12); s.addLog(`Flame breath engulfs for 12 damage!`); } }] },
];

// Difficulty scaling: each level past 10 wraps the roster with a tier
// bonus (flat HP/AC/atk and a gold bonus), so difficulty escalates
// without bound.
export function enemyForLevel(level) {
  const base = ENEMIES[(level - 1) % ENEMIES.length];
  const tier = Math.floor((level - 1) / ENEMIES.length);
  return {
    ...base,
    name: tier > 0 ? `${base.name} (T${tier + 1})` : base.name,
    maxHp: base.maxHp + tier * 10,
    ac: base.ac + tier,
    atk: base.atk + tier,
    gold: base.gold + tier * 25,
  };
}

export function makePlayer(bus) {
  const p = new Entity({
    name: 'You',
    stats: { str: 14, dex: 12, con: 12 },
    maxHp: 40,
    ac: 10,
    gold: 50,
    abilities: PLAYER_ABILITIES,
  }, bus);
  p.addItem({ ...WEAPONS[0] });
  p.equip('weapon', p.inventory[0].uid);
  return p;
}

// ---- Rules ------------------------------------------------------------

export function registerArenaRules(engine) {
  const spawnEnemy = (st) => {
    st.level += 1;
    const def = enemyForLevel(st.level);
    st.enemy = new Entity(def, st.bus);
    return st.enemy;
  };

  const settle = (st) => {
    if (st.enemy.isDead()) {
      st.addLog(`${st.enemy.name} is defeated!`);
      st.player.addGold(st.enemy.gold);
      st.lastReward = { gold: st.enemy.gold };
      st.setPhase('victory');
    } else if (st.player.isDead()) {
      st.addLog('You collapse. The arena falls silent.');
      st.setPhase('defeat');
    }
  };

  engine.register(new Rule({
    name: 'startGame',
    description: 'Start a new run (idle only)',
    when: (st) => st.phase === 'idle',
    apply: (st) => {
      st.level = 0;
      st.round = 0;
      st.log = [];
      st.player = makePlayer(st.bus);
      st.addLog('You step into the arena. The crowd roars.');
      st.setPhase('combat');
      spawnEnemy(st);
      st.addLog(`Level 1 — ${st.enemy.name} enters the arena!`);
      return { level: 1 };
    },
  }));

  engine.register(new Rule({
    name: 'endTurn',
    description: 'Attack, then the enemy acts (combat only)',
    when: (st) => st.phase === 'combat' && !st.enemy.isDead() && !st.player.isDead(),
    apply: (st) => {
      st.round += 1;
      const order = initiativeOrder(st);
      for (const who of order) {
        if (st.player.isDead() || st.enemy.isDead()) {
          break;
        }
        if (who === 'player') {
          attack(st.player, st.enemy, st);
        } else {
          enemyAct(st);
        }
      }
      st.player.tickCooldowns();
      settle(st);
      return { round: st.round };
    },
  }));

  engine.register(new Rule({
    name: 'useAbility',
    description: 'Use a player ability (combat only, off cooldown)',
    when: (st, ctx) => {
      if (st.phase !== 'combat') {
        return false;
      }
      const a = st.player.getAbility(ctx.abilityId);
      return !!a && a.cooldown === 0 && !st.enemy.isDead() && !st.player.isDead();
    },
    apply: (st, ctx) => {
      const a = st.player.getAbility(ctx.abilityId);
      a.apply(st, { user: st.player, target: st.enemy });
      a.cooldown = a.maxCooldown + 1; // ticks down at end of this turn
      if (!st.enemy.isDead()) {
        enemyAct(st);
      }
      st.player.tickCooldowns();
      settle(st);
      return { ability: a.name };
    },
  }));

  engine.register(new Rule({
    name: 'buyItem',
    description: 'Buy an item (shop only, enough gold)',
    when: (st, ctx) => st.phase === 'shop' && st.player.gold >= ctx.cost,
    apply: (st, ctx) => {
      st.player.spendGold(ctx.cost);
      st.player.addItem(ctx.item);
      st.addLog(`Bought ${ctx.item.name} for ${ctx.cost} gold.`);
      return { item: ctx.item.name };
    },
  }));

  engine.register(new Rule({
    name: 'equipItem',
    description: 'Equip an owned item, swapping the current one (shop only)',
    when: (st, ctx) => st.phase === 'shop' && st.player.hasItem(ctx.uid),
    apply: (st, ctx) => {
      const item = st.player.equip(ctx.item.type, ctx.uid);
      st.addLog(`Equipped ${item.name}.`);
      return { item: item.name };
    },
  }));

  engine.register(new Rule({
    name: 'heal',
    description: 'Full heal at the infirmary (shop only, costs gold)',
    when: (st, ctx) => st.phase === 'shop' && st.player.hp < st.player.maxHp && st.player.gold >= ctx.cost,
    apply: (st, ctx) => {
      st.player.spendGold(ctx.cost);
      st.player.heal(9999);
      st.addLog(`The infirmary patches you up. (${st.player.hp}/${st.player.maxHp} HP)`);
      return { hp: st.player.hp };
    },
  }));

  engine.register(new Rule({
    name: 'buyVigor',
    description: 'Permanent +10 max HP (shop only, costs gold)',
    when: (st, ctx) => st.phase === 'shop' && st.player.gold >= ctx.cost,
    apply: (st, ctx) => {
      st.player.spendGold(ctx.cost);
      st.player.maxHp += 10;
      st.player.heal(10);
      st.addLog(`Vigor Elixir: max HP is now ${st.player.maxHp}.`);
      return { maxHp: st.player.maxHp };
    },
  }));

  engine.register(new Rule({
    name: 'buyMight',
    description: 'Permanent +2 STR (shop only, costs gold)',
    when: (st, ctx) => st.phase === 'shop' && st.player.gold >= ctx.cost,
    apply: (st, ctx) => {
      st.player.spendGold(ctx.cost);
      st.player.stats.str += 2;
      st.addLog(`Might Elixir: STR is now ${st.player.stats.str}.`);
      return { str: st.player.stats.str };
    },
  }));

  engine.register(new Rule({
    name: 'continueFight',
    description: 'Fight the next level (victory or shop)',
    when: (st) => st.phase === 'victory' || st.phase === 'shop',
    apply: (st) => {
      st.round = 0;
      spawnEnemy(st);
      st.setPhase('combat');
      st.addLog(`Level ${st.level} — ${st.enemy.name} enters the arena!`);
      return { level: st.level };
    },
  }));

  engine.register(new Rule({
    name: 'enterShop',
    description: 'Visit the shop (victory only)',
    when: (st) => st.phase === 'victory',
    apply: (st) => {
      st.setPhase('shop');
      st.addLog('You leave the arena for the market.');
      return {};
    },
  }));

  engine.register(new Rule({
    name: 'restart',
    description: 'Start over (defeat only)',
    when: (st) => st.phase === 'defeat',
    apply: (st) => {
      st.level = 0;
      st.log = [];
      st.addLog('The crier calls for a new challenger.');
      st.setPhase('idle');
      return {};
    },
  }));
}
