// Combat resolution: turn order, D20 attacks, enemy AI.
// Pure-ish module: reads/writes GameState and emits through the bus.
// It is called only from rules (see rules.js), so the enforcement
// contract holds.

import { rollD20, rollDice } from './dice.js';

// Combat is simultaneous-ish: initiative decides who goes first each
// round; the second actor acts only if still alive.
export function initiativeOrder(state) {
  const p = state.player;
  const e = state.enemy;
  const pd = Math.floor((p.stats.dex - 10) / 2) + rollD20().value;
  const ed = Math.floor((e.stats.dex - 10) / 2) + rollD20().value;
  return pd >= ed ? ['player', 'enemy'] : ['enemy', 'player'];
}

export function attack(attacker, defender, state) {
  const roll = rollD20();
  const bonus = attacker.attackBonus;
  const total = roll.value + bonus;
  const hit = roll.isCrit || total >= defender.defense;
  const miss = !roll.isCrit && roll.isFumble;
  state.addLog(
    `${attacker.name} attacks: d20=${roll.value} +${bonus} vs AC ${defender.defense}` +
      (hit ? (roll.isCrit ? ' — CRITICAL HIT' : ' — hit') : ' — miss')
  );
  if (!hit) {
    return { hit: false, damage: 0, crit: false };
  }
  let { total: dmg } = rollDice(attacker.damageExpr);
  // STR adds to melee damage (D20). Enemies default to STR 10 = +0.
  dmg += Math.floor((attacker.stats.str - 10) / 2);
  if (roll.isCrit) {
    dmg *= 2;
  }
  const remaining = defender.takeDamage(dmg);
  state.addLog(`${defender.name} takes ${dmg} damage (${remaining}/${defender.maxHp} HP)`);
  return { hit: true, damage: dmg, crit: roll.isCrit, hpLeft: remaining };
}

// Enemy AI: simple but escalating.
//  aggressive: attacks every turn.
//  cunning:   attacks, but uses a strong ability when available.
//  berserk:   attacks; below 50% HP gains "enraged" (flat +2 attack,
//             +1 damage die handled via fixedDmg swap) for the rest of
//             the fight.
export function enemyAct(state) {
  const e = state.enemy;
  const p = state.player;
  if (e.ai === 'berserk' && !e.flags.has('enraged') && e.hp * 2 <= e.maxHp) {
    e.flags.add('enraged');
    e.stats.str += 4;
    state.addLog(`${e.name} is ENRAGED!`);
  }
  const ability = e.abilities.find((a) => a.cooldown === 0);
  if (ability && e.ai === 'cunning') {
    ability.apply(state, { user: e, target: p });
    state.addLog(`${e.name} uses ${ability.name}!`);
  } else {
    attack(e, p, state);
  }
  e.tickCooldowns();
}
