# 🎮 Games for Kids

A real-time multiplayer game hub built for kids, running on any device via browser. Players log in with a PIN, pick a game, and play together in real time — no accounts, no downloads.

---

## 🚀 Quick Start

```bash
# Clone the repo
git clone https://github.com/WeissShaharIL/games-for-kids.git
cd games-for-kids
git checkout dev

# Copy and edit your player config
cp .env.example .env

# Build and run
.\build.ps1 -Down -Build
```

Open `http://localhost:3002` in your browser.

---

## 📁 Project Structure

```
games-for-kids/
├── backend/
│   ├── main.py              # FastAPI app, auth, player config, routing
│   ├── online.py            # Shared player registry (online/game status)
│   └── games/
│       ├── tictactoe.py
│       ├── connect4.py
│       ├── snake.py
│       ├── spinner.py
│       ├── balloons.py
│       ├── shooter.py
│       ├── airhockey.py
│       ├── lego.py
│       ├── mountain.py
│       ├── wordquiz.py
│       └── tugofwar.py
├── frontend/
│   └── src/
│       ├── App.jsx           # Main app, PIN screen, game hub
│       ├── main.jsx          # Entry point, music init
│       ├── sounds.js         # Synthesized sound effects (Web Audio API)
│       ├── music.js          # Ambient background music
│       ├── MuteButton.jsx    # Floating mute button
│       ├── vibrate.js        # Haptic feedback patterns
│       ├── playerUtils.js    # Player lookup helpers
│       └── games/
│           ├── TicTacToe.jsx
│           ├── Connect4.jsx
│           ├── Snake.jsx
│           ├── Spinner.jsx
│           ├── Balloons.jsx
│           ├── Shooter.jsx
│           ├── AirHockey.jsx
│           ├── Lego.jsx
│           ├── Mountain.jsx
│           ├── WordQuiz.jsx
│           └── TugOfWar.jsx
├── docker-compose.yml
├── build.ps1
└── .env
```

---

## ⚙️ Configuration

All player configuration lives in `.env`. No code changes needed to add or modify players.

```env
# Players — format: Name:PIN:color:light:bg:emoji
PLAYER_1=Ariel:1111:#16a34a:#dcfce7:#f0fdf4:🦁
PLAYER_2=Ella:2222:#db2777:#fce7f3:#fdf2f8:🦋
PLAYER_3=Lavi:3333:#2563eb:#dbeafe:#eff6ff:🦊
PLAYER_4=Aria:4444:#d97706:#fef3c7:#fffbeb:🌸
PLAYER_5=Aba:5555:#7c3aed:#ede9fe:#faf5ff:🧔
PLAYER_6=Ima:6666:#0891b2:#cffafe:#ecfeff:👩

BACKEND_PORT=8001
FRONTEND_PORT=3002
```

**Rules:**
- Each player **must have a unique name** — name is the identity key throughout the system
- `color` = primary color, `light` = light background tint, `bg` = page background
- Up to 6 players supported (add `PLAYER_7`, `PLAYER_8`, etc. for more)
- Duplicate login is rejected with a 409 error

---

## 🛠️ Build & Run

```powershell
# Full rebuild
.\build.ps1 -Down -Build

# Full rebuild ignoring Docker cache
.\build.ps1 -Down -Build -NoCache

# Just restart services (no rebuild)
.\build.ps1

# Tail logs
.\build.ps1 -Logs

# Stop everything
.\build.ps1 -Down
```

After building, the app is available at:
- **Frontend:** http://localhost:3002
- **Backend API:** http://localhost:8001
- **Health check:** http://localhost:8001/health

---

## 🎮 Games

| Game | Emoji | Players | Description |
|------|-------|---------|-------------|
| Tic Tac Toe | ⭕ | 2 | Classic 3×3 board game |
| 4 in a Row | 🔴 | 2 | Drop discs, connect four |
| Snake Race | 🐍 | 2 | Two snakes, one apple — direction arrow shows for 2s after GO |
| Pop Balloons | 🎈 | 2–6 | Pop balloons as fast as you can — gold +2, white +1, black -2 |
| Quick Shot | 🔫 | 2 | Shoot villains, spare the pets — 8 bullets, 20 figures |
| Spinner | 🎡 | 2 | Tap battle to win first pick, then claim slices on a weighted wheel |
| Air Hockey | 🏒 | 2 | Drag your mallet — perspective flips so you're always at the bottom |
| LEGO Builder | 🧱 | 2–6 | Collaborative isometric 3D brick builder |
| Mountain Quiz | 🏔️ | 2–4 | Math questions — correct = opponents slide down, wrong = you slide. Pass once per question. Host starts the game |
| Word Quiz | 🔤 | 2–6 | Hear a word, tap the matching emoji. Easy / Medium / Hard difficulty |
| Tug of War | 💪 | 2–6 | Pick a side, tap fast to pull the rope to your side |
| Memory | 🃏 | — | Coming soon |

---

## 🏗️ Architecture

### Backend (FastAPI + WebSockets)
- Each game runs as a singleton `class GameState` with a shared global instance
- Players connect via WebSocket at `/api/{game}/ws/{player}`
- `online.py` tracks who is online and what game they're in, used by the lobby to show "X is waiting in Y"
- Auth endpoint (`POST /auth`) validates PIN → returns player name, rejects duplicate logins with 409
- Players loaded from `PLAYER_N` env vars at startup

### Frontend (React + Vite)
- `App.jsx` fetches `/api/players` on load → builds a `players` map `{name: {color, light, bg, emoji, bgImage}}`
- The `players` map is passed as a prop to every game component
- `GameHub` polls `/api/online` every 3 seconds → shows who's online and who's waiting in which game
- Session is stored in `sessionStorage` — refreshing the page keeps you logged in, closing the tab logs you out
- Background music starts on first user interaction (browser autoplay policy), mute button is always visible in bottom-right corner

### WebSocket message patterns
Every game follows the same patterns:

**Frontend → Backend:**
```json
{ "type": "move" | "answer" | "tap" | "start" | "reset" | "pass", ...payload }
```

**Backend → Frontend (broadcast):**
```json
{ "type": "state", "phase": "lobby|countdown|playing|result", "connected": [...], ...gameState }
```

---

## 🎵 Sound & Music

Sound effects are synthesized in real time using the **Web Audio API** — no audio files required.

| Sound | When |
|-------|------|
| `place` | Placing a piece / tapping |
| `win` | You win |
| `lose` | You lose |
| `draw` | Draw |
| `rematch` | Game starting / countdown |
| `error` | Wrong answer / wrong tap |
| `shoot` | Shooting in Quick Shot |

Background music is generative ambient music — pentatonic chimes, soft pad chords, and bell accents that cycle through chord progressions so it never sounds repetitive.

The **🎵 mute button** (bottom-right corner) persists across all screens and saves preference to `localStorage`.

---

## 🔧 Development Tips

### Adding a new game

1. Create `backend/games/mygame.py` with a FastAPI `APIRouter` and WebSocket handler
2. Add the router to `backend/main.py`
3. Create `frontend/src/games/MyGame.jsx`
4. Add an entry to the `GAMES` array in `frontend/src/App.jsx`
5. Rebuild

### Game backend template
```python
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import online as registry

router    = APIRouter()
GAME_NAME = "My Game 🎯"

class MyGame:
    def __init__(self):
        self.connections: dict[str, WebSocket] = {}
        self._reset()

    def _reset(self):
        self.phase = "waiting"

    def state(self) -> dict:
        return {"type": "state", "phase": self.phase, "connected": list(self.connections.keys())}

game = MyGame()

async def broadcast(msg: dict):
    dead = []
    for p, ws in game.connections.items():
        try: await ws.send_text(json.dumps(msg))
        except: dead.append(p)
    for p in dead: game.connections.pop(p, None)

@router.websocket("/ws/{player}")
async def my_game_ws(websocket: WebSocket, player: str):
    await websocket.accept()
    game.connections[player] = websocket
    registry.set_game(player, GAME_NAME)
    await broadcast(game.state())
    try:
        while True:
            raw  = await websocket.receive_text()
            data = json.loads(raw)
            # handle messages...
            await broadcast(game.state())
    except WebSocketDisconnect:
        game.connections.pop(player, None)
        registry.clear_game(player)
        await broadcast({**game.state(), "message": f"{player} disconnected."})
```

### Game frontend template
```jsx
import { useState, useEffect, useRef } from 'react'

const WS_PROTOCOL = location.protocol === 'https:' ? 'wss' : 'ws'
const WS_URL      = `${WS_PROTOCOL}://${location.host}/api/mygame/ws`

// Always use inline safe() — importing playerUtils causes Windows encoding issues
function safe(players, name, idx = 0) {
  const FALLBACKS = [
    { color: '#16a34a', light: '#dcfce7', bg: '#f0fdf4', emoji: '🦁' },
    { color: '#db2777', light: '#fce7f3', bg: '#fdf2f8', emoji: '🦋' },
  ]
  if (players?.[name]) return players[name]
  return FALLBACKS[idx % FALLBACKS.length]
}

export default function MyGame({ player, players, onBack }) {
  const [state, setState] = useState(null)
  const wsRef             = useRef(null)
  const mountedRef        = useRef(true)   // always use mountedRef to guard setState after unmount

  useEffect(() => {
    mountedRef.current = true
    const ws = new WebSocket(`${WS_URL}/${player}`)
    wsRef.current = ws
    ws.onmessage = (e) => {
      if (!mountedRef.current) return   // guard!
      setState(JSON.parse(e.data))
    }
    ws.onclose = () => {}
    ws.onerror = () => ws.close()
    return () => { mountedRef.current = false; ws.close() }
  }, [player])

  const p = safe(players, player, 0)
  return <div style={{ background: p.bg }}>/* game UI */</div>
}
```

### Common pitfalls
- **Windows encoding** — emoji in `.jsx` files get corrupted on Windows. Use inline `safe()` instead of importing from `playerUtils.js`, and avoid emoji in template literals where possible
- **Double tap on mobile** — use `onPointerDown` only, not `onClick` + `onTouchStart`
- **mountedRef** — always check `if (!mountedRef.current) return` before any `setState` or sound call inside async callbacks
- **Refs inside components** — hooks like `useRef` must be inside the component function, never at module level
- **File corruption** — if a file acts strange, check for `}import` at line boundaries (two files merged by Windows)

---

## 🌐 Exposing via ngrok

```bash
ngrok http 3002
```

Share the ngrok URL with players on the same network or remotely. The WebSocket connections automatically use `wss://` when the page is served over HTTPS.

---

## 📦 Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Python 3.11, FastAPI, WebSockets, uvicorn |
| Frontend | React 18, Vite, Web Audio API, Canvas API |
| Infrastructure | Docker, Docker Compose, nginx |
| Audio | Web Audio API (no files — fully synthesized) |
| State | WebSockets (no Redux, no external state lib) |
