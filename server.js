// server.js
// -----------------------------------------------------------------------
// Entry point. Serves the client and wires Socket.io events to
// roomManager.js (who's in which room) and gameLogic.js (the rules).
// -----------------------------------------------------------------------

const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const roomManager = require('./roomManager');
const gameLogic = require('./gameLogic');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const AI_ID = 'p2'; // when playing vs AI, the AI always takes the second slot

app.use(express.static(path.join(__dirname, '..', 'client')));

// ---- broadcasting helpers -------------------------------------------------

function broadcastState(room) {
  if (!room.game) return;
  room.players.forEach((p) => {
    if (!p.connected || p.isAI) return;
    io.to(p.socketId).emit('state', gameLogic.getStateForPlayer(room.game, p.playerId));
  });
}

function broadcastRoomInfo(room) {
  room.players.forEach((p) => {
    if (!p.connected || p.isAI) return;
    io.to(p.socketId).emit('roomInfo', {
      roomCode: room.roomCode,
      you: p.playerId,
      players: room.players.map((pl) => ({ playerId: pl.playerId, connected: pl.connected, ready: pl.ready, isAI: !!pl.isAI })),
    });
  });
}

// ---- AI driver --------------------------------------------------------
// After every state-changing event, if it's the AI's "turn" in whatever
// phase we're in, let it act immediately (with a small delay so it feels
// natural rather than instantaneous).

function maybeRunAI(room) {
  if (!room.vsAI || !room.game) return;
  const game = room.game;

  if (game.phase === 'draft' && gameLogic.currentDrafter(game) === AI_ID) {
    setTimeout(() => {
      if (!room.game || room.game.phase !== 'draft') return;
      const pickId = gameLogic.aiDraftPick(room.game, AI_ID);
      if (pickId) gameLogic.handleDraftPick(room.game, AI_ID, pickId);
      broadcastState(room);
      maybeRunAI(room);
    }, 400);
    return;
  }

  if (game.phase === 'setup' && !game.setup.submitted[AI_ID]) {
    setTimeout(() => {
      if (!room.game || room.game.phase !== 'setup') return;
      const placements = gameLogic.aiSetupPlacements(room.game, AI_ID);
      gameLogic.handleSetupSubmit(room.game, AI_ID, placements);
      broadcastState(room);
      maybeRunAI(room);
    }, 600);
    return;
  }

  if (game.phase === 'battle' && game.turn.current === AI_ID) {
    setTimeout(() => {
      if (!room.game || room.game.phase !== 'battle') return;
      const action = gameLogic.aiTakeTurn(room.game, AI_ID);
      if (action) {
        gameLogic.handleAction(room.game, AI_ID, action);
      } else {
        // AI genuinely has nothing to do; pass by ending turn manually.
        room.game.turn.current = room.game.turn.current === 'p1' ? 'p2' : 'p1';
      }
      broadcastState(room);
      maybeRunAI(room);
    }, 700);
  }
}

// ---- socket handlers ----------------------------------------------------

io.on('connection', (socket) => {
  socket.on('createRoom', ({ vsAI }, ack) => {
    const room = roomManager.createRoom(!!vsAI);
    const player = roomManager.addPlayer(room, socket.id);
    socket.join(room.roomCode);

    if (vsAI) {
      room.players.push({ playerId: AI_ID, token: null, socketId: null, connected: true, ready: true, isAI: true });
      room.game = gameLogic.createGameState([player.playerId, AI_ID]);
    }

    ack({ ok: true, roomCode: room.roomCode, playerId: player.playerId, token: player.token });
    broadcastRoomInfo(room);
    if (room.game) {
      broadcastState(room);
      maybeRunAI(room);
    }
  });

  socket.on('joinRoom', ({ roomCode }, ack) => {
    const room = roomManager.getRoom(roomCode);
    if (!room) return ack({ ok: false, error: 'Room not found.' });
    if (room.players.filter((p) => !p.isAI).length >= 2) return ack({ ok: false, error: 'Room is full.' });
    if (room.game) return ack({ ok: false, error: 'Game already in progress.' });

    const player = roomManager.addPlayer(room, socket.id);
    socket.join(room.roomCode);
    ack({ ok: true, roomCode: room.roomCode, playerId: player.playerId, token: player.token });
    broadcastRoomInfo(room);

    const humanCount = room.players.filter((p) => !p.isAI).length;
    if (humanCount === 2) {
      room.game = gameLogic.createGameState(room.players.map((p) => p.playerId));
      broadcastState(room);
    }
  });

  socket.on('reconnect_to_room', ({ roomCode, token }, ack) => {
    const room = roomManager.getRoom(roomCode);
    if (!room) return ack({ ok: false, error: 'Room no longer exists.' });
    const player = roomManager.findPlayerByToken(room, token);
    if (!player) return ack({ ok: false, error: 'Session not found.' });

    player.socketId = socket.id;
    player.connected = true;
    socket.join(room.roomCode);
    ack({ ok: true, roomCode: room.roomCode, playerId: player.playerId });
    broadcastRoomInfo(room);
    if (room.game) broadcastState(room);
  });

  socket.on('draftPick', ({ roomCode, pickId }, ack) => {
    const room = roomManager.getRoom(roomCode);
    const player = room && roomManager.findPlayerBySocket(room, socket.id);
    if (!room || !room.game || !player) return ack && ack({ ok: false, error: 'Not in a game.' });

    const result = gameLogic.handleDraftPick(room.game, player.playerId, pickId);
    ack && ack(result);
    if (result.ok) {
      broadcastState(room);
      maybeRunAI(room);
    }
  });

  socket.on('setupSubmit', ({ roomCode, placements }, ack) => {
    const room = roomManager.getRoom(roomCode);
    const player = room && roomManager.findPlayerBySocket(room, socket.id);
    if (!room || !room.game || !player) return ack && ack({ ok: false, error: 'Not in a game.' });

    const result = gameLogic.handleSetupSubmit(room.game, player.playerId, placements);
    ack && ack(result);
    if (result.ok) {
      broadcastState(room);
      maybeRunAI(room);
    }
  });

  socket.on('action', ({ roomCode, action }, ack) => {
    const room = roomManager.getRoom(roomCode);
    const player = room && roomManager.findPlayerBySocket(room, socket.id);
    if (!room || !room.game || !player) return ack && ack({ ok: false, error: 'Not in a game.' });

    const result = gameLogic.handleAction(room.game, player.playerId, action);
    ack && ack(result);
    if (result.ok) {
      broadcastState(room);
      maybeRunAI(room);
    }
  });

  socket.on('playAgain', ({ roomCode }, ack) => {
    const room = roomManager.getRoom(roomCode);
    if (!room) return ack && ack({ ok: false, error: 'Room not found.' });
    room.game = gameLogic.createGameState(room.players.map((p) => p.playerId));
    ack && ack({ ok: true });
    broadcastState(room);
    maybeRunAI(room);
  });

  socket.on('disconnect', () => {
    const room = roomManager.findRoomBySocket(socket.id);
    if (!room) return;
    const player = roomManager.findPlayerBySocket(room, socket.id);
    if (player) player.connected = false;
    broadcastRoomInfo(room);
    roomManager.removeEmptyRoom(room);
  });
});

server.listen(PORT, () => {
  console.log(`Card battle server running on port ${PORT}`);
});
