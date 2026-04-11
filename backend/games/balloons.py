import json
import asyncio
import random
import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

GAME_DURATION  = 30
TICK_RATE      = 0.05    # 20fps
BOARD_W        = 390
BOARD_H        = 600
BALLOON_RADIUS = 28
MAX_BALLOONS   = 10
COUNTDOWN      = 3
FREEZE_DURATION = 5.0    # seconds frozen
BIRD_SPEED      = 3.5    # px per tick
BIRD_RADIUS     = 32
BIRD_MIN_INTERVAL = 10.0
BIRD_MAX_INTERVAL = 20.0

BALLOON_TYPES = {
    "gold":  {"color": "#f59e0b", "points":  2, "weight": 2},
    "white": {"color": "#f1f5f9", "points":  1, "weight": 5},
    "black": {"color": "#1e293b", "points": -2, "weight": 2},
}


def make_balloon(uid: int) -> dict:
    btype = random.choices(
        list(BALLOON_TYPES.keys()),
        weights=[BALLOON_TYPES[t]["weight"] for t in BALLOON_TYPES],
        k=1
    )[0]
    return {
        "id":     uid,
        "x":      random.randint(BALLOON_RADIUS + 10, BOARD_W - BALLOON_RADIUS - 10),
        "y":      BOARD_H + BALLOON_RADIUS,
        "type":   btype,
        "speed":  random.uniform(1.2, 2.8),
        "wobble": random.uniform(0.3, 1.0),
        "tick":   0,
    }


def make_bird(uid: int) -> dict:
    # Fly from left or right
    direction = random.choice(["left", "right"])
    y = random.randint(80, BOARD_H - 150)
    if direction == "right":
        return {"id": uid, "x": -BIRD_RADIUS, "y": y, "dir": 1}
    else:
        return {"id": uid, "x": BOARD_W + BIRD_RADIUS, "y": y, "dir": -1}


class BalloonGame:
    def __init__(self):
        self.connections: dict[str, WebSocket] = {}
        self.loop_task = None
        self._reset()

    def _reset(self):
        self.phase      = "lobby"
        self.balloons   = []
        self.scores:    dict[str, int] = {}
        self.time_left  = GAME_DURATION
        self.countdown  = None
        self.next_id    = 0
        self.pops       = []
        self.host:      str | None = None
        self.bird:      dict | None = None        # active bird
        self.frozen:    dict[str, float] = {}    # player -> unfreeze timestamp
        self.freeze_events: list = []             # [{target, until}] for frontend

    def _spawn_balloon(self) -> dict:
        b = make_balloon(self.next_id)
        self.next_id += 1
        return b

    def _spawn_bird(self) -> dict:
        b = make_bird(self.next_id)
        self.next_id += 1
        return b

    def tick(self):
        # Move balloons
        dead = []
        for b in self.balloons:
            b["tick"] += 1
            b["y"] -= b["speed"]
            b["x"] += b["wobble"] * (1 if (b["tick"] // 15) % 2 == 0 else -1)
            if b["y"] < -BALLOON_RADIUS * 2:
                dead.append(b["id"])
        self.balloons = [b for b in self.balloons if b["id"] not in dead]
        while len(self.balloons) < MAX_BALLOONS:
            self.balloons.append(self._spawn_balloon())

        # Move bird
        if self.bird:
            self.bird["x"] += BIRD_SPEED * self.bird["dir"]
            # Remove if off screen
            if self.bird["x"] < -BIRD_RADIUS * 2 or self.bird["x"] > BOARD_W + BIRD_RADIUS * 2:
                self.bird = None

    def pop(self, player: str, x: float, y: float) -> bool:
        # Check if frozen
        if player in self.frozen and time.time() < self.frozen[player]:
            return False

        # Check bird tap first
        if self.bird:
            dist = ((self.bird["x"] - x) ** 2 + (self.bird["y"] - y) ** 2) ** 0.5
            if dist <= BIRD_RADIUS * 1.5:
                # Freeze the OTHER player
                others = [p for p in self.connections if p != player]
                until = time.time() + FREEZE_DURATION
                for other in others:
                    self.frozen[other] = until
                    self.freeze_events.append({"target": other, "until": until, "by": player})
                self.bird = None
                return True

        # Check balloons
        for b in self.balloons:
            dist = ((b["x"] - x) ** 2 + (b["y"] - y) ** 2) ** 0.5
            if dist <= BALLOON_RADIUS * 1.5:
                pts = BALLOON_TYPES[b["type"]]["points"]
                self.scores[player] = self.scores.get(player, 0) + pts
                self.pops.append({
                    "id": b["id"], "player": player,
                    "type": b["type"], "points": pts,
                    "x": b["x"], "y": b["y"],
                })
                self.balloons = [bb for bb in self.balloons if bb["id"] != b["id"]]
                return True
        return False

    def state(self) -> dict:
        now = time.time()
        frozen_status = {p: max(0.0, round(until - now, 2)) for p, until in self.frozen.items() if until > now}
        s = {
            "phase":         self.phase,
            "balloons":      self.balloons,
            "scores":        self.scores,
            "time_left":     self.time_left,
            "countdown":     self.countdown,
            "pops":          self.pops,
            "players":       list(self.connections.keys()),
            "host":          self.host,
            "bird":          self.bird,
            "frozen":        frozen_status,          # {player: seconds_remaining}
            "freeze_events": self.freeze_events,
        }
        self.pops = []
        self.freeze_events = []
        return s

    def player_count(self) -> int:
        return len(self.connections)


game = BalloonGame()


async def broadcast(data: dict):
    dead = []
    msg = json.dumps(data)
    for player, ws in list(game.connections.items()):
        try:
            await ws.send_text(msg)
        except Exception:
            dead.append(player)
    for p in dead:
        game.connections.pop(p, None)


async def game_loop():
    # Countdown
    for n in range(COUNTDOWN, 0, -1):
        if game.player_count() < 2:
            game.phase = "lobby"
            await broadcast(game.state())
            return
        game.countdown = n
        await broadcast(game.state())
        await asyncio.sleep(1.0)

    game.countdown = 0
    await broadcast(game.state())
    await asyncio.sleep(0.3)

    # Start playing
    game.phase     = "playing"
    game.countdown = None
    game.time_left = GAME_DURATION
    while len(game.balloons) < MAX_BALLOONS:
        game.balloons.append(game._spawn_balloon())

    elapsed      = 0.0
    second_accum = 0.0
    next_bird_in = random.uniform(BIRD_MIN_INTERVAL, BIRD_MAX_INTERVAL)
    bird_accum   = 0.0

    while elapsed < GAME_DURATION:
        if game.player_count() < 2:
            break
        await asyncio.sleep(TICK_RATE)
        elapsed      += TICK_RATE
        second_accum += TICK_RATE
        bird_accum   += TICK_RATE
        game.tick()

        # Spawn bird
        if game.bird is None and bird_accum >= next_bird_in:
            game.bird    = game._spawn_bird()
            bird_accum   = 0.0
            next_bird_in = random.uniform(BIRD_MIN_INTERVAL, BIRD_MAX_INTERVAL)

        if second_accum >= 1.0:
            second_accum  -= 1.0
            game.time_left = max(0, GAME_DURATION - int(elapsed))

        await broadcast(game.state())

    game.phase     = "result"
    game.balloons  = []
    game.bird      = None
    game.time_left = 0
    await broadcast(game.state())


@router.websocket("/ws/{player}")
async def balloons_ws(websocket: WebSocket, player: str):
    await websocket.accept()
    game.connections[player] = websocket

    if player not in game.scores:
        game.scores[player] = 0

    if game.host is None or game.host not in game.connections:
        game.host = player

    if game.phase in ("result",):
        game._reset()
        game.connections[player] = websocket
        game.scores[player] = 0
        game.host = player

    await broadcast(game.state())

    try:
        while True:
            raw  = await websocket.receive_text()
            data = json.loads(raw)

            if data.get("type") == "start" and player == game.host:
                if game.player_count() >= 2 and game.phase == "lobby":
                    game.phase = "countdown"
                    for p in game.connections:
                        game.scores.setdefault(p, 0)
                    if game.loop_task is None or game.loop_task.done():
                        game.loop_task = asyncio.create_task(game_loop())
                    await broadcast(game.state())

            elif data.get("type") == "pop" and game.phase == "playing":
                x = float(data.get("x", 0))
                y = float(data.get("y", 0))
                if game.pop(player, x, y):
                    await broadcast(game.state())

            elif data.get("type") == "reset":
                if game.loop_task and not game.loop_task.done():
                    game.loop_task.cancel()
                    game.loop_task = None
                game._reset()
                game.connections[player] = websocket
                game.scores[player] = 0
                game.host = player
                for p in list(game.connections.keys()):
                    if p != player:
                        game.scores[p] = 0
                await broadcast(game.state())

    except WebSocketDisconnect:
        game.connections.pop(player, None)

        if game.host == player and game.connections:
            game.host = next(iter(game.connections))

        if game.player_count() < 2:
            if game.loop_task and not game.loop_task.done():
                game.loop_task.cancel()
                game.loop_task = None
            if game.phase in ("playing", "countdown"):
                game.phase    = "lobby"
                game.balloons = []
                game.bird     = None
                game.countdown = None
                for p in game.connections:
                    game.scores[p] = 0
            await broadcast({**game.state(), "disconnected": player})
        else:
            await broadcast({**game.state(), "disconnected": player})