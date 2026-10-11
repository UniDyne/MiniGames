import { EventBus } from './events.js';

let nextUid = 1;

// Items are value objects; inventory copies get a stable uid.
export function cloneItem(item) {
  return { ...item, uid: nextUid++ };
}

// A combat participant (player or enemy).
//
// Two stat models are supported:
//  - Derived: stats.str + equipped weapon determine attackBonus/damageExpr.
//  - Fixed: def.atk / def.dmg are used directly (NPCs).
export class Entity {
  constructor(def, bus) {
    this.bus = bus;
    this.name = def.name;
    this.stats = { str: 10, dex: 10, con: 10, ...def.stats };
    this.maxHp = def.maxHp;
    this.hp = def.hp ?? def.maxHp;
    this.baseAc = def.ac ?? 10;
    this.gold = def.gold ?? 0;
    this.inventory = [];
    this.equipment = { weapon: null, armor: null };
    this.abilities = (def.abilities ?? []).map((a) => ({ ...a, cooldown: 0 }));
    this.flags = new Set(def.flags ?? []);
    this.fixedAtk = def.atk ?? null;
    this.fixedDmg = def.dmg ?? null;
    this.ai = def.ai ?? null;
  }

  get weapon() {
    return this.equipment.weapon;
  }

  get armor() {
    return this.equipment.armor;
  }

  get attackBonus() {
    if (this.fixedAtk != null) {
      return this.fixedAtk + (this.flags.has('enraged') ? 2 : 0);
    }
    const strMod = Math.floor((this.stats.str - 10) / 2);
    return strMod + (this.weapon ? this.weapon.atk : 0);
  }

  get damageExpr() {
    return this.fixedDmg ?? (this.weapon ? this.weapon.dmg : '1d4');
  }

  get defense() {
    return this.baseAc + (this.armor ? this.armor.ac : 0);
  }

  isDead() {
    return this.hp <= 0;
  }

  getAbility(id) {
    return this.abilities.find((a) => a.id === id) ?? null;
  }

  tickCooldowns() {
    for (const a of this.abilities) {
      if (a.cooldown > 0) {
        a.cooldown--;
      }
    }
  }

  takeDamage(n) {
    this.hp = Math.max(0, this.hp - n);
    this.bus.emit('hp', { who: this.name, hp: this.hp, maxHp: this.maxHp });
    return this.hp;
  }

  heal(n) {
    this.hp = Math.min(this.maxHp, this.hp + n);
    this.bus.emit('hp', { who: this.name, hp: this.hp, maxHp: this.maxHp });
    return this.hp;
  }

  addGold(n) {
    this.gold = Math.max(0, this.gold + n);
    this.bus.emit('gold', { who: this.name, gold: this.gold });
  }

  spendGold(n) {
    this.gold -= n;
    this.bus.emit('gold', { who: this.name, gold: this.gold });
  }

  addItem(item) {
    this.inventory.push(cloneItem(item));
    this.bus.emit('inventory', { who: this.name });
    return this.inventory[this.inventory.length - 1];
  }

  hasItem(uid) {
    return this.inventory.some((i) => i.uid === uid);
  }

  getItem(uid) {
    return this.inventory.find((i) => i.uid === uid) ?? null;
  }

  removeItem(uid) {
    const i = this.inventory.findIndex((it) => it.uid === uid);
    if (i === -1) {
      return null;
    }
    const [item] = this.inventory.splice(i, 1);
    this.bus.emit('inventory', { who: this.name });
    return item;
  }

  // Equip an item from inventory into a slot; the previously equipped
  // item (if any) returns to inventory. This is the swap mechanic.
  equip(slot, uid) {
    const item = this.removeItem(uid);
    if (!item || item.type !== slot) {
      throw new Error(`Cannot equip ${item ? item.name : 'item'} in ${slot} slot`);
    }
    const old = this.equipment[slot];
    this.equipment[slot] = item;
    if (old) {
      this.inventory.push(old);
    }
    this.bus.emit('inventory', { who: this.name });
    return item;
  }

  unequip(slot) {
    const item = this.equipment[slot];
    if (!item) {
      return null;
    }
    this.equipment[slot] = null;
    this.inventory.push(item);
    this.bus.emit('inventory', { who: this.name });
    return item;
  }
}

// The whole game world: phase, level, participants, log.
export class GameState {
  constructor(bus) {
    this.bus = bus;
    this.phase = 'idle'; // idle | combat | victory | shop | defeat
    this.level = 0;
    this.round = 0;
    this.player = null;
    this.enemy = null;
    this.log = [];
    this.lastReward = null;
  }

  setPhase(phase) {
    this.phase = phase;
    this.bus.emit('phase', { phase });
  }

  addLog(text) {
    this.log.push({ level: this.level, round: this.round, text });
    this.bus.emit('log', { text });
  }
}
