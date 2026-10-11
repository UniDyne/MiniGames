// Arena UI. Talks to the game ONLY through game.execute / game.can.
// All rendering is driven by bus events; no direct state mutation here.

import { Game } from './game/game.js';

const game = new Game();

const $ = (sel) => document.querySelector(sel);

function bar(hp, maxHp) {
  const pct = Math.max(0, Math.round((hp / maxHp) * 100));
  return `<div class="bar"><div class="fill ${pct <= 30 ? 'low' : ''}" style="width:${pct}%"></div><span>${hp} / ${maxHp}</span></div>`;
}

function combatantCard(name, c) {
  return `
    <div class="card">
      <div class="card-name">${name}</div>
      ${bar(c.hp, c.maxHp)}
      <div class="stats">
        <span>AC ${c.defense}</span>
        <span>ATK +${c.attackBonus}</span>
        <span>Dmg ${c.damageExpr}</span>
      </div>
      <div class="gear">
        <span>🗡 ${c.weapon ? c.weapon.name : 'Fists'}</span>
        <span>🛡 ${c.armor ? c.armor.name : 'None'}</span>
      </div>
    </div>`;
}

function renderCombat() {
  const s = game.state;
  const arena = $('#arena');
  // No run active (initial idle, before startGame): player/enemy are null.
  if (s.phase === 'idle' || !s.player || !s.enemy) {
    arena.innerHTML = '<div class="vs">The arena awaits.</div>';
    return;
  }
  arena.innerHTML = `
    <div class="vs">ROUND ${s.round}</div>
    ${combatantCard(s.player.name, s.player)}
    ${combatantCard(s.enemy.name, s.enemy)}`;
}

function renderActions() {
  const s = game.state;
  const box = $('#actions');
  box.innerHTML = '';
  const btn = (label, name, ctx = {}, disabled = false) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.disabled = disabled;
    b.addEventListener('click', () => {
      try {
        game.execute(name, ctx);
      } catch (e) {
        s.addLog(`⚠ ${e.message}`);
        render();
      }
    });
    box.appendChild(b);
    return b;
  };

  if (s.phase === 'idle') {
    btn('⚔ Enter the Arena', 'startGame');
  } else if (s.phase === 'combat') {
    btn('⚔ Attack (end turn)', 'endTurn');
    for (const a of s.player.abilities) {
      const cd = a.cooldown;
      const b = btn(`${a.name}${cd > 0 ? ` (${cd})` : ''}`, 'useAbility', { abilityId: a.id }, !game.can('useAbility', { abilityId: a.id }));
      b.title = a.desc;
    }
  } else if (s.phase === 'victory') {
    btn('🏪 Visit the Shop', 'enterShop');
    btn('⚔ Next Level', 'continueFight');
  } else if (s.phase === 'defeat') {
    btn('↻ New Challenger', 'restart');
  }
  // Shop panel is rendered separately in #shop when phase === 'shop'.
}

function renderShop() {
  const s = game.state;
  const p = s.player;
  const shop = $('#shop');
  if (s.phase !== 'shop') {
    shop.innerHTML = '';
    shop.style.display = 'none';
    return;
  }
  shop.style.display = 'block';

  const owned = [p.equipment.weapon, p.equipment.armor, ...p.inventory].filter(Boolean);
  const invRow = (item, equipped) => `
    <div class="item ${equipped ? 'equipped' : ''}">
      <div>
        <b>${item.name}</b>${equipped ? ' <em>(equipped)</em>' : ''}
        <div class="item-desc">${item.desc}
          ${item.atk != null ? ` · ATK +${item.atk} · ${item.dmg}` : ''}
          ${item.ac != null ? ` · AC +${item.ac}` : ''}
        </div>
      </div>
      <button data-act="equip" data-uid="${item.uid}">Equip</button>
    </div>`;

  const stock = game.shopStock();
  const stockRow = (item) => `
    <div class="item">
      <div>
        <b>${item.name}</b> — ${item.cost}g
        <div class="item-desc">${item.desc}
          ${item.atk != null ? ` · ATK +${item.atk} · ${item.dmg}` : ''}
          ${item.ac != null ? ` · AC +${item.ac}` : ''}
        </div>
      </div>
      <button data-act="buy" data-id="${item.id}" ${p.gold < item.cost ? 'disabled' : ''}>Buy</button>
    </div>`;

  const healCost = game.healCost();
  const vigorCost = game.vigorCost();
  const mightCost = game.mightCost();
  shop.innerHTML = `
    <h3>Inventory</h3>
    <div class="grid">${owned.map((i) => invRow(i, i === p.equipment.weapon || i === p.equipment.armor)).join('')}</div>
    <h3>Shop</h3>
    <div class="grid">${stock.map(stockRow).join('')}</div>
    <div class="shop-row">
      <button id="healBtn" ${p.hp >= p.maxHp || p.gold < healCost ? 'disabled' : ''}>
        💊 Infirmary — full heal, ${healCost}g
      </button>
      <button id="vigorBtn" ${p.gold < vigorCost ? 'disabled' : ''}>
        🧪 Vigor Elixir — +10 max HP, ${vigorCost}g
      </button>
      <button id="mightBtn" ${p.gold < mightCost ? 'disabled' : ''}>
        💪 Might Elixir — +2 STR, ${mightCost}g
      </button>
      <button id="fightBtn">⚔ Back to the Arena</button>
    </div>`;

  shop.querySelectorAll('[data-act="buy"]').forEach((b) => {
    b.addEventListener('click', () => {
      const item = stock.find((i) => i.id === b.dataset.id);
      game.execute('buyItem', { item, cost: item.cost });
    });
  });
  shop.querySelectorAll('[data-act="equip"]').forEach((b) => {
    b.addEventListener('click', () => {
      const item = owned.find((i) => i.uid === Number(b.dataset.uid));
      game.execute('equipItem', { uid: item.uid, item });
    });
  });
  const healBtn = $('#healBtn');
  if (healBtn) {
    healBtn.addEventListener('click', () => game.execute('heal', { cost: healCost }));
  }
  const vigorBtn = $('#vigorBtn');
  if (vigorBtn) {
    vigorBtn.addEventListener('click', () => game.execute('buyVigor', { cost: vigorCost }));
  }
  const mightBtn = $('#mightBtn');
  if (mightBtn) {
    mightBtn.addEventListener('click', () => game.execute('buyMight', { cost: mightCost }));
  }
  $('#fightBtn').addEventListener('click', () => game.execute('continueFight'));
}

function renderLog() {
  const log = $('#log');
  const lines = game.state.log.slice(-80);
  log.innerHTML = lines.map((l) => `<div class="line L${l.level}">[${l.level}] ${l.text}</div>`).join('');
  log.scrollTop = log.scrollHeight;
}

function render() {
  const s = game.state;
  $('#level').textContent = s.level > 0 ? `Level ${s.level}` : '—';
  $('#gold').textContent = s.player ? `${s.player.gold}g` : '—';
  $('#phase').textContent = s.phase.toUpperCase();
  renderCombat();
  renderActions();
  renderShop();
  renderLog();
}

// Re-render on any state change the bus reports.
game.bus.on('action', render);
game.bus.on('phase', render);
game.bus.on('log', renderLog);
game.bus.on('hp', render);
game.bus.on('gold', render);
game.bus.on('inventory', render);

render();
