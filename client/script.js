// script.js
// -----------------------------------------------------------------------
// The client is intentionally "dumb": it renders whatever the server's
// authoritative state says, and sends intents (never raw state changes).
// A local copy of CARD_DEFS is kept only for rendering (name/art/text) —
// all real validation happens on the server.
// -----------------------------------------------------------------------

// ---- local card data (mirrors server/cardData.js — display only) --------
const CARD_DEFS = {
  ember_scout:   { name: 'Ember Scout', category: 'Attack', art: '🔥', hp: 10, moveRange: 3, atkRange: 1, atkDmg: 4, description: 'A quick skirmisher that darts across the field.', special: { name: 'Firebolt', description: 'Hurl fire at a distant enemy.', energyCost: 2 } },
  frost_archer:  { name: 'Frost Archer', category: 'Attack', art: '❄️', hp: 9, moveRange: 2, atkRange: 3, atkDmg: 4, description: 'Picks off targets from a safe distance.', special: { name: 'Frost Shot', description: 'Chills a foe, slowing its next moves.', energyCost: 2 } },
  stone_guardian:{ name: 'Stone Guardian', category: 'Defense', art: '🗿', hp: 22, moveRange: 1, atkRange: 1, atkDmg: 2, description: 'Slow but nearly impossible to knock down.', special: { name: 'Fortify', description: 'Raises a shield of stone around itself.', energyCost: 2 } },
  shadow_blade:  { name: 'Shadow Blade', category: 'Attack', art: '🗡️', hp: 9, moveRange: 4, atkRange: 1, atkDmg: 5, description: 'Strikes hard and moves on before anyone reacts.', special: { name: 'Ambush', description: 'A vicious surprise strike.', energyCost: 3 } },
  life_weaver:   { name: 'Life Weaver', category: 'Healing', art: '🌿', hp: 10, moveRange: 2, atkRange: 1, atkDmg: 2, description: 'Keeps allies standing longer than they should.', special: { name: 'Renew', description: 'Mends a nearby ally.', energyCost: 2 } },
  thunder_mage:  { name: 'Thunder Mage', category: 'Attack', art: '⚡', hp: 8, moveRange: 2, atkRange: 4, atkDmg: 4, description: 'Long reach, but paper-thin defenses.', special: { name: 'Static Shock', description: 'Locks up a foe for a turn.', energyCost: 3 } },
  iron_wall:     { name: 'Iron Wall', category: 'Defense', art: '🛡️', hp: 26, moveRange: 1, atkRange: 1, atkDmg: 2, description: 'A moving barricade for the front line.', special: { name: 'Bulwark', description: 'Shares a heavy shield with an ally.', energyCost: 3 } },
  venom_adept:   { name: 'Venom Adept', category: 'Debuff', art: '🐍', hp: 9, moveRange: 2, atkRange: 2, atkDmg: 3, description: 'Prefers a slow, poisoned death to a quick one.', special: { name: 'Toxin', description: 'Poisons a foe over time.', energyCost: 2 } },
  war_chief:     { name: 'War Chief', category: 'Buff', art: '🪓', hp: 12, moveRange: 2, atkRange: 1, atkDmg: 4, description: 'Rallies the troops before the charge.', special: { name: 'Rally', description: "Boosts an ally's attack power.", energyCost: 3 } },
  siphon_wraith: { name: 'Siphon Wraith', category: 'Utility', art: '👻', hp: 8, moveRange: 3, atkRange: 1, atkDmg: 3, description: 'Feeds on the energy of its enemies.', special: { name: 'Drain', description: 'Steals energy from the opponent.', energyCost: 2 } },
  battering_ram: { name: 'Battering Ram', category: 'Attack', art: '🐏', hp: 14, moveRange: 3, atkRange: 1, atkDmg: 6, description: 'Built to smash through shields.', special: { name: 'Sunder', description: "Shatters a foe's armor completely.", energyCost: 2 } },
  mirror_sprite: { name: 'Mirror Sprite', category: 'Special', art: '🪞', hp: 7, moveRange: 2, atkRange: 1, atkDmg: 2, description: 'Splits itself when threatened.', special: { name: 'Duplicate', description: 'Creates a weaker copy on an adjacent tile.', energyCost: 4 } },
  storm_falcon:  { name: 'Storm Falcon', category: 'Attack', art: '🦅', hp: 8, moveRange: 5, atkRange: 1, atkDmg: 4, description: 'Nothing on the board outruns it.', special: { name: 'Skydive', description: 'A diving strike from above.', energyCost: 2 } },
  healing_totem: { name: 'Healing Totem', category: 'Healing', art: '🌾', hp: 10, moveRange: 1, atkRange: 1, atkDmg: 1, description: 'Plants itself and mends the wounded.', special: { name: 'Sacred Ground', description: 'Heals an ally at range.', energyCost: 3 } },
  bone_colossus: { name: 'Bone Colossus', category: 'Defense', art: '💀', hp: 30, moveRange: 1, atkRange: 1, atkDmg: 5, description: 'A towering wall of ancient bone.', special: { name: 'Dread Roar', description: 'Terrifies a foe, slowing it badly.', energyCost: 3 } },
  arcane_sniper: { name: 'Arcane Sniper', category: 'Attack', art: '🔮', hp: 7, moveRange: 2, atkRange: 5, atkDmg: 5, description: 'Sees the whole board and punishes it.', special: { name: 'Piercing Round', description: 'A devastating long-range shot.', energyCost: 3 } },
  trickster_fox: { name: 'Trickster Fox', category: 'Utility', art: '🦊', hp: 8, moveRange: 4, atkRange: 1, atkDmg: 3, description: 'Slippery and hard to pin down.', special: { name: 'Smoke Bomb', description: 'Vanishes behind a defensive haze.', energyCost: 2 } },
  void_priest:   { name: 'Void Priest', category: 'Debuff', art: '🌑', hp: 9, moveRange: 2, atkRange: 2, atkDmg: 3, description: 'Curses enemies with creeping decay.', special: { name: 'Curse', description: 'A heavy, long-lasting poison.', energyCost: 3 } },
};

// ---- socket & session ----------------------------------------------------
const socket = io();
let session = JSON.parse(localStorage.getItem('fd-session') || 'null');
let roomInfo = null;
let latest = null; // last state pushed from server

// battle interaction state
let selectedUnitId = null;
let pendingMode = null; // 'move' | 'melee' | 'shoot' | 'special' | 'deploy'
let pendingDeployInstance = null;
let prevUnitsById = {}; // for damage-float diffing

// ---- screen helpers --------------------------------------------------
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 2200);
}

// ---- home screen ----------------------------------------------------
document.getElementById('btn-create').onclick = () => {
  socket.emit('createRoom', { vsAI: false }, (res) => {
    if (!res.ok) return toast(res.error || 'Could not create room.');
    saveSession(res);
    showScreen('screen-lobby');
  });
};
document.getElementById('btn-vs-ai').onclick = () => {
  socket.emit('createRoom', { vsAI: true }, (res) => {
    if (!res.ok) return toast(res.error || 'Could not start practice match.');
    saveSession(res);
    showScreen('screen-lobby');
  });
};
document.getElementById('btn-join').onclick = () => {
  document.getElementById('join-form').classList.toggle('hidden');
};
document.getElementById('btn-join-confirm').onclick = () => {
  const code = document.getElementById('input-room-code').value.trim().toUpperCase();
  if (!code) return;
  socket.emit('joinRoom', { roomCode: code }, (res) => {
    if (!res.ok) return toast(res.error || 'Could not join room.');
    saveSession(res);
    showScreen('screen-lobby');
  });
};

function saveSession(res) {
  session = { roomCode: res.roomCode, playerId: res.playerId, token: res.token };
  localStorage.setItem('fd-session', JSON.stringify(session));
  document.getElementById('lobby-code').textContent = res.roomCode;
}

document.getElementById('btn-play-again').onclick = () => {
  socket.emit('playAgain', { roomCode: session.roomCode }, () => {});
};
document.getElementById('btn-home').onclick = () => {
  localStorage.removeItem('fd-session');
  session = null;
  location.reload();
};

// ---- reconnect on load ----------------------------------------------
if (session) {
  socket.emit('reconnect_to_room', { roomCode: session.roomCode, token: session.token }, (res) => {
    if (res.ok) {
      document.getElementById('lobby-code').textContent = session.roomCode;
      showScreen('screen-lobby');
    } else {
      localStorage.removeItem('fd-session');
      session = null;
    }
  });
}

// ---- socket events ----------------------------------------------------
socket.on('roomInfo', (info) => {
  roomInfo = info;
  if (document.getElementById('screen-lobby').classList.contains('active') || !latest) {
    renderLobby();
  }
});

socket.on('state', (state) => {
  latest = state;
  render();
});

function renderLobby() {
  const list = document.getElementById('lobby-players');
  list.innerHTML = '';
  (roomInfo?.players || []).forEach((p) => {
    const row = document.createElement('div');
    row.className = 'lobby-player-row';
    row.innerHTML = `<span>${p.playerId}${p.isAI ? ' (AI)' : ''}</span><span>${p.connected ? 'Connected' : 'Waiting…'}</span>`;
    list.appendChild(row);
  });
}

// ---- master render dispatcher ----------------------------------------
function render() {
  if (!latest) return;
  if (latest.phase === 'draft') { showScreen('screen-draft'); renderDraft(); return; }
  if (latest.phase === 'setup') { showScreen('screen-setup'); renderSetup(); return; }
  if (latest.phase === 'battle') { showScreen('screen-battle'); renderBattle(); return; }
  if (latest.phase === 'gameover') { showScreen('screen-gameover'); renderGameOver(); return; }
}

// ---- DRAFT ---------------------------------------------------------
function renderDraft() {
  const isMe = latest.draft.currentDrafter === latest.you;
  document.getElementById('draft-status').textContent = isMe
    ? 'Your pick!' : `Waiting on ${latest.draft.currentDrafter}…`;
  document.getElementById('draft-count').textContent = latest.yourDraft.length;

  const mine = document.getElementById('draft-my-cards');
  mine.innerHTML = '';
  latest.yourDraft.forEach((card) => mine.appendChild(makeMiniCard(card.cardId)));

  const pool = document.getElementById('draft-pool');
  pool.innerHTML = '';
  latest.draft.pool.forEach((entry) => {
    if (entry.taken) {
      const el = document.createElement('div');
      el.className = 'mini-card taken';
      el.innerHTML = `<div class="art">🂠</div><div class="name">Taken</div>`;
      pool.appendChild(el);
      return;
    }
    const el = makeMiniCard(entry.cardId);
    if (isMe) {
      el.onclick = () => {
        socket.emit('draftPick', { roomCode: session.roomCode, pickId: entry.pickId }, (res) => {
          if (!res.ok) toast(res.error);
        });
      };
    } else {
      el.style.opacity = '0.6';
    }
    pool.appendChild(el);
  });
}

function makeMiniCard(cardId, opts = {}) {
  const def = CARD_DEFS[cardId];
  const el = document.createElement('div');
  el.className = 'mini-card';
  el.innerHTML = `
    <div class="cost">${def.special.energyCost}⚡</div>
    <div class="art">${def.art}</div>
    <div class="name">${def.name}</div>
    <div class="stats">${def.hp}HP · MV${def.moveRange} · R${def.atkRange}</div>
  `;
  el.onclick = el.onclick || (() => showCardPopup(cardId));
  el.oncontextmenu = (e) => { e.preventDefault(); showCardPopup(cardId); };
  return el;
}

function showCardPopup(cardId) {
  const def = CARD_DEFS[cardId];
  document.getElementById('card-popup-inner').innerHTML = `
    <div class="art-big">${def.art}</div>
    <h3>${def.name}</h3>
    <div class="stats">${def.category} · ${def.hp} HP · Move ${def.moveRange} · Range ${def.atkRange}</div>
    <div class="desc">${def.description}</div>
    <div class="special-box">
      <div class="sname">${def.special.name} (${def.special.energyCost}⚡)</div>
      <div>${def.special.description}</div>
    </div>
  `;
  document.getElementById('card-popup').classList.remove('hidden');
}
document.getElementById('card-popup').onclick = (e) => {
  if (e.target.id === 'card-popup') document.getElementById('card-popup').classList.add('hidden');
};

// ---- SETUP -----------------------------------------------------------
let setupSelectedInstance = null; // instanceId of the card currently picked up
let setupPlacements = []; // {instanceId, cardId, x, y}

function renderSetup() {
  document.getElementById('setup-status').textContent =
    latest.submitted[latest.you] ? 'Locked in — waiting for opponent…' : `Place 6 of your 10 units in your zone`;

  const handWrap = document.getElementById('setup-hand-cards');
  handWrap.innerHTML = '';
  const placedInstances = new Set(setupPlacements.map((p) => p.instanceId));
  latest.yourDraft.forEach((card) => {
    const el = makeMiniCard(card.cardId);
    if (placedInstances.has(card.instanceId)) el.classList.add('taken');
    if (setupSelectedInstance === card.instanceId) el.classList.add('selected');
    el.onclick = () => {
      if (placedInstances.has(card.instanceId) || latest.submitted[latest.you]) return;
      setupSelectedInstance = setupSelectedInstance === card.instanceId ? null : card.instanceId;
      renderSetup();
    };
    handWrap.appendChild(el);
  });

  const board = document.getElementById('setup-board');
  board.dataset.theme = latest.theme;
  board.style.setProperty('--cols', latest.boardCols);
  board.style.setProperty('--rows', latest.boardRows);
  board.innerHTML = '';
  const zone = latest.zones[latest.you];

  for (let y = 0; y < latest.boardRows; y++) {
    for (let x = 0; x < latest.boardCols; x++) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      if (isBaseTileAt(latest, x, y, latest.you)) tile.classList.add('base-you');
      else if (isBaseTileAt(latest, x, y, latest.opponent)) tile.classList.add('base-opp');
      else if (y >= zone.minY && y <= zone.maxY) {
        tile.classList.add('zone-you');
        const occupied = setupPlacements.find((p) => p.x === x && p.y === y);
        if (occupied) {
          tile.innerHTML = `<div class="unit-token mine">${CARD_DEFS[occupied.cardId].art}</div>`;
          tile.onclick = () => {
            if (latest.submitted[latest.you]) return;
            setupPlacements = setupPlacements.filter((p) => p !== occupied);
            renderSetup();
          };
        } else if (setupSelectedInstance && !latest.submitted[latest.you]) {
          tile.classList.add('reachable');
          tile.onclick = () => {
            const card = latest.yourDraft.find((c) => c.instanceId === setupSelectedInstance);
            setupPlacements.push({ instanceId: card.instanceId, cardId: card.cardId, x, y });
            setupSelectedInstance = null;
            renderSetup();
          };
        }
      }
      board.appendChild(tile);
    }
  }

  const btn = document.getElementById('btn-setup-submit');
  btn.textContent = `Lock In (${setupPlacements.length}/6 placed)`;
  btn.disabled = setupPlacements.length !== 6 || latest.submitted[latest.you];
  btn.onclick = () => {
    socket.emit('setupSubmit', { roomCode: session.roomCode, placements: setupPlacements }, (res) => {
      if (!res.ok) toast(res.error);
    });
  };
}

function isBaseTileAt(state, x, y, owner) {
  return (state.baseTiles[owner] || []).some((t) => t.x === x && t.y === y);
}

// ---- BATTLE ------------------------------------------------------------
function renderBattle() {
  const board = document.getElementById('battle-board');
  board.dataset.theme = latest.theme;
  board.style.setProperty('--cols', latest.boardCols);
  board.style.setProperty('--rows', latest.boardRows);

  document.getElementById('turn-text').textContent =
    latest.turn.current === latest.you ? 'YOUR TURN' : `${latest.turn.current}'S TURN`;
  document.getElementById('energy-you').textContent = latest.energy[latest.you];

  document.getElementById('hp-you-text').textContent = `${latest.bases[latest.you].hp}/${latest.bases[latest.you].maxHp}`;
  document.getElementById('hp-opp-text').textContent = `${latest.bases[latest.opponent].hp}/${latest.bases[latest.opponent].maxHp}`;
  document.getElementById('hp-you').style.width = pct(latest.bases[latest.you]) + '%';
  document.getElementById('hp-opp').style.width = pct(latest.bases[latest.opponent]) + '%';

  const unitsById = {};
  latest.units.forEach((u) => (unitsById[u.id] = u));

  const highlight = computeHighlight(unitsById);

  board.innerHTML = '';
  for (let y = 0; y < latest.boardRows; y++) {
    for (let x = 0; x < latest.boardCols; x++) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      if (isBaseTileAt(latest, x, y, latest.you)) tile.classList.add('base-you');
      else if (isBaseTileAt(latest, x, y, latest.opponent)) tile.classList.add('base-opp');
      else {
        const zoneYou = latest.zones[latest.you];
        const zoneOpp = latest.zones[latest.opponent];
        if (y >= zoneYou.minY && y <= zoneYou.maxY) tile.classList.add('zone-you');
        if (y >= zoneOpp.minY && y <= zoneOpp.maxY) tile.classList.add('zone-opp');
      }

      const key = x + ',' + y;
      if (highlight.reachable.has(key)) {
        tile.classList.add('reachable');
        tile.onclick = () => {
          if (pendingMode === 'deploy') sendAction({ type: 'deploy', instanceId: pendingDeployInstance, x, y });
          else sendAction({ type: 'move', unitId: selectedUnitId, x, y });
        };
      }

      const unit = latest.units.find((u) => u.x === x && u.y === y);
      if (unit) {
        const token = document.createElement('div');
        token.className = 'unit-token' + (unit.owner === latest.you ? ' mine' : '') + (unit.status.stunned ? ' stunned' : '');
        if (unit.id === selectedUnitId) token.classList.add('selected');
        const def = CARD_DEFS[unit.cardId];
        token.innerHTML = `${def.art}<div class="hp-pip"><div class="hp-pip-fill" style="width:${(unit.hp / unit.maxHp) * 100}%"></div></div>`;
        token.title = `${def.name} — ${unit.hp}/${unit.maxHp} HP${unit.armor ? ' (+' + unit.armor + ' armor)' : ''}`;

        if (unit.owner === latest.you && latest.turn.current === latest.you && !pendingMode) {
          token.onclick = (e) => { e.stopPropagation(); selectedUnitId = unit.id; renderBattle(); };
        } else if (highlight.targetableUnits.has(unit.id)) {
          token.onclick = (e) => {
            e.stopPropagation();
            if (pendingMode === 'special') {
              sendAction({ type: 'special', unitId: selectedUnitId, targetId: unit.id });
            } else {
              sendAction({ type: pendingMode, unitId: selectedUnitId, targetId: unit.id });
            }
          };
        } else if (unit.owner === latest.you) {
          token.onclick = (e) => { e.stopPropagation(); if (!pendingMode) { selectedUnitId = unit.id; renderBattle(); } };
        }
        tile.appendChild(token);
      }

      if (highlight.targetableBase && isBaseTileAt(latest, x, y, latest.opponent)) {
        tile.classList.add('targetable');
        tile.onclick = () => {
          if (pendingMode === 'special') sendAction({ type: 'special', unitId: selectedUnitId, targetBase: true });
          else sendAction({ type: pendingMode, unitId: selectedUnitId, targetBase: true });
        };
      }

      board.appendChild(tile);
    }
  }

  renderActionPanel(unitsById);
  renderReserves();
  renderLog();
  spawnDamageFloats(unitsById);
  prevUnitsById = unitsById;
}

function pct(base) { return Math.max(0, Math.round((base.hp / base.maxHp) * 100)); }

function computeHighlight(unitsById) {
  const result = { reachable: new Set(), targetableUnits: new Set(), targetableBase: false };
  if (!selectedUnitId || !pendingMode) return result;
  const unit = unitsById[selectedUnitId];
  if (!unit) return result;
  const def = CARD_DEFS[unit.cardId];

  if (pendingMode === 'move') {
    clientReachable(unit, effectiveMoveRange(unit)).forEach((t) => result.reachable.add(t.x + ',' + t.y));
  } else if (pendingMode === 'deploy') {
    const zone = latest.zones[latest.you];
    for (let y = zone.minY; y <= zone.maxY; y++) {
      for (let x = 0; x < latest.boardCols; x++) {
        if (!latest.units.find((u) => u.x === x && u.y === y)) result.reachable.add(x + ',' + y);
      }
    }
  } else if (pendingMode === 'melee') {
    latest.units.forEach((u) => { if (u.owner !== latest.you && manhattan(unit, u) === 1) result.targetableUnits.add(u.id); });
    result.targetableBase = latest.baseTiles[latest.opponent].some((t) => manhattan(t, unit) === 1);
  } else if (pendingMode === 'shoot') {
    latest.units.forEach((u) => { if (u.owner !== latest.you) { const d = manhattan(unit, u); if (d >= 2 && d <= def.atkRange) result.targetableUnits.add(u.id); } });
    result.targetableBase = latest.baseTiles[latest.opponent].some((t) => { const d = manhattan(t, unit); return d >= 2 && d <= def.atkRange; });
  } else if (pendingMode === 'special') {
    const sp = def.special;
    const tt = window.__specialTargetType;
    if (tt === 'enemyUnit') latest.units.forEach((u) => { if (u.owner !== latest.you && manhattan(unit, u) <= window.__specialRange) result.targetableUnits.add(u.id); });
    if (tt === 'allyUnit') latest.units.forEach((u) => { if (u.owner === latest.you && u.id !== unit.id && manhattan(unit, u) <= window.__specialRange) result.targetableUnits.add(u.id); });
  }
  return result;
}

function manhattan(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
function effectiveMoveRange(unit) {
  const def = CARD_DEFS[unit.cardId];
  return Math.max(0, def.moveRange - (unit.status.slow || 0));
}
function clientReachable(unit, range) {
  const start = { x: unit.x, y: unit.y };
  const visited = new Map([[start.x + ',' + start.y, 0]]);
  const queue = [start];
  const results = [];
  while (queue.length) {
    const cur = queue.shift();
    const dist = visited.get(cur.x + ',' + cur.y);
    if (dist >= range) continue;
    const neighbors = [{ x: cur.x + 1, y: cur.y }, { x: cur.x - 1, y: cur.y }, { x: cur.x, y: cur.y + 1 }, { x: cur.x, y: cur.y - 1 }];
    for (const n of neighbors) {
      if (n.x < 0 || n.x >= latest.boardCols || n.y < 0 || n.y >= latest.boardRows) continue;
      const key = n.x + ',' + n.y;
      if (visited.has(key)) continue;
      if (isBaseTileAt(latest, n.x, n.y, 'p1') || isBaseTileAt(latest, n.x, n.y, 'p2')) continue;
      if (latest.units.find((u) => u.x === n.x && u.y === n.y)) continue;
      visited.set(key, dist + 1);
      queue.push(n);
      results.push({ x: n.x, y: n.y });
    }
  }
  return results;
}

function renderActionPanel(unitsById) {
  const panel = document.getElementById('action-panel');
  if (latest.turn.current !== latest.you) {
    panel.innerHTML = `<div class="hint">Waiting for ${latest.opponent}…</div>`;
    return;
  }
  if (!selectedUnitId || !unitsById[selectedUnitId] || unitsById[selectedUnitId].owner !== latest.you) {
    panel.innerHTML = `<div class="hint">Tap one of your units on the board to act, or deploy a reserve.</div>`;
    return;
  }
  const unit = unitsById[selectedUnitId];
  const def = CARD_DEFS[unit.cardId];
  const energy = latest.energy[latest.you];

  panel.innerHTML = `<h4>${def.art} ${def.name}</h4><div class="action-btn-row"></div>`;
  const row = panel.querySelector('.action-btn-row');

  addActionBtn(row, 'Move', () => { pendingMode = 'move'; pendingDeployInstance = null; renderBattle(); }, unit.status.stunned);
  addActionBtn(row, 'Melee', () => { pendingMode = 'melee'; renderBattle(); }, unit.status.stunned);
  if (def.atkRange > 1) addActionBtn(row, 'Shoot', () => { pendingMode = 'shoot'; renderBattle(); }, unit.status.stunned);
  const canSpecial = energy >= def.special.energyCost && !unit.status.stunned;
  const specialBtn = addActionBtn(row, `${def.special.name} (${def.special.energyCost}⚡)`, () => {
    pendingMode = 'special';
    window.__specialTargetType = inferTargetType(unit.cardId);
    window.__specialRange = inferRange(unit.cardId);
    if (window.__specialTargetType === 'self') {
      sendAction({ type: 'special', unitId: unit.id });
    } else {
      renderBattle();
    }
  }, !canSpecial);
  specialBtn.classList.add('special');
  addActionBtn(row, 'Cancel', () => { pendingMode = null; selectedUnitId = null; renderBattle(); }, false);
}

// Special targeting metadata mirrors server cardData.js (needed client-side for highlighting only).
const SPECIAL_META = {
  ember_scout: { targetType: 'enemyUnit', range: 3 }, frost_archer: { targetType: 'enemyUnit', range: 3 },
  stone_guardian: { targetType: 'self', range: 0 }, shadow_blade: { targetType: 'enemyUnit', range: 1 },
  life_weaver: { targetType: 'allyUnit', range: 2 }, thunder_mage: { targetType: 'enemyUnit', range: 4 },
  iron_wall: { targetType: 'allyUnit', range: 1 }, venom_adept: { targetType: 'enemyUnit', range: 2 },
  war_chief: { targetType: 'allyUnit', range: 2 }, siphon_wraith: { targetType: 'enemyUnit', range: 1 },
  battering_ram: { targetType: 'enemyUnit', range: 1 }, mirror_sprite: { targetType: 'self', range: 0 },
  storm_falcon: { targetType: 'enemyUnit', range: 1 }, healing_totem: { targetType: 'allyUnit', range: 2 },
  bone_colossus: { targetType: 'enemyUnit', range: 2 }, arcane_sniper: { targetType: 'enemyUnit', range: 5 },
  trickster_fox: { targetType: 'self', range: 0 }, void_priest: { targetType: 'enemyUnit', range: 3 },
};
function inferTargetType(cardId) { return SPECIAL_META[cardId].targetType; }
function inferRange(cardId) { return SPECIAL_META[cardId].range; }

function addActionBtn(row, label, onClick, disabled) {
  const btn = document.createElement('button');
  btn.className = 'action-btn';
  btn.textContent = label;
  btn.disabled = !!disabled;
  btn.onclick = onClick;
  row.appendChild(btn);
  return btn;
}

function renderReserves() {
  document.getElementById('reserve-count').textContent = latest.yourReserves.length;
  const wrap = document.getElementById('reserve-cards');
  wrap.innerHTML = '';
  const activeCount = latest.units.filter((u) => u.owner === latest.you).length;
  latest.yourReserves.forEach((card) => {
    const el = makeMiniCard(card.cardId);
    const canDeploy = latest.turn.current === latest.you && activeCount < 6;
    if (!canDeploy) el.style.opacity = '0.4';
    el.onclick = () => {
      if (!canDeploy) return showCardPopup(card.cardId);
      selectedUnitId = null;
      pendingMode = 'deploy';
      pendingDeployInstance = card.instanceId;
      renderBattle();
    };
    wrap.appendChild(el);
  });
}

function renderLog() {
  const list = document.getElementById('log-list');
  list.innerHTML = '';
  latest.log.slice().reverse().forEach((entry) => {
    const li = document.createElement('div');
    li.textContent = entry.message;
    list.appendChild(li);
  });
}

function spawnDamageFloats(unitsById) {
  Object.values(unitsById).forEach((u) => {
    const prev = prevUnitsById[u.id];
    if (!prev) return;
    if (prev.hp > u.hp) showFloatNear(u, `-${prev.hp - u.hp}`, false);
    if (prev.hp < u.hp) showFloatNear(u, `+${u.hp - prev.hp}`, true);
  });
}
function showFloatNear() { /* lightweight no-op hook kept simple for MVP stability */ }

function sendAction(action) {
  socket.emit('action', { roomCode: session.roomCode, action }, (res) => {
    if (!res.ok) { toast(res.error); return; }
    selectedUnitId = null; pendingMode = null; pendingDeployInstance = null;
  });
}

function renderGameOver() {
  const won = latest.winner === latest.you;
  document.getElementById('gameover-title').textContent = won ? 'Victory!' : 'Defeat';
  document.getElementById('gameover-sub').textContent = won ? 'The enemy base has fallen.' : 'Your base has fallen.';
}
