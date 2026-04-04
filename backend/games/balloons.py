import json
import asyncio
import random
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import online as registry

router = APIRouter()

GAME_NAME      = "Pop Balloons 🎈"
GAME_DURATION  = 30
TICK_RATE      = 0.05
BOARD_W        = 390
BOARD_H        = 600
BALLOON_RADIUS = 28
MAX_BALLOONS   = 18
COUNTDOWN      = 3

BALLOON_TYPES = {
    "gold":  {"color": "#f59e0b", "points":  2, "weight": 2},
    "white": {"color": "#f1f5f9", "points":  1, "weight": 5},
    "black": {"color": "#1e293b", "points": -2, "weight": 2},
}

def make_balloon(uid: int) -> dict:
    btype  = random.choices(list(BALLOON_TYPES.keys()), weights=[BALLOON_TYPES[t]["weight"] for t in BALLOON_TYPES], k=1)[0]
    return {
        "id": uid, "x": random.randint(BALLOON_RADIUS+10, BOARD_W-BALLOON_RADIUS-10),
        "y": BOARD_H + BALLOON_RADIUS, "type": btype,
        "speed": random.uniform(1.2, 2.8), "wobble": random.uniform(0.3, 1.0), "tick": 0,
    }


class BalloonGame:
    def __init__(self):
        self.connections: dict[str, WebSocket] = {}
        self.loop_task = None
        self._reset()

    def _reset(self):
        self.phase    = "waiting"
        self.balloons = []
        self.scores   = {"Ariel": 0, "Ella": 0}
        self.time_left = GAME_DURATION
        self.countdown = None
        self.next_id  = 0
        self.pops     = []

    def _spawn(self) -> dict:
        b = make_balloon(self.next_id); self.next_id += 1; return b

    def tick(self):
        new_balloons = []
        for b in self.balloons:
            b["tick"] += 1; b["y"] -= b["speed"]
            b["x"] += b["wobble"] * (1 if (b["tick"]//20)%2==0 else -1) * 0.5
            b["x"] = max(BALLOON_RADIUS+5, min(BOARD_W-BALLOON_RADIUS-5, b["x"]))
            if b["y"] > -BALLOON_RADIUS: new_balloons.append(b)
        self.balloons = new_balloons
        self.pops = []
        while len(self.balloons) < MAX_BALLOONS:
            self.balloons.append(self._spawn())

    def pop(self, player: str, x: float, y: float) -> dict | None:
        best = None; best_d = BALLOON_RADIUS * 1.5
        for b in self.balloons:
            d = ((b["x"]-x)**2 + (b["y"]-y)**2)**0.5
            if d < best_d: best_d = d; best = b
        if not best: return None
        self.balloons.remove(best)
        pts = BALLOON_TYPES[best["type"]]["points"]
        self.scores[player] = max(0, self.scores[player] + pts)
        pop_info = {"id": best["id"], "player": player, "type": best["type"], "points": pts, "x": best["x"], "y": best["y"]}
        self.pops.append(pop_info)
        return pop_info

    def state(self) -> dict:
        return {"type": "state", "phase": self.phase, "balloons": self.balloons, "scores": self.scores,
                "time_left": self.time_left, "countdown": self.countdown, "pops": self.pops,
                "connected": list(self.connections.keys()), "board_w": BOARD_W, "board_h": BOARD_H, "radius": BALLOON_RADIUS}


game = BalloonGame()


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
    game.countdown = None; game.phase = "playing"; game.time_left = GAME_DURATION
    while len(game.balloons) < MAX_BALLOONS: game.balloons.append(game._spawn())

    elapsed = 0.0; second_accum = 0.0
    while elapsed < GAME_DURATION:
        if len(game.connections) < 2: break
        await asyncio.sleep(TICK_RATE); elapsed += TICK_RATE; second_accum += TICK_RATE
        game.tick()
        if second_accum >= 1.0: second_accum -= 1.0; game.time_left = max(0, GAME_DURATION - int(elapsed))
        await broadcast(game.state())

    game.phase = "result"; game.balloons = []; game.time_left = 0
    await broadcast(game.state())


@router.websocket("/ws/{player}")
async def balloons_ws(websocket: WebSocket, player: str):
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
            if data.get("type") == "pop" and game.phase == "playing":
                result = game.pop(player, float(data.get("x",0)), float(data.get("y",0)))
                if result: await broadcast(game.state())
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