import json
import asyncio
import random
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

GAME_DURATION  = 30
TICK_RATE      = 0.05    # 20fps
BOARD_W        = 390
BOARD_H        = 600
BALLOON_RADIUS = 28
MAX_BALLOONS   = 10
COUNTDOWN      = 3

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


class BalloonGame:
    def __init__(self):
        self.connections: dict[str, WebSocket] = {}
        self.loop_task = None
        self._reset()

    def _reset(self):
        self.phase     = "lobby"    # lobby | countdown | playing | result
        self.balloons  = []
        self.scores: dict[str, int] = {}
        self.time_left = GAME_DURATION
        self.countdown = None
        self.next_id   = 0
        self.pops      = []
        self.host: str | None = None  # first player to join

    def _spawn_balloon(self) -> dict:
        b = make_balloon(self.next_id)
        self.next_id += 1
        return b

    def tick(self):
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

    def pop(self, player: str, x: float, y: float):
        for b in self.balloons:
            dist = ((b["x"] - x) ** 2 + (b["y"] - y) ** 2) ** 0.5
            if dist <= BALLOON_RADIUS * 1.5:
                pts = BALLOON_TYPES[b["type"]]["points"]
                self.scores[player] = self.scores.get(player, 0) + pts
                self.pops.append({"id": b["id"], "player": player, "type": b["type"], "points": pts, "x": b["x"], "y": b["y"]})
                self.balloons = [bb for bb in self.balloons if bb["id"] != b["id"]]
                return True
        return False

    def state(self) -> dict:
        s = {
            "phase":    self.phase,
            "balloons": self.balloons,
            "scores":   self.scores,
            "time_left": self.time_left,
            "countdown": self.countdown,
            "pops":     self.pops,
            "players":  list(self.connections.keys()),
            "host":     self.host,
        }
        self.pops = []
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

    while elapsed < GAME_DURATION:
        # Continue as long as >=2 players remain
        if game.player_count() < 2:
            break
        await asyncio.sleep(TICK_RATE)
        elapsed      += TICK_RATE
        second_accum += TICK_RATE
        game.tick()

        if second_accum >= 1.0:
            second_accum  -= 1.0
            game.time_left = max(0, GAME_DURATION - int(elapsed))

        await broadcast(game.state())

    # Result
    game.phase     = "result"
    game.balloons  = []
    game.time_left = 0
    await broadcast(game.state())


@router.websocket("/ws/{player}")
async def balloons_ws(websocket: WebSocket, player: str):
    await websocket.accept()
    game.connections[player] = websocket

    # Initialize score for this player
    if player not in game.scores:
        game.scores[player] = 0

    # First player becomes host
    if game.host is None or game.host not in game.connections:
        game.host = player

    # Reset only if coming back to lobby
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
                    # Initialize scores for all connected players
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

        # If host left, assign new host
        if game.host == player and game.connections:
            game.host = next(iter(game.connections))

        # If game is running and <2 players remain, stop gracefully
        if game.player_count() < 2:
            if game.loop_task and not game.loop_task.done():
                game.loop_task.cancel()
                game.loop_task = None
            if game.phase in ("playing", "countdown"):
                game.phase = "lobby"
                game.balloons = []
                game.countdown = None
                # Reset scores for remaining players
                for p in game.connections:
                    game.scores[p] = 0
            await broadcast({**game.state(), "disconnected": player})
        else:
            # Game continues — just notify others
            await broadcast({**game.state(), "disconnected": player})