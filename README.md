# Frontline Draft

A browser-based, real-time multiplayer tactics card battler. Two players
snake-draft a 10-card roster, secretly deploy 6 of them onto an 8-row
battlefield in front of their base, then take turns moving, attacking, and
casting energy-fueled specials until one base falls.

The server is fully authoritative — the client only ever sends intents
("move this unit here", "attack that target"); every rule is enforced in
`server/gameLogic.js`, so players can't cheat by editing values locally.

## How a match works

1. **Draft** — a shared pool (36 cards, two copies of each of the 18
   starter characters) is revealed. Players alternate picks in snake order
   (P1, P2, P2, P1, P1, P2…) until each has drafted 10 cards.
2. **Setup** — each player privately places 6 of their 10 drafted cards
   onto their side of the grid (the other 4 sit in reserve). Once both
   players lock in, both boards are revealed simultaneously.
3. **Battle** — players alternate turns. On your turn you pick **one** of
   your units and do **one** thing: Move, Melee, Shoot (ranged units
   only), or use its Special (costs energy). If a unit falls, you may
   later spend your turn to Deploy a reserve into the empty slot instead.
   Energy regenerates by 1 each of your turns; basic actions are free,
   specials cost energy so they can't be spammed.
4. **Victory** — reduce the enemy base (30 HP, the round object on their
   edge of the board) to 0.

## Project structure

```
/client
  index.html   — screens: home, lobby, draft, setup, battle, game over
  style.css    — visual theme + 4 terrain palettes (forest/lava/space/frost)
  script.js    — renders server state, sends player intents over Socket.io
/server
  server.js    — Express + Socket.io wiring, room lifecycle, AI driver
  gameLogic.js — the entire authoritative rules engine
  roomManager.js — room codes, player sessions, reconnect tokens
  cardData.js  — the 18-card starter roster (see "Adding new cards" below)
test_engine.js — offline script that simulates a full match with no
                 browser/network needed, useful after any rule change
```

## 1. Install

You need [Node.js](https://nodejs.org) 18+ installed.

```bash
cd frontline-draft
npm install
```

## 2. Run the server

```bash
npm start
```

You'll see `Card battle server running on port 3000`. Open
`http://localhost:3000` in a browser to see the home screen.

Optional sanity check any time you change `gameLogic.js` — this runs a
full simulated match (draft → setup → battle → win) with no browser:

```bash
node test_engine.js
```

## 3. Test with two phones on the same Wi-Fi

1. Find your computer's local IP address:
   - Mac: `ipconfig getifaddr en0`
   - Windows: `ipconfig` (look for "IPv4 Address")
   - Linux: `hostname -I`
2. Start the server (`npm start`) — make sure your firewall allows
   incoming connections on port 3000.
3. On each phone's browser, go to `http://<your-computer-ip>:3000`
   (e.g. `http://192.168.1.42:3000`).
4. On phone A, tap **Create Room** and note the 5-character room code.
5. On phone B, tap **Join Room** and enter that code.
6. The draft begins automatically once both players are in.

You can also tap **Practice vs AI** to play solo against a simple
computer opponent — useful for testing the UI without a second device.

## 4. Deploy it online for free (Render or Railway)

Both platforms work the same way since this is a plain Node/Express app
with no database.

**Render:**
1. Push this project to a GitHub repo.
2. On [render.com](https://render.com), click **New → Web Service** and
   connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Render sets the `PORT` environment variable automatically —
   `server.js` already reads `process.env.PORT`, so no changes needed.
5. Once deployed, share the `https://your-app.onrender.com` URL — both
   phones can now play over the internet instead of shared Wi-Fi.

**Railway:**
1. Push to GitHub, then on [railway.app](https://railway.app) choose
   **New Project → Deploy from GitHub repo**.
2. Railway auto-detects Node and runs `npm install && npm start`.
3. Generate a public domain from the service's **Settings → Networking**
   tab and share that URL.

Note: free tiers on both platforms may "sleep" an inactive server, so the
first request after idling can take a few seconds to wake up.

## 5. Adding new cards

Everything about a card lives in one object in `server/cardData.js` (and
a matching display-only copy in `client/script.js`'s `CARD_DEFS`, plus
`SPECIAL_META` for targeting info — keeping these in sync is the only
manual step). To add a card:

1. Open `server/cardData.js` and copy an existing entry in `CARD_DEFS`.
2. Give it a unique `id`, `name`, `category`, `art` (emoji placeholder —
   swap for real artwork later), and combat stats (`hp`, `moveRange`,
   `atkRange`, `atkDmg`).
3. Fill in its `special` block:
   - `type` must be one of: `damage`, `heal`, `armor`, `poison`, `stun`,
     `slow`, `buffAtk`, `energySteal`, `destroyArmor`, `duplicate`.
   - `targetType` must be one of: `enemyUnit`, `allyUnit`, `enemyBase`,
     `self`.
   - Set `amount`, `duration` (for poison/slow/buffAtk), `range`, and
     `energyCost` to taste. No code changes are needed — `gameLogic.js`'s
     `applySpecialEffect` already knows how to resolve every effect type.
4. Mirror the same entry (name/art/hp/moveRange/atkRange/atkDmg/
   description/special.name/special.description/special.energyCost) into
   `CARD_DEFS` in `client/script.js` so it renders correctly, and add its
   `targetType`/`range` to `SPECIAL_META` in the same file.
5. Run `node test_engine.js` to confirm the draft pool and engine still
   work with the new roster.

The draft pool automatically includes every card in `CARD_DEFS` (doubled,
so duplicates can appear), so a new entry shows up in the very next match
with no other wiring required.

## Extra features included

- Reconnect support (room code + private token saved in `localStorage`;
  refreshing the page rejoins your in-progress game).
- Ready-free flow: draft/setup/battle all advance automatically once both
  players act — no separate "ready" button needed once a match starts,
  though the lobby screen shows connection status for both seats.
- Play Again button that starts a fresh draft in the same room.
- Random starting player each match.
- Simple AI opponent (Practice vs AI) that drafts, sets up, and fights
  using basic heuristics (attack what's adjacent/in range, otherwise
  advance toward your base).
- Animated hover/tap states, glowing turn/energy indicators, and four
  terrain-themed boards (forest / lava / space / frost) chosen randomly
  each match.

## Known simplifications (good next steps)

- Line-of-sight for ranged attacks isn't modeled — Shoot only checks
  distance, not whether another unit blocks the path.
- Sound effects and particle bursts are not included in this pass; the
  CSS has a damage-float animation hook (`spawnDamageFloats`) ready to be
  wired up to real audio/particles.
- The starter roster is 18 cards (with 2 copies each in the draft pool).
  Add more using the steps above to grow past the 40-card target.
