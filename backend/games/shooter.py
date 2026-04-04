import json
import asyncio
import random
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import online as registry

router = APIRouter()

GAME_NAME      = "Quick Shot 🔫"
TOTAL_FIGURES  = 20
BULLETS        = 8
FIGURE_TIME    = 2.0
BETWEEN_TIME   = 1.2
COUNTDOWN      = 3

FIGURES = [
    {"type": "villain", "emoji": "🦹", "shoot": True,  "points":  1},
    {"type": "villain", "emoji": "🧟", "shoot": True,  "points":  1},
    {"type": "villain", "emoji": "👺", "shoot": True,  "points":  1},
    {"type": "dog",     "emoji": "🐶", "shoot": False, "points": -1},
    {"type": "cat",     "emoji": "🐱", "shoot": False, "points": -1},
]

def random_figure(idx: int) -> dict:
    f = random.choice(FIGURES)
    return {"idx": idx, "type": f["type"], "emoji": f["emoji"], "shoot": f["shoot"], "points": f["points"]}


class ShooterGame:
    def __init__(self):
        self.connections: dict[str, WebSocket] = {}
        self.loop_task = None
        self._reset()

    def _reset(self):
        self.phase        = "waiting"
        self.countdown    = None
        self.figure       = None
        self.figure_idx   = 0
        self.bullets      = {"Ariel": BULLETS, "Ella": BULLETS}
        self.scores       = {"Ariel": 0, "Ella": 0}
        self.hits         = {"Ariel": 0, "Ella": 0}
        self.wastes       = {"Ariel": 0, "Ella": 0}
        self.last_shot    = None
        self.figures_done = 0

    def shoot(self, player: str) -> dict | None:
        if self.phase != "playing": return None
        if self.bullets[player] <= 0: return None
        self.bullets[player] -= 1
        self.last_shot = None
        if self.figure is None:
            result = {"player": player, "result": "miss", "points": 0, "emoji": "💨"}
        elif self.figure["shoot"]:
            pts = self.figure["points"]; self.scores[player] += pts; self.hits[player] += 1
            result = {"player": player, "result": "hit", "points": pts, "emoji": self.figure["emoji"]}
            self.figure = None
        else:
            pts = self.figure["points"]; self.scores[player] = max(0, self.scores[player] + pts); self.wastes[player] += 1
            result = {"player": player, "result": "wrong", "points": pts, "emoji": self.figure["emoji"]}
            self.figure = None
        self.last_shot = result
        return result

    def state(self) -> dict:
        return {"type": "state", "phase": self.phase, "countdown": self.countdown, "figure": self.figure,
                "figure_idx": self.figure_idx, "figures_done": self.figures_done, "total": TOTAL_FIGURES,
                "bullets": self.bullets, "max_bullets": BULLETS, "scores": self.scores,
                "hits": self.hits, "wastes": self.wastes, "last_shot": self.last_shot,
                "connected": list(self.connections.keys())}


game = ShooterGame()


async def broadcast(msg: dict):
    dead = []
    for player, ws in game.connections.items():
        try:
            await ws.send_text(json.dumps(msg))
        except Exception:
            dead.append(player)
    for p in dead:
        game.connections.pop(p, None)


async def game_loop():
    for n in range(COUNTDOWN, 0, -1):
        if len(game.connections) < 2: return
        game.countdown = n; await broadcast(game.state()); await asyncio.sleep(1.0)
    game.countdown = 0; await broadcast(game.state()); await asyncio.sleep(0.3)
    game.countdown = None; game.phase = "playing"

    for i in range(TOTAL_FIGURES):
        if len(game.connections) < 2: break
        await asyncio.sleep(BETWEEN_TIME)
        if len(game.connections) < 2: break
        game.figure = random_figure(i); game.figure_idx = i; game.last_shot = None
        await broadcast(game.state())
        elapsed = 0.0
        while elapsed < FIGURE_TIME:
            await asyncio.sleep(0.1); elapsed += 0.1
            if game.figure is None: break
        if game.figure is not None:
            game.figure = None; await broadcast(game.state())
        game.figures_done = i + 1

    game.phase = "result"; game.figure = None
    await broadcast(game.state())


@router.websocket("/ws/{player}")
async def shooter_ws(websocket: WebSocket, player: str):
    if player not in ("Ariel", "Ella"):
        await websocket.close(code=4001)
        return

    await websocket.accept()
    game.connections[player] = websocket
    game._reset()
    registry.set_game(player, GAME_NAME)
    await broadcast(game.state())

    if len(game.connections) == 2 and game.phase == "waiting":
        for p in game.connections:
            registry.clear_game(p)
        game.phase = "countdown"
        if game.loop_task is None or game.loop_task.done():
            game.loop_task = asyncio.create_task(game_loop())

    try:
        while True:
            raw  = await websocket.receive_text()
            data = json.loads(raw)
            if data.get("type") == "shoot" and game.phase == "playing":
                result = game.shoot(player)
                if result is not None: await broadcast(game.state())
            elif data.get("type") == "reset":
                game._reset()
                if len(game.connections) == 2:
                    game.phase = "countdown"
                    game.loop_task = asyncio.create_task(game_loop())
                await broadcast(game.state())
    except WebSocketDisconnect:
        game.connections.pop(player, None)
        registry.clear_game(player)
        if game.loop_task and not game.loop_task.done():
            game.loop_task.cancel(); game.loop_task = None
        game._reset()
        await broadcast({**game.state(), "message": f"{player} disconnected."})