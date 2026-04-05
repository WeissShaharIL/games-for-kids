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
BETWEEN_TIME   = 1.0
COUNTDOWN      = 3

FIGURES = [
    {"type": "villain", "emoji": "🦹", "points":  1},
    {"type": "villain", "emoji": "🧟", "points":  1},
    {"type": "villain", "emoji": "👺", "points":  1},
    {"type": "villain", "emoji": "👻", "points":  1},
    {"type": "villain", "emoji": "💀", "points":  1},
    {"type": "pet",     "emoji": "🐶", "points": -1},
    {"type": "pet",     "emoji": "🐱", "points": -1},
    {"type": "pet",     "emoji": "🐰", "points": -1},
    {"type": "pet",     "emoji": "🐹", "points": -1},
]

def random_figure(idx):
    f = random.choice(FIGURES)
    return {"id": idx, "type": f["type"], "emoji": f["emoji"], "points": f["points"]}


class ShooterGame:
    def __init__(self):
        self.connections: dict[str, WebSocket] = {}
        self.loop_task = None
        self.host = None
        self._reset()

    def _reset(self):
        self.phase        = "lobby"
        self.countdown    = None
        self.figure       = None
        self.figure_idx   = 0
        self.figures_done = 0
        self.bullets:     dict[str, int] = {}
        self.scores:      dict[str, int] = {}
        self.last_shot    = None

    def _init_player(self, player):
        self.bullets.setdefault(player, BULLETS)
        self.scores.setdefault(player, 0)

    def shoot(self, player):
        if self.phase != "playing": return False
        if self.bullets.get(player, 0) <= 0: return False
        self.bullets[player] -= 1
        if self.figure is None:
            self.last_shot = {"player": player, "result": "miss", "points": 0}
        elif self.figure["type"] == "villain":
            pts = self.figure["points"]
            self.scores[player] = self.scores.get(player, 0) + pts
            self.last_shot = {"player": player, "result": "hit", "points": pts}
            self.figure = None
        else:
            pts = self.figure["points"]
            self.scores[player] = max(0, self.scores.get(player, 0) + pts)
            self.last_shot = {"player": player, "result": "wrong", "points": pts}
            self.figure = None
        return True

    def state(self):
        return {
            "type": "state", "phase": self.phase, "countdown": self.countdown,
            "figure": self.figure, "figure_idx": self.figure_idx,
            "figures_done": self.figures_done, "total": TOTAL_FIGURES,
            "bullets": self.bullets, "max_bullets": BULLETS,
            "scores": self.scores, "last_shot": self.last_shot,
            "connected": list(self.connections.keys()), "host": self.host,
        }


game = ShooterGame()


async def broadcast(msg):
    dead = []
    for player, ws in game.connections.items():
        try: await ws.send_text(json.dumps(msg))
        except: dead.append(player)
    for p in dead: game.connections.pop(p, None)


async def game_loop():
    for n in range(COUNTDOWN, 0, -1):
        if len(game.connections) < 2: return
        game.countdown = n
        await broadcast(game.state())
        await asyncio.sleep(1.0)
    game.countdown = 0
    await broadcast(game.state())
    await asyncio.sleep(0.3)
    game.countdown = None
    game.phase = "playing"
    await broadcast(game.state())

    for i in range(TOTAL_FIGURES):
        if len(game.connections) < 1: break
        await asyncio.sleep(BETWEEN_TIME)
        if len(game.connections) < 1: break
        game.figure = random_figure(i)
        game.figure_idx = i
        game.last_shot = None
        await broadcast(game.state())
        elapsed = 0.0
        while elapsed < FIGURE_TIME:
            await asyncio.sleep(0.05)
            elapsed += 0.05
            if game.figure is None: break
        if game.figure is not None:
            game.figure = None
            await broadcast(game.state())
        game.figures_done = i + 1

    game.phase = "result"
    game.figure = None
    await broadcast(game.state())


@router.websocket("/ws/{player}")
async def shooter_ws(websocket: WebSocket, player: str):
    await websocket.accept()
    game.connections[player] = websocket
    game._init_player(player)
    if game.host is None or game.host not in game.connections:
        game.host = player
    if game.phase == "result":
        game._reset()
        game.connections[player] = websocket
        game._init_player(player)
        game.host = player
    registry.set_game(player, GAME_NAME)
    await broadcast(game.state())

    try:
        while True:
            raw  = await websocket.receive_text()
            data = json.loads(raw)
            if data.get("type") == "start" and player == game.host:
                if game.phase == "lobby" and len(game.connections) >= 2:
                    for p in game.connections:
                        registry.clear_game(p)
                        game._init_player(p)
                    game.phase = "countdown"
                    if game.loop_task is None or game.loop_task.done():
                        game.loop_task = asyncio.create_task(game_loop())
                    await broadcast(game.state())
            elif data.get("type") == "shoot":
                if game.shoot(player):
                    await broadcast(game.state())
            elif data.get("type") == "reset":
                if game.loop_task and not game.loop_task.done():
                    game.loop_task.cancel()
                    game.loop_task = None
                game._reset()
                game.host = player
                for p in game.connections:
                    game._init_player(p)
                await broadcast(game.state())
    except WebSocketDisconnect:
        game.connections.pop(player, None)
        registry.clear_game(player)
        if game.host == player and game.connections:
            game.host = next(iter(game.connections))
        if game.loop_task and not game.loop_task.done():
            if len(game.connections) < 1:
                game.loop_task.cancel()
                game.loop_task = None
        await broadcast({**game.state(), "disconnected": player})