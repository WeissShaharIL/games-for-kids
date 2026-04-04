import json
import random
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

ROWS      = 20
COLS      = 20
TICK_RATE = 0.12

DIRS = {
    "UP":    (-1,  0),
    "DOWN":  ( 1,  0),
    "LEFT":  ( 0, -1),
    "RIGHT": ( 0,  1),
}

OPPOSITE = {"UP": "DOWN", "DOWN": "UP", "LEFT": "RIGHT", "RIGHT": "LEFT"}


class SnakeGame:
    def __init__(self):
        self.connections: dict[str, WebSocket] = {}
        self.scores      = {"Ariel": 0, "Ella": 0}
        self.loop_task   = None
        self._reset_board()

    def _reset_board(self):
        self.snakes = {
            "Ariel": {"body": [(10, 3),  (10, 2),  (10, 1)],  "dir": "RIGHT", "alive": True},
            "Ella":  {"body": [(10, 16), (10, 17), (10, 18)], "dir": "LEFT",  "alive": True},
        }
        self.apple  = self._spawn_apple()
        self.winner = None

    def _all_occupied(self):
        occupied = set()
        for s in self.snakes.values():
            occupied.update(map(tuple, s["body"]))
        return occupied

    def _spawn_apple(self):
        occupied = self._all_occupied()
        while True:
            pos = (random.randint(0, ROWS - 1), random.randint(0, COLS - 1))
            if pos not in occupied:
                return pos

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

        ate_apple = False

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

            if tuple(new_head) == tuple(self.apple):
                ate_apple = True
                self.scores[player] += 1
            else:
                snake["body"].pop()

        # Collision detection
        all_bodies = {p: set(map(tuple, s["body"])) for p, s in self.snakes.items() if s["alive"]}

        for player, snake in self.snakes.items():
            if not snake["alive"]:
                continue
            head  = tuple(snake["body"][0])
            other = "Ella" if player == "Ariel" else "Ariel"

            if head in set(map(tuple, snake["body"][1:])):
                snake["alive"] = False
                continue
            if other in all_bodies and head in all_bodies[other]:
                snake["alive"] = False

        # Head-on collision
        heads = {p: tuple(s["body"][0]) for p, s in self.snakes.items() if s["alive"]}
        if len(heads) == 2 and list(heads.values())[0] == list(heads.values())[1]:
            for s in self.snakes.values():
                s["alive"] = False

        if ate_apple:
            self.apple = self._spawn_apple()

        alive = [p for p, s in self.snakes.items() if s["alive"]]
        if len(alive) == 0:
            self.winner = "draw"
            return False
        elif len(alive) == 1:
            self.winner = alive[0]
            self.scores[alive[0]] += 1
            return False

        return True

    def state(self) -> dict:
        return {
            "type":      "state",
            "snakes":    {p: {"body": s["body"], "dir": s["dir"], "alive": s["alive"]} for p, s in self.snakes.items()},
            "apple":     self.apple,
            "winner":    self.winner,
            "scores":    self.scores,
            "connected": list(self.connections.keys()),
            "rows":      ROWS,
            "cols":      COLS,
        }

    def new_round(self):
        self._reset_board()


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
    while True:
        await asyncio.sleep(TICK_RATE)

        if len(game.connections) < 2:
            game._reset_board()
            await broadcast(game.state())
            break

        running = game.tick()
        await broadcast(game.state())

        if not running:
            await asyncio.sleep(2.5)
            if len(game.connections) == 2:
                game.new_round()
                await broadcast(game.state())
            else:
                break


@router.websocket("/ws/{player}")
async def snake_ws(websocket: WebSocket, player: str):
    if player not in ("Ariel", "Ella"):
        await websocket.close(code=4001)
        return

    await websocket.accept()
    game.connections[player] = websocket
    game._reset_board()

    await broadcast(game.state())

    if len(game.connections) == 2:
        if game.loop_task is None or game.loop_task.done():
            game.loop_task = asyncio.create_task(game_loop())

    try:
        while True:
            raw  = await websocket.receive_text()
            data = json.loads(raw)
            if data.get("type") == "dir":
                game.set_dir(player, data.get("dir", ""))

    except WebSocketDisconnect:
        game.connections.pop(player, None)
        if game.loop_task and not game.loop_task.done():
            game.loop_task.cancel()
            game.loop_task = None
        game._reset_board()
        await broadcast({**game.state(), "message": f"{player} disconnected."})