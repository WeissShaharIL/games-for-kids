import json
import asyncio
import random
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import online as registry

router    = APIRouter()
GAME_NAME = "Tug of War 🪢"

GAME_DURATION = 30   # seconds
COUNTDOWN     = 3
# Rope position: 0.0 = full left, 1.0 = full right, 0.5 = center
WIN_THRESHOLD = 0.12  # how far from center triggers instant win
TAP_POWER     = 0.008 # how much each tap moves rope
DECAY_RATE    = 0.002 # rope drifts back toward center per tick (makes it feel alive)
TICK_RATE     = 0.05  # 20fps


class TugGame:
    def __init__(self):
        self.connections: dict[str, WebSocket] = {}
        self.loop_task  = None
        self._reset()

    def _reset(self):
        self.phase      = "lobby"
        self.countdown  = None
        self.sides      = {}        # player -> "left" | "right"
        self.rope_pos   = 0.5      # 0.0=left wins, 1.0=right wins
        self.taps       = {"left": 0, "right": 0}
        self.time_left  = GAME_DURATION
        self.winner     = None     # "left" | "right" | None
        self.join_msg   = None     # {player, ts} for join notification

    def get_side_players(self, side: str) -> list[str]:
        return [p for p, s in self.sides.items() if s == side]

    def state(self) -> dict:
        return {
            "type":      "state",
            "phase":     self.phase,
            "countdown": self.countdown,
            "sides":     self.sides,
            "rope_pos":  round(self.rope_pos, 4),
            "taps":      self.taps,
            "time_left": self.time_left,
            "winner":    self.winner,
            "connected": list(self.connections.keys()),
            "join_msg":  self.join_msg,
        }


game = TugGame()


async def broadcast(msg: dict):
    dead = []
    for p, ws in game.connections.items():
        try:
            await ws.send_text(json.dumps(msg))
        except Exception:
            dead.append(p)
    for p in dead:
        game.connections.pop(p, None)


async def game_loop():
    # Countdown
    for n in range(COUNTDOWN, 0, -1):
        if len(game.connections) < 2: return
        game.countdown = n
        await broadcast(game.state())
        await asyncio.sleep(1.0)

    game.countdown = 0
    await broadcast(game.state())
    await asyncio.sleep(0.3)
    game.countdown = None
    game.phase     = "playing"
    game.time_left = GAME_DURATION
    for p in game.connections:
        registry.clear_game(p)

    elapsed      = 0.0
    second_accum = 0.0

    while elapsed < GAME_DURATION:
        if len(game.connections) < 2:
            break
        await asyncio.sleep(TICK_RATE)
        elapsed      += TICK_RATE
        second_accum += TICK_RATE

        # Slight decay toward center to keep it tense
        if game.rope_pos > 0.5:
            game.rope_pos = max(0.5, game.rope_pos - DECAY_RATE * 0.3)
        elif game.rope_pos < 0.5:
            game.rope_pos = min(0.5, game.rope_pos + DECAY_RATE * 0.3)

        # Clamp
        game.rope_pos = max(0.0, min(1.0, game.rope_pos))

        if second_accum >= 1.0:
            second_accum  -= 1.0
            game.time_left = max(0, GAME_DURATION - int(elapsed))

        # Check instant win
        if game.rope_pos <= WIN_THRESHOLD:
            game.winner = "left"
            game.phase  = "result"
            await broadcast(game.state())
            return
        if game.rope_pos >= 1.0 - WIN_THRESHOLD:
            game.winner = "right"
            game.phase  = "result"
            await broadcast(game.state())
            return

        await broadcast(game.state())

    # Time's up — whoever has rope on their side wins
    game.phase     = "result"
    game.time_left = 0
    if game.rope_pos < 0.5:
        game.winner = "left"
    elif game.rope_pos > 0.5:
        game.winner = "right"
    else:
        game.winner = "draw"
    await broadcast(game.state())


@router.websocket("/ws/{player}")
async def tugofwar_ws(websocket: WebSocket, player: str):
    await websocket.accept()

    # Notify others of join
    game.join_msg = {"player": player}
    game.connections[player] = websocket
    registry.set_game(player, GAME_NAME)

    # Auto-assign side if not yet chosen
    if player not in game.sides:
        left_count  = len(game.get_side_players("left"))
        right_count = len(game.get_side_players("right"))
        game.sides[player] = "left" if left_count <= right_count else "right"

    await broadcast(game.state())

    # Clear join msg after 1 second
    async def clear_join():
        await asyncio.sleep(1.2)
        if game.join_msg and game.join_msg.get("player") == player:
            game.join_msg = None
            await broadcast(game.state())
    asyncio.create_task(clear_join())

    try:
        while True:
            raw  = await websocket.receive_text()
            data = json.loads(raw)

            if data.get("type") == "pick_side" and game.phase == "lobby":
                side = data.get("side")
                if side in ("left", "right"):
                    game.sides[player] = side
                    await broadcast(game.state())

            elif data.get("type") == "start" and game.phase == "lobby":
                left  = game.get_side_players("left")
                right = game.get_side_players("right")
                if left and right:  # need at least 1 on each side
                    game.phase = "countdown"
                    if game.loop_task is None or game.loop_task.done():
                        game.loop_task = asyncio.create_task(game_loop())
                    await broadcast(game.state())

            elif data.get("type") == "tap" and game.phase == "playing":
                side = game.sides.get(player)
                if side == "left":
                    game.rope_pos  = max(0.0, game.rope_pos - TAP_POWER)
                    game.taps["left"] += 1
                elif side == "right":
                    game.rope_pos  = min(1.0, game.rope_pos + TAP_POWER)
                    game.taps["right"] += 1
                await broadcast(game.state())

            elif data.get("type") == "reset":
                if game.loop_task and not game.loop_task.done():
                    game.loop_task.cancel()
                game._reset()
                await broadcast(game.state())

    except WebSocketDisconnect:
        game.connections.pop(player, None)
        game.sides.pop(player, None)
        registry.clear_game(player)
        if game.loop_task and not game.loop_task.done():
            game.loop_task.cancel()
            game.loop_task = None
        game._reset()
        await broadcast({**game.state(), "message": f"{player} left."})