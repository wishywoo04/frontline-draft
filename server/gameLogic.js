// gameLogic.js
// -----------------------------------------------------------------------
// The ENTIRE game is simulated here, server-side. Clients only ever send
// intents ({type:'move', unitId, x, y} etc); this file validates every
// one of them against the authoritative state and is the only place
// that mutates state. Nothing the client sends is trusted.
// -----------------------------------------------------------------------

const { CARD_DEFS } = require('./cardData');

const BOARD_COLS = 6; // x: 0..5
const BOARD_ROWS = 14; // y: 0..13

// Player A (host) base sits at the top, Player B (guest) base at the bottom.
const BASE_TILES = {
  p1: [{ x: 2, y: 0 }, { x: 3, y: 0 }, { x: 2, y: 1 }, { x: 3, y: 1 }],
  p2: [{ x: 2, y: 12 }, { x: 3, y: 12 }, { x: 2, y: 13 }, { x: 3, y: 13 }],
};
const ZONES = {
  p1: { minY: 2, maxY: 5 },
  p2: { minY: 8, maxY: 11 },
};
const BASE_MAX_HP = 30;
const STARTING_ENERGY = 2;
const MAX_ENERGY = 10;
const UNITS_ON_BOARD = 6; // of the 10 drafted, 6 start deployed
const DRAFT_PICKS_PER_PLAYER = 10;

const THEMES = ['forest', 'lava', 'space', 'frost'];

function cardById(id) {
  return CARD_DEFS.find((c) => c.id === id);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// -------------------------------------------------------------------
// STATE CREATION
// -------------------------------------------------------------------

function createGameState(playerIds) {
  const theme = THEMES[Math.floor(Math.random() * THEMES.length)];
  const draftPool = buildDraftPool();
  const startingPlayer = playerIds[Math.floor(Math.random() * playerIds.length)];

  const state = {
    phase: 'draft', // draft -> setup -> battle -> gameover
    theme,
    boardCols: BOARD_COLS,
    boardRows: BOARD_ROWS,
    baseTiles: BASE_TILES,
    zones: ZONES,
    players: {},
    draft: {
      pool: draftPool,
      pickOrder: buildSnakeOrder(playerIds, DRAFT_PICKS_PER_PLAYER),
      pickIndex: 0,
    },
    setup: {
      submitted: {}, // playerId -> true once they've locked in placement
    },
    turn: {
      current: startingPlayer,
      startingPlayer,
      number: 1,
    },
    units: {}, // unitId -> unit
    nextUnitId: 1,
    bases: {
      p1: { hp: BASE_MAX_HP, maxHp: BASE_MAX_HP },
      p2: { hp: BASE_MAX_HP, maxHp: BASE_MAX_HP },
    },
    log: [],
    winner: null,
  };

  playerIds.forEach((pid) => {
    state.players[pid] = {
      id: pid,
      energy: STARTING_ENERGY,
      drafted: [], // card ids drafted
      reserves: [], // card ids not yet deployed
      lockedPlacements: null, // set during setup, revealed once both submit
    };
  });

  addLog(state, 'A new match begins! Draft your team.');
  return state;
}

function buildDraftPool() {
  // Two copies of the roster gives a big enough shared pool for a
  // snake draft where each player takes 10 cards.
  const doubled = CARD_DEFS.concat(CARD_DEFS).map((c) => c.id);
  return shuffle(doubled).map((cardId, i) => ({ pickId: 'pick' + i, cardId, taken: false }));
}

function buildSnakeOrder(playerIds, picksEach) {
  // Classic snake: 1,2,2,1,1,2,2,1,...
  const order = [];
  let forward = true;
  for (let round = 0; round < picksEach; round++) {
    const pair = forward ? playerIds.slice() : playerIds.slice().reverse();
    order.push(...pair);
    forward = !forward;
  }
  return order; // length = picksEach * playerIds.length
}

function addLog(state, message) {
  state.log.push({ t: Date.now(), message });
  if (state.log.length > 100) state.log.shift();
}

// -------------------------------------------------------------------
// DRAFT PHASE
// -------------------------------------------------------------------

function currentDrafter(state) {
  if (state.phase !== 'draft') return null;
  return state.draft.pickOrder[state.draft.pickIndex] || null;
}

function handleDraftPick(state, playerId, pickId) {
  if (state.phase !== 'draft') return { error: 'Draft is not active.' };
  if (currentDrafter(state) !== playerId) return { error: 'Not your pick.' };

  const entry = state.draft.pool.find((p) => p.pickId === pickId);
  if (!entry) return { error: 'Invalid card.' };
  if (entry.taken) return { error: 'That card is already taken.' };

  entry.taken = true;
  entry.takenBy = playerId;
  // NOTE: the pool contains two copies of every card, so a player can end up
  // with duplicate cardIds. We track each drafted card by its unique pickId
  // (called instanceId from here on) so setup/deploy never confuse two
  // copies of the same character with each other.
  state.players[playerId].drafted.push({ instanceId: entry.pickId, cardId: entry.cardId });
  addLog(state, `${playerId} drafted ${cardById(entry.cardId).name}.`);

  state.draft.pickIndex++;

  const allDone = state.draft.pickIndex >= state.draft.pickOrder.length;
  if (allDone) {
    state.phase = 'setup';
    Object.values(state.players).forEach((p) => {
      p.reserves = p.drafted.slice();
    });
    addLog(state, 'Draft complete! Place your units before the battle begins.');
  }
  return { ok: true };
}

// -------------------------------------------------------------------
// SETUP PHASE
// -------------------------------------------------------------------

function handleSetupSubmit(state, playerId, placements) {
  if (state.phase !== 'setup') return { error: 'Setup is not active.' };
  const player = state.players[playerId];
  if (!player) return { error: 'Unknown player.' };
  if (state.setup.submitted[playerId]) return { error: 'Already submitted.' };

  if (!Array.isArray(placements) || placements.length !== UNITS_ON_BOARD) {
    return { error: `You must place exactly ${UNITS_ON_BOARD} units.` };
  }

  const zone = ZONES[playerId];
  // Resolve cardId server-side from the player's own draft — never trust a
  // cardId the client sends, only the instanceId (which we control).
  const draftedById = new Map(player.drafted.map((c) => [c.instanceId, c.cardId]));
  const usedInstances = new Set();
  const usedTiles = new Set();
  const resolved = [];
  for (const pl of placements) {
    if (!draftedById.has(pl.instanceId)) return { error: 'Card not in your draft.' };
    if (usedInstances.has(pl.instanceId)) return { error: 'Duplicate card in placement.' };
    if (!Number.isInteger(pl.x) || !Number.isInteger(pl.y)) return { error: 'Invalid tile.' };
    if (pl.x < 0 || pl.x >= BOARD_COLS) return { error: 'Tile out of bounds.' };
    if (pl.y < zone.minY || pl.y > zone.maxY) return { error: 'Tile outside your zone.' };
    const key = pl.x + ',' + pl.y;
    if (usedTiles.has(key)) return { error: 'Two units on the same tile.' };
    usedInstances.add(pl.instanceId);
    usedTiles.add(key);
    resolved.push({ instanceId: pl.instanceId, cardId: draftedById.get(pl.instanceId), x: pl.x, y: pl.y });
  }

  player.lockedPlacements = resolved;
  state.setup.submitted[playerId] = true;
  addLog(state, `${playerId} has set up their team.`);

  const allSubmitted = Object.keys(state.players).every((pid) => state.setup.submitted[pid]);
  if (allSubmitted) revealAndStartBattle(state);

  return { ok: true };
}

function revealAndStartBattle(state) {
  Object.entries(state.players).forEach(([pid, player]) => {
    player.lockedPlacements.forEach((pl) => {
      spawnUnit(state, pid, pl.cardId, pl.x, pl.y, pl.instanceId);
      player.reserves = player.reserves.filter((c) => c.instanceId !== pl.instanceId);
    });
  });
  state.phase = 'battle';
  addLog(state, 'Both teams are revealed! The battle begins.');
  addLog(state, `${state.turn.current} moves first.`);
}

function spawnUnit(state, ownerId, cardId, x, y, instanceId) {
  const def = cardById(cardId);
  const unitId = 'u' + state.nextUnitId++;
  state.units[unitId] = {
    id: unitId,
    cardId,
    instanceId: instanceId || null,
    owner: ownerId,
    x, y,
    hp: def.hp,
    maxHp: def.hp,
    armor: 0,
    status: { poison: 0, poisonTurns: 0, slow: 0, slowTurns: 0, stunned: false, buffAtk: 0, buffTurns: 0 },
  };
  return state.units[unitId];
}

// -------------------------------------------------------------------
// BOARD HELPERS
// -------------------------------------------------------------------

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function isBaseTile(x, y) {
  return Object.values(BASE_TILES).some((tiles) => tiles.some((t) => t.x === x && t.y === y));
}

function baseTileOwner(x, y) {
  for (const [owner, tiles] of Object.entries(BASE_TILES)) {
    if (tiles.some((t) => t.x === x && t.y === y)) return owner;
  }
  return null;
}

function unitAt(state, x, y) {
  return Object.values(state.units).find((u) => u.x === x && u.y === y && u.hp > 0);
}

function reachableTiles(state, unit, range) {
  // 4-directional BFS, blocked by other units and base tiles.
  const start = { x: unit.x, y: unit.y };
  const visited = new Map([[start.x + ',' + start.y, 0]]);
  const queue = [start];
  const results = [];
  while (queue.length) {
    const cur = queue.shift();
    const dist = visited.get(cur.x + ',' + cur.y);
    if (dist >= range) continue;
    const neighbors = [
      { x: cur.x + 1, y: cur.y }, { x: cur.x - 1, y: cur.y },
      { x: cur.x, y: cur.y + 1 }, { x: cur.x, y: cur.y - 1 },
    ];
    for (const n of neighbors) {
      if (n.x < 0 || n.x >= BOARD_COLS || n.y < 0 || n.y >= BOARD_ROWS) continue;
      const key = n.x + ',' + n.y;
      if (visited.has(key)) continue;
      if (isBaseTile(n.x, n.y)) continue;
      if (unitAt(state, n.x, n.y)) continue;
      visited.set(key, dist + 1);
      queue.push(n);
      results.push({ x: n.x, y: n.y, dist: dist + 1 });
    }
  }
  return results;
}

function effectiveMoveRange(unit) {
  const def = cardById(unit.cardId);
  return Math.max(0, def.moveRange - (unit.status.slow || 0));
}

function effectiveAtkDmg(unit) {
  const def = cardById(unit.cardId);
  return def.atkDmg + (unit.status.buffAtk || 0);
}

// -------------------------------------------------------------------
// BATTLE ACTIONS
// -------------------------------------------------------------------

function otherPlayer(state, playerId) {
  return Object.keys(state.players).find((pid) => pid !== playerId);
}

function handleAction(state, playerId, action) {
  if (state.phase !== 'battle') return { error: 'Battle is not active.' };
  if (state.turn.current !== playerId) return { error: 'Not your turn.' };

  let result;
  switch (action.type) {
    case 'move': result = doMove(state, playerId, action); break;
    case 'melee': result = doAttack(state, playerId, action, 'melee'); break;
    case 'shoot': result = doAttack(state, playerId, action, 'shoot'); break;
    case 'special': result = doSpecial(state, playerId, action); break;
    case 'deploy': result = doDeploy(state, playerId, action); break;
    default: return { error: 'Unknown action.' };
  }
  if (result.error) return result;

  checkWinCondition(state);
  if (state.phase !== 'gameover') advanceTurn(state);
  return { ok: true };
}

function ownedActiveUnit(state, playerId, unitId) {
  const unit = state.units[unitId];
  if (!unit || unit.hp <= 0) return null;
  if (unit.owner !== playerId) return null;
  return unit;
}

function doMove(state, playerId, action) {
  const unit = ownedActiveUnit(state, playerId, action.unitId);
  if (!unit) return { error: 'Invalid unit.' };
  if (unit.status.stunned) return { error: 'This unit is stunned.' };
  const range = effectiveMoveRange(unit);
  const tiles = reachableTiles(state, unit, range);
  const dest = tiles.find((t) => t.x === action.x && t.y === action.y);
  if (!dest) return { error: 'Tile not reachable.' };
  unit.x = action.x;
  unit.y = action.y;
  addLog(state, `${cardById(unit.cardId).name} moves to (${action.x + 1}, ${action.y + 1}).`);
  return { ok: true };
}

function doAttack(state, playerId, action, mode) {
  const unit = ownedActiveUnit(state, playerId, action.unitId);
  if (!unit) return { error: 'Invalid unit.' };
  if (unit.status.stunned) return { error: 'This unit is stunned.' };
  const def = cardById(unit.cardId);
  if (mode === 'shoot' && def.atkRange <= 1) return { error: 'This unit cannot shoot at range.' };

  const dmg = effectiveAtkDmg(unit);

  if (action.targetBase) {
    const baseOwner = otherPlayer(state, playerId);
    const tiles = BASE_TILES[baseOwner];
    const inRangeTile = mode === 'melee'
      ? tiles.find((t) => manhattan(t, unit) === 1)
      : tiles.find((t) => { const d = manhattan(t, unit); return d >= 2 && d <= def.atkRange; });
    if (!inRangeTile) return { error: 'Base out of range.' };
    applyDamageToBase(state, baseOwner, dmg);
    addLog(state, `${def.name} strikes the enemy base for ${dmg}!`);
    return { ok: true };
  }

  const targetUnit = state.units[action.targetId];
  if (!targetUnit || targetUnit.hp <= 0) return { error: 'Invalid target.' };
  if (targetUnit.owner === playerId) return { error: 'Cannot attack your own unit.' };
  const dist = manhattan(unit, targetUnit);
  if (mode === 'melee') {
    if (dist !== 1) return { error: 'Melee requires an adjacent target.' };
  } else {
    if (dist < 2 || dist > def.atkRange) return { error: 'Target out of shooting range.' };
  }

  applyDamageToUnit(state, targetUnit, dmg);
  addLog(state, `${def.name} hits ${cardById(targetUnit.cardId).name} for ${dmg}.`);
  return { ok: true };
}

function doSpecial(state, playerId, action) {
  const unit = ownedActiveUnit(state, playerId, action.unitId);
  if (!unit) return { error: 'Invalid unit.' };
  if (unit.status.stunned) return { error: 'This unit is stunned.' };
  const def = cardById(unit.cardId);
  const special = def.special;
  const player = state.players[playerId];
  if (player.energy < special.energyCost) return { error: 'Not enough energy.' };

  let target = null;
  let targetBaseOwner = null;
  if (special.targetType === 'self') {
    target = unit;
  } else if (special.targetType === 'enemyBase') {
    targetBaseOwner = otherPlayer(state, playerId);
    const tile = BASE_TILES[targetBaseOwner].find((t) => manhattan(t, unit) <= special.range);
    if (!tile) return { error: 'Base out of range.' };
  } else {
    target = state.units[action.targetId];
    if (!target || target.hp <= 0) return { error: 'Invalid target.' };
    if (special.targetType === 'enemyUnit' && target.owner === playerId) return { error: 'Target must be an enemy.' };
    if (special.targetType === 'allyUnit' && target.owner !== playerId) return { error: 'Target must be an ally.' };
    if (manhattan(unit, target) > special.range) return { error: 'Target out of range.' };
  }

  player.energy -= special.energyCost;
  if (targetBaseOwner) {
    if (special.type === 'damage') applyDamageToBase(state, targetBaseOwner, special.amount);
  } else {
    applySpecialEffect(state, unit, target, special, playerId);
  }
  addLog(state, `${def.name} uses ${special.name}!`);
  return { ok: true };
}

function applySpecialEffect(state, caster, target, special, playerId) {
  switch (special.type) {
    case 'damage':
      applyDamageToUnit(state, target, special.amount);
      break;
    case 'heal':
      target.hp = Math.min(target.maxHp, target.hp + special.amount);
      break;
    case 'armor':
      target.armor += special.amount;
      break;
    case 'poison':
      target.status.poison = special.amount;
      target.status.poisonTurns = special.duration;
      break;
    case 'stun':
      target.status.stunned = true;
      break;
    case 'slow':
      target.status.slow = special.amount;
      target.status.slowTurns = special.duration;
      break;
    case 'buffAtk':
      target.status.buffAtk = special.amount;
      target.status.buffTurns = special.duration;
      break;
    case 'energySteal': {
      const foe = state.players[otherPlayer(state, playerId)];
      const stolen = Math.min(special.amount, foe.energy);
      foe.energy -= stolen;
      state.players[playerId].energy = Math.min(MAX_ENERGY, state.players[playerId].energy + stolen);
      break;
    }
    case 'destroyArmor':
      target.armor = 0;
      break;
    case 'duplicate': {
      const spot = findEmptyAdjacent(state, caster);
      if (spot) {
        const clone = spawnUnit(state, caster.owner, caster.cardId, spot.x, spot.y);
        clone.hp = Math.ceil(clone.maxHp / 2);
        clone.maxHp = clone.hp;
      }
      break;
    }
    default:
      break;
  }
}

function findEmptyAdjacent(state, unit) {
  const options = [
    { x: unit.x + 1, y: unit.y }, { x: unit.x - 1, y: unit.y },
    { x: unit.x, y: unit.y + 1 }, { x: unit.x, y: unit.y - 1 },
  ];
  return options.find((p) => p.x >= 0 && p.x < BOARD_COLS && p.y >= 0 && p.y < BOARD_ROWS
    && !isBaseTile(p.x, p.y) && !unitAt(state, p.x, p.y));
}

function doDeploy(state, playerId, action) {
  const player = state.players[playerId];
  const reserveEntry = player.reserves.find((c) => c.instanceId === action.instanceId);
  if (!reserveEntry) return { error: 'Card not in reserves.' };

  const activeCount = Object.values(state.units).filter((u) => u.owner === playerId && u.hp > 0).length;
  if (activeCount >= UNITS_ON_BOARD) return { error: 'Board is full; no fallen slot to fill.' };

  const zone = ZONES[playerId];
  if (action.x < 0 || action.x >= BOARD_COLS) return { error: 'Tile out of bounds.' };
  if (action.y < zone.minY || action.y > zone.maxY) return { error: 'Tile outside your zone.' };
  if (unitAt(state, action.x, action.y)) return { error: 'Tile occupied.' };

  player.reserves = player.reserves.filter((c) => c.instanceId !== action.instanceId);
  spawnUnit(state, playerId, reserveEntry.cardId, action.x, action.y, reserveEntry.instanceId);
  addLog(state, `${playerId} deploys ${cardById(reserveEntry.cardId).name}.`);
  return { ok: true };
}

function applyDamageToUnit(state, unit, amount) {
  let remaining = amount;
  if (unit.armor > 0) {
    const absorbed = Math.min(unit.armor, remaining);
    unit.armor -= absorbed;
    remaining -= absorbed;
  }
  unit.hp = Math.max(0, unit.hp - remaining);
}

function applyDamageToBase(state, ownerId, amount) {
  const base = state.bases[ownerId];
  base.hp = Math.max(0, base.hp - amount);
}

function advanceTurn(state) {
  const next = otherPlayer(state, state.turn.current);
  state.turn.current = next;
  state.turn.number++;

  // Passive upkeep for the player whose turn is starting.
  const player = state.players[next];
  player.energy = Math.min(MAX_ENERGY, player.energy + 1);

  Object.values(state.units).forEach((u) => {
    if (u.owner !== next || u.hp <= 0) return;
    if (u.status.poisonTurns > 0) {
      applyDamageToUnit(state, u, u.status.poison);
      u.status.poisonTurns--;
      if (u.status.poisonTurns === 0) u.status.poison = 0;
    }
    if (u.status.slowTurns > 0) {
      u.status.slowTurns--;
      if (u.status.slowTurns === 0) u.status.slow = 0;
    }
    if (u.status.buffTurns > 0) {
      u.status.buffTurns--;
      if (u.status.buffTurns === 0) u.status.buffAtk = 0;
    }
    if (u.status.stunned) {
      u.status.stunned = false; // stun lasts exactly one upcoming turn, then clears
    }
  });
}

function checkWinCondition(state) {
  for (const [owner, base] of Object.entries(state.bases)) {
    if (base.hp <= 0) {
      state.phase = 'gameover';
      state.winner = otherPlayer(state, owner);
      addLog(state, `${owner}'s base has fallen! ${state.winner} wins!`);
      return;
    }
  }
}

// -------------------------------------------------------------------
// SIMPLE AI (for single-player testing)
// -------------------------------------------------------------------

function aiDraftPick(state, aiId) {
  const available = state.draft.pool.filter((p) => !p.taken);
  if (!available.length) return null;
  const pick = available[Math.floor(Math.random() * available.length)];
  return pick.pickId;
}

function aiSetupPlacements(state, aiId) {
  const zone = ZONES[aiId];
  const player = state.players[aiId];
  const cards = shuffle(player.drafted).slice(0, UNITS_ON_BOARD);
  const usedTiles = new Set();
  const placements = [];
  for (const card of cards) {
    let x, y, key;
    let attempts = 0;
    do {
      x = Math.floor(Math.random() * BOARD_COLS);
      y = zone.minY + Math.floor(Math.random() * (zone.maxY - zone.minY + 1));
      key = x + ',' + y;
      attempts++;
    } while (usedTiles.has(key) && attempts < 50);
    usedTiles.add(key);
    placements.push({ instanceId: card.instanceId, cardId: card.cardId, x, y });
  }
  return placements;
}

function aiTakeTurn(state, aiId) {
  const myUnits = Object.values(state.units).filter((u) => u.owner === aiId && u.hp > 0 && !u.status.stunned);
  if (!myUnits.length) return null;

  const enemyId = otherPlayer(state, aiId);
  const enemyUnits = Object.values(state.units).filter((u) => u.owner === enemyId && u.hp > 0);

  const targetBaseTile = BASE_TILES[enemyId][0];

  for (const unit of myUnits) {
    const def = cardById(unit.cardId);
    // Priority 1: melee an adjacent enemy unit.
    const adjacentEnemy = enemyUnits.find((e) => manhattan(unit, e) === 1);
    if (adjacentEnemy) return { type: 'melee', unitId: unit.id, targetId: adjacentEnemy.id };

    // Priority 2: melee the enemy base if adjacent to it.
    if (BASE_TILES[enemyId].some((t) => manhattan(t, unit) === 1)) {
      return { type: 'melee', unitId: unit.id, targetBase: true };
    }

    // Priority 3: shoot an enemy unit in range.
    if (def.atkRange > 1) {
      const inRange = enemyUnits.find((e) => manhattan(unit, e) <= def.atkRange && manhattan(unit, e) >= 2);
      if (inRange) return { type: 'shoot', unitId: unit.id, targetId: inRange.id };

      // Priority 4: shoot the enemy base if in range.
      if (BASE_TILES[enemyId].some((t) => { const d = manhattan(t, unit); return d >= 2 && d <= def.atkRange; })) {
        return { type: 'shoot', unitId: unit.id, targetBase: true };
      }
    }

    // Otherwise move toward the enemy base.
    const range = effectiveMoveRange(unit);
    const tiles = reachableTiles(state, unit, range);
    if (tiles.length) {
      tiles.sort((a, b) => manhattan(a, targetBaseTile) - manhattan(b, targetBaseTile));
      const best = tiles[0];
      if (manhattan(best, targetBaseTile) < manhattan(unit, targetBaseTile)) {
        return { type: 'move', unitId: unit.id, x: best.x, y: best.y };
      }
    }
  }
  // No unit could act meaningfully; move the first unit randomly if possible.
  const unit = myUnits[0];
  const range = effectiveMoveRange(unit);
  const tiles = reachableTiles(state, unit, range);
  if (tiles.length) {
    const t = tiles[Math.floor(Math.random() * tiles.length)];
    return { type: 'move', unitId: unit.id, x: t.x, y: t.y };
  }
  return null;
}

// -------------------------------------------------------------------
// CLIENT-FACING SANITIZED VIEW
// -------------------------------------------------------------------

function getStateForPlayer(state, playerId) {
  const view = {
    phase: state.phase,
    theme: state.theme,
    boardCols: state.boardCols,
    boardRows: state.boardRows,
    baseTiles: state.baseTiles,
    zones: state.zones,
    bases: state.bases,
    turn: state.turn,
    log: state.log.slice(-40),
    winner: state.winner,
    you: playerId,
    opponent: otherPlayer(state, playerId),
  };

  if (state.phase === 'draft') {
    view.draft = {
      pool: state.draft.pool.map((p) => ({ pickId: p.pickId, cardId: p.taken ? null : p.cardId, taken: p.taken, takenBy: p.takenBy })),
      currentDrafter: currentDrafter(state),
      pickIndex: state.draft.pickIndex,
      totalPicks: state.draft.pickOrder.length,
    };
    view.yourDraft = state.players[playerId].drafted;
    view.opponentDraftCount = state.players[view.opponent] ? state.players[view.opponent].drafted.length : 0;
  }

  if (state.phase === 'setup') {
    view.yourDraft = state.players[playerId].drafted;
    view.submitted = state.setup.submitted;
  }

  if (state.phase === 'battle' || state.phase === 'gameover') {
    view.units = Object.values(state.units).filter((u) => u.hp > 0);
    view.energy = { [playerId]: state.players[playerId].energy, [view.opponent]: state.players[view.opponent] ? state.players[view.opponent].energy : 0 };
    view.yourReserves = state.players[playerId].reserves;
    view.opponentReserveCount = state.players[view.opponent] ? state.players[view.opponent].reserves.length : 0;
  }

  return view;
}

module.exports = {
  CARD_DEFS,
  BOARD_COLS,
  BOARD_ROWS,
  BASE_TILES,
  ZONES,
  UNITS_ON_BOARD,
  createGameState,
  handleDraftPick,
  handleSetupSubmit,
  handleAction,
  getStateForPlayer,
  reachableTiles,
  effectiveMoveRange,
  cardById,
  aiDraftPick,
  aiSetupPlacements,
  aiTakeTurn,
  currentDrafter,
};
