// Quick offline smoke test for gameLogic.js — simulates a full match
// (draft -> setup -> battle -> win) with no network/socket.io involved.
const gl = require('./server/gameLogic');

let state = gl.createGameState(['p1', 'p2']);
console.log('Phase after create:', state.phase, 'theme:', state.theme, 'first turn:', state.turn.current);

// --- DRAFT: alternate random legal picks until draft completes ---
let guard = 0;
while (state.phase === 'draft') {
  const drafter = gl.currentDrafter(state);
  const available = state.draft.pool.filter((p) => !p.taken);
  const pick = available[Math.floor(Math.random() * available.length)];
  const res = gl.handleDraftPick(state, drafter, pick.pickId);
  if (res.error) throw new Error('Draft error: ' + res.error);
  if (++guard > 500) throw new Error('Draft did not terminate');
}
console.log('Draft complete. p1 drafted', state.players.p1.drafted.length, 'p2 drafted', state.players.p2.drafted.length);
if (state.players.p1.drafted.length !== 10 || state.players.p2.drafted.length !== 10) throw new Error('Wrong draft counts');

// --- SETUP: place 6 random cards each inside own zone ---
function randomPlacements(pid) {
  const zone = gl.ZONES[pid];
  const cards = state.players[pid].drafted.slice(0, 6);
  const used = new Set();
  return cards.map((card) => {
    let x, y, key;
    do {
      x = Math.floor(Math.random() * gl.BOARD_COLS);
      y = zone.minY + Math.floor(Math.random() * (zone.maxY - zone.minY + 1));
      key = x + ',' + y;
    } while (used.has(key));
    used.add(key);
    return { instanceId: card.instanceId, cardId: card.cardId, x, y };
  });
}
let r1 = gl.handleSetupSubmit(state, 'p1', randomPlacements('p1'));
if (r1.error) throw new Error('Setup p1 error: ' + r1.error);
let r2 = gl.handleSetupSubmit(state, 'p2', randomPlacements('p2'));
if (r2.error) throw new Error('Setup p2 error: ' + r2.error);
console.log('Phase after setup:', state.phase, '| units on board:', Object.keys(state.units).length);
if (state.phase !== 'battle') throw new Error('Did not enter battle phase');
if (Object.keys(state.units).length !== 12) throw new Error('Expected 12 units on board');

// --- BATTLE: run a bounded number of turns using the same AI heuristic ---
guard = 0;
while (state.phase === 'battle' && guard < 2000) {
  const mover = state.turn.current;
  const action = gl.aiTakeTurn(state, mover);
  if (!action) {
    // No legal action found; force-pass to avoid an infinite loop in this test only.
    state.turn.current = mover === 'p1' ? 'p2' : 'p1';
  } else {
    const res = gl.handleAction(state, mover, action);
    if (res.error) throw new Error('Battle action error: ' + res.error + ' action=' + JSON.stringify(action));
  }
  guard++;
}
console.log('Battle loop ran', guard, 'actions. Phase:', state.phase, 'winner:', state.winner);
console.log('Final base HP -> p1:', state.bases.p1.hp, 'p2:', state.bases.p2.hp);

// --- sanity check the sanitized client view doesn't leak reserve card ids of the opponent ---
const viewP1 = gl.getStateForPlayer(state, 'p1');
if (viewP1.opponent !== 'p2') throw new Error('opponent field wrong');
if ('reserves' in viewP1) throw new Error('Leaked raw reserves key');
console.log('Sanitized view OK. yourReserves count:', viewP1.yourReserves ? viewP1.yourReserves.length : 'n/a');

console.log('\\nALL ENGINE SMOKE TESTS PASSED');
