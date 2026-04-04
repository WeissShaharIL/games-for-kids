import json
import asyncio
import math
import random
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

# Board dimensions (logical units)
W = 400
H = 700
GOAL_W    = 120   # goal opening width
GOAL_Y    = 20    # how deep the goal is
MALLET_R  = 28
PUCK_R    = 18
MAX_SPEED = 14
WIN_SCORE = 5
TICK_RATE = 1 / 60

COUNTDOWN = 3


def clamp(val, lo, hi):
    return max(lo, min(hi, val))


class Vec:
    def __init__(self, x=0.0, y=0.0):
        self.x = float(x)
        self.y = float(y)

    def dist(self, other):
        return math.hypot(self.x - other.x, self.y - other.y)

    def serialize(self):
        return {"x": round(self.x, 2), "y": round(self.y, 2)}


class AirHockeyGame:
    def __init__(self):
        self.connections: dict[str, WebSocket] = {}
        self.loop_task  = None
        self._reset()

    def _reset(self):
        self.phase      = "waiting"
        self.countdown  = None
        self.scores     = {"Ariel": 0, "Ella": 0}
        self.last_goal  = None   # "Ariel" | "Ella" | None
        self._reset_round()

    def _reset_round(self):
        self.puck     = Vec(W / 2, H / 2)
        # Random starting direction, mostly vertical
        angle = random.uniform(-0.4, 0.4)
        speed = 6.0
        self.puck_vel = Vec(math.sin(angle) * speed, math.cos(angle) * speed * random.choice([1, -1]))
        self.mallets  = {
            "Ariel": Vec(W / 2, H - 80),   # bottom half
            "Ella":  Vec(W / 2, 80),        # top half
        }
        self.last_goal = None

    def move_mallet(self, player: str, x: float, y: float):
        if self.phase != "playing":
            return
        m = self.mallets.get(player)
        if not m:
            return
        # Constrain to own half + mallet radius
        if player == "Ariel":
            y = clamp(y, H / 2 + MALLET_R, H - MALLET_R)
        else:
            y = clamp(y, MALLET_R, H / 2 - MALLET_R)
        x = clamp(x, MALLET_R, W - MALLET_R)
        m.x = x
        m.y = y

    def tick(self):
        """Advance physics one frame. Returns goal scorer or None."""
        p  = self.puck
        pv = self.puck_vel

        # Move puck
        p.x += pv.x
        p.y += pv.y

        # Wall bounce (left/right)
        if p.x - PUCK_R < 0:
            p.x = PUCK_R
            pv.x = abs(pv.x)
        if p.x + PUCK_R > W:
            p.x = W - PUCK_R
            pv.x = -abs(pv.x)

        # Top wall / Ella's goal area
        if p.y - PUCK_R < GOAL_Y:
            goal_left  = W / 2 - GOAL_W / 2
            goal_right = W / 2 + GOAL_W / 2
            if goal_left < p.x < goal_right:
                # GOAL for Ariel
                self.scores["Ariel"] += 1
                self.last_goal = "Ariel"
                return "Ariel"
            else:
                p.y = PUCK_R + GOAL_Y
                pv.y = abs(pv.y)

        # Bottom wall / Ariel's goal area
        if p.y + PUCK_R > H - GOAL_Y:
            goal_left  = W / 2 - GOAL_W / 2
            goal_right = W / 2 + GOAL_W / 2
            if goal_left < p.x < goal_right:
                # GOAL for Ella
                self.scores["Ella"] += 1
                self.last_goal = "Ella"
                return "Ella"
            else:
                p.y = H - PUCK_R - GOAL_Y
                pv.y = -abs(pv.y)

        # Mallet collision
        for player, m in self.mallets.items():
            dist = p.dist(m)
            min_dist = PUCK_R + MALLET_R
            if dist < min_dist and dist > 0.1:
                # Normal vector from mallet to puck
                nx = (p.x - m.x) / dist
                ny = (p.y - m.y) / dist
                # Push puck out
                overlap = min_dist - dist
                p.x += nx * overlap
                p.y += ny * overlap
                # Reflect velocity
                dot = pv.x * nx + pv.y * ny
                pv.x -= 2 * dot * nx
                pv.y -= 2 * dot * ny
                # Speed boost from mallet hit
                speed = math.hypot(pv.x, pv.y)
                boost = min(speed + 2.0, MAX_SPEED)
                if speed > 0:
                    pv.x = pv.x / speed * boost
                    pv.y = pv.y / speed * boost

        return None

    def state(self) -> dict:
        return {
            "type":      "state",
            "phase":     self.phase,
            "countdown": self.countdown,
            "scores":    self.scores,
            "puck":      self.puck.serialize(),
            "mallets":   {p: m.serialize() for p, m in self.mallets.items()},
            "last_goal": self.last_goal,
            "connected": list(self.connections.keys()),
            "board":     {"w": W, "h": H, "goal_w": GOAL_W, "goal_y": GOAL_Y,
                          "mallet_r": MALLET_R, "puck_r": PUCK_R},
            "win_score": WIN_SCORE,
        }


game = AirHockeyGame()


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
    # Countdown
    for n in range(COUNTDOWN, 0, -1):
        if len(game.connections) < 2:
            return
        game.countdown = n
        await broadcast(game.state())
        await asyncio.sleep(1.0)

    game.countdown = 0
    await broadcast(game.state())
    await asyncio.sleep(0.3)
    game.countdown = None
    game.phase     = "playing"
    game._reset_round()

    # Physics loop
    while True:
        await asyncio.sleep(TICK_RATE)

        if len(game.connections) < 2:
            game.phase = "waiting"
            game._reset_round()
            await broadcast(game.state())
            return

        scorer = game.tick()
        if scorer:
            await broadcast(game.state())
            # Check win
            if game.scores[scorer] >= WIN_SCORE:
                game.phase = "result"
                await broadcast(game.state())
                return
            # Pause then reset round
            await asyncio.sleep(1.5)
            game._reset_round()
            game.phase = "countdown"
            await broadcast(game.state())
            # Mini countdown before resuming
            for n in range(2, 0, -1):
                await asyncio.sleep(1.0)
                game.countdown = n
                await broadcast(game.state())
            game.countdown = None
            game.phase     = "playing"
            await broadcast(game.state())
        else:
            await broadcast(game.state())


@router.websocket("/ws/{player}")
async def airhockey_ws(websocket: WebSocket, player: str):
    if player not in ("Ariel", "Ella"):
        await websocket.close(code=4001)
        return

    await websocket.accept()
    game.connections[player] = websocket
    game._reset()
    await broadcast(game.state())

    if len(game.connections) == 2 and game.phase == "waiting":
        game.phase = "countdown"
        if game.loop_task is None or game.loop_task.done():
            game.loop_task = asyncio.create_task(game_loop())

    try:
        while True:
            raw  = await websocket.receive_text()
            data = json.loads(raw)

            if data.get("type") == "mallet" and game.phase == "playing":
                game.move_mallet(player, float(data["x"]), float(data["y"]))

            elif data.get("type") == "reset":
                game._reset()
                if len(game.connections) == 2:
                    game.phase = "countdown"
                    game.loop_task = asyncio.create_task(game_loop())
                await broadcast(game.state())

    except WebSocketDisconnect:
        game.connections.pop(player, None)
        if game.loop_task and not game.loop_task.done():
            game.loop_task.cancel()
            game.loop_task = None
        game._reset()
        await broadcast({**game.state(), "message": f"{player} disconnected."})