// roomManager.js
// -----------------------------------------------------------------------
// Handles the lifecycle of rooms: creating them, joining them, tracking
// which socket belongs to which player, and reconnect tokens so a phone
// that loses signal can rejoin the same game.
// -----------------------------------------------------------------------

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion
const rooms = new Map(); // roomCode -> room object

function generateRoomCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 5; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  } while (rooms.has(code));
  return code;
}

function generateToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function createRoom(vsAI = false) {
  const roomCode = generateRoomCode();
  const room = {
    roomCode,
    vsAI,
    players: [], // { playerId, token, socketId, name, connected, ready }
    game: null, // set once gameLogic.createGameState() runs
    createdAt: Date.now(),
  };
  rooms.set(roomCode, room);
  return room;
}

function getRoom(roomCode) {
  return rooms.get((roomCode || '').toUpperCase());
}

function addPlayer(room, socketId) {
  const playerId = 'p' + (room.players.length + 1);
  const token = generateToken();
  const player = { playerId, token, socketId, connected: true, ready: false };
  room.players.push(player);
  return player;
}

function findPlayerByToken(room, token) {
  return room.players.find((p) => p.token === token);
}

function findPlayerBySocket(room, socketId) {
  return room.players.find((p) => p.socketId === socketId);
}

function findRoomBySocket(socketId) {
  for (const room of rooms.values()) {
    if (room.players.some((p) => p.socketId === socketId)) return room;
  }
  return null;
}

function removeEmptyRoom(room) {
  const allDisconnected = room.players.every((p) => !p.connected);
  if (allDisconnected) rooms.delete(room.roomCode);
}

module.exports = {
  createRoom,
  getRoom,
  addPlayer,
  findPlayerByToken,
  findPlayerBySocket,
  findRoomBySocket,
  removeEmptyRoom,
};
