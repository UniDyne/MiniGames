// D20 dice utilities.

export function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function rollDie(sides) {
  return randInt(1, sides);
}

// Parses and rolls expressions like "2d6+3" or "1d20-1".
export function rollDice(expr) {
  const m = /^(\d*)d(\d+)([+-]\d+)?$/i.exec(String(expr).trim());
  if (!m) {
    throw new Error(`Bad dice expression: ${expr}`);
  }
  const count = m[1] === '' ? 1 : parseInt(m[1], 10);
  const sides = parseInt(m[2], 10);
  const bonus = m[3] ? parseInt(m[3], 10) : 0;
  let total = bonus;
  const rolls = [];
  for (let i = 0; i < count; i++) {
    const r = rollDie(sides);
    rolls.push(r);
    total += r;
  }
  return { total, rolls };
}

export function rollD20() {
  const value = rollDie(20);
  return {
    value,
    isCrit: value === 20,
    isFumble: value === 1,
  };
}

// Standard D20 ability modifier.
export function modifier(score) {
  return Math.floor((score - 10) / 2);
}
