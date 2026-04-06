import json
import random
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import online as registry

router = APIRouter()

GAME_NAME = "Snake Race 🐍"
ROWS      = 20
COLS      = 20
TICK_RATE = 0.16  # slower than before (was 0.12)
MAX_APPLES = 2    # always 2 apples on screen

DIRS = {
    "UP":    (-1,  0),
    "DOWN":  ( 1,  0),
    "LEFT":  ( 0, -1),
    "RIGHT": ( 0,  1),
}
OPPOSITE = {"UP": "DOWN", "DOWN": "UP", "LEFT": "RIGHT", "RIGHT": "LEFT"}

STARTS = [
    {"body": [(10, 3),  (10, 2),  (10, 1)],  "dir": "RIGHT"},
    {"body": [(10, 16), (10, 17), (10, 18)], "dir": "LEFT"},
    {"body": [(3,  10), (2,  10), (1,  10)],  "dir": "DOWN"},
    {"body": [(16, 10), (17, 10), (18, 10)], "dir": "UP"},
]

class SnakeGame:
    def __init__(self):
        self.connections: dict[str, WebSocket] = {}
        self.scores:      dict[str, int] = {}
        self.loop_task   = None
        self.snakes      = {}
        self.apples      = []   # list of (row, col)
        self.winner      = None
        self.countdown   = None

    def _reset_board(self):
        players = list(self.connections.keys())
        self.snakes = {}
        for i, name in enumerate(players):
            s = STARTS[i % len(STARTS)]
            self.snakes[name] = {
                "body":  [tuple(p) for p in s["body"]],
                "dir":   s["dir"],
                "alive": True,
            }
        self.apples  = []
        self._fill_apples()
        self.winner  = None
        self.countdown = None

    def _all_occupied(self):
        occupied = set()
        for s in self.snakes.values():
            occupied.update(map(tuple, s["body"]))
        occupied.update(self.apples)
        return occupied

    def _spawn_apple(self):
        occupied = self._all_occupied()
        for _ in range(1000):
            pos = (random.randint(0, ROWS - 1), random.randint(0, COLS - 1))
            if pos not in occupied:
                return pos
        return None

    def _fill_apples(self):
        while len(self.apples) < MAX_APPLES:
            a = self._spawn_apple()
            if a:
                self.apples.append(a)

    def set_dir(self, player: str, direction: str):
        if direction not in DIRS:
            return
        snake = self.snakes.get(player)
        if not snake or not snake["alive"]:
            return
        if direction == OPPOSITE.get(snake["dir"]):
            return
        snake["dir"] = direction

    def tick(self) -> bool:
        if self.winner:
            return False

        for player, snake in self.snakes.items():
            if not snake["alive"]:
                continue
            dr, dc   = DIRS[snake["dir"]]
            head     = snake["body"][0]
            new_head = (head[0] + dr, head[1] + dc)

            if not (0 <= new_head[0] < ROWS and 0 <= new_head[1] < COLS):
                snake["alive"] = False
                continue

            snake["body"].insert(0, new_head)

            if new_head in self.apples:
                self.apples.remove(new_head)
                self.scores[player] = self.scores.get(player, 0) + 1
                self._fill_apples()
            else:
                snake["body"].pop()

        # Collision detection
        all_bodies = {p: set(map(tuple, s["body"])) for p, s in self.snakes.items() if s["alive"]}
        for player, snake in self.snakes.items():
            if not snake["alive"]:
                continue
            head = tuple(snake["body"][0])
            if head in set(map(tuple, snake["body"][1:])):
                snake["alive"] = False
                continue
            for other, bodies in all_bodies.items():
                if other != player and head in bodies:
                    snake["alive"] = False
                    break

        # Head-on collision
        heads = {p: tuple(s["body"][0]) for p, s in self.snakes.items() if s["alive"]}
        head_list = list(heads.values())
        for p, h in heads.items():
            if head_list.count(h) > 1:
                self.snakes[p]["alive"] = False

        alive = [p for p, s in self.snakes.items() if s["alive"]]
        if len(alive) == 0:
            self.winner = "draw"
            return False
        elif len(alive) == 1:
            self.winner = alive[0]
            self.scores[alive[0]] = self.scores.get(alive[0], 0) + 1
            return False
        return True

    def state(self) -> dict:
        return {
            "type":      "state",
            "snakes":    {p: {"body": s["body"], "dir": s["dir"], "alive": s["alive"]} for p, s in self.snakes.items()},
            "apples":    self.apples,
            "winner":    self.winner,
            "scores":    self.scores,
            "connected": list(self.connections.keys()),
            "countdown": self.countdown,
            "rows":      ROWS,
            "cols":      COLS,
        }

    def stop_loop(self):
        if self.loop_task and not self.loop_task.done():
            self.loop_task.cancel()
            self.loop_task = None


game = SnakeGame()


async def broadcast(message: dict):
    dead = []
    for player, ws in game.connections.items():
        try:
            await ws.send_text(json.dumps(message))
        except Exception:
            dead.append(player)
    for p in dead:
        game.connections.pop(p, None)


async def game_loop():
    for n in [3, 2, 1]:
        if len(game.connections) < 2:
            game.countdown = None
            return
        game.countdown = n
        await broadcast(game.state())
        await asyncio.sleep(1.0)

    game.countdown = 0
    await broadcast(game.state())
    await asyncio.sleep(0.1)
    game.countdown = None

    while True:
        await asyncio.sleep(TICK_RATE)
        if len(game.connections) < 2:
            game._reset_board()
            await broadcast(game.state())
            return
        running = game.tick()
        await broadcast(game.state())
        if not running:
            await asyncio.sleep(2.0)
            if len(game.connections) == 2:
                game._reset_board()
                await broadcast(game.state())
                game.loop_task = asyncio.create_task(game_loop())
            return


@router.websocket("/ws/{player}")
async def snake_ws(websocket: WebSocket, player: str):
    await websocket.accept()
    game.stop_loop()
    game.connections[player] = websocket
    game.scores.setdefault(player, 0)
    registry.set_game(player, GAME_NAME)
    game._reset_board()
    await broadcast(game.state())

    if len(game.connections) == 2:
        for p in game.connections:
            registry.clear_game(p)
        game.loop_task = asyncio.create_task(game_loop())

    try:
        while True:
            raw  = await websocket.receive_text()
            data = json.loads(raw)
            if data.get("type") == "dir":
                game.set_dir(player, data.get("dir", "").upper())
            elif data.get("type") == "reset":
                game.stop_loop()
                game._reset_board()
                if len(game.connections) == 2:
                    game.loop_task = asyncio.create_task(game_loop())
                await broadcast(game.state())
    except WebSocketDisconnect:
        game.connections.pop(player, None)
        registry.clear_game(player)
        game.stop_loop()
        if len(game.connections) == 0:
            game.scores = {}
        game._reset_board()
        await broadcast({**game.state(), "message": f"{player} disconnected."})