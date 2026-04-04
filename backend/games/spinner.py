import json
import asyncio
import random
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import online as registry

router = APIRouter()

GAME_NAME    = "Spinner 🎡"
TAP_DURATION = 10
TOTAL_PIECES = 8

def generate_weights() -> list[float]:
    raw   = [random.uniform(0.5, 3.0) for _ in range(TOTAL_PIECES)]
    total = sum(raw)
    return [round(v / total, 4) for v in raw]

class SpinnerGame:
    def __init__(self):
        self.connections: dict[str, WebSocket] = {}
        self.timer_task = None
        self._reset()

    def _reset(self):
        self.phase        = "waiting"
        self.taps         = {"Ariel": 0, "Ella": 0}
        self.tap_winner   = None
        self.pick_order   = []
        self.pieces       = [None] * TOTAL_PIECES
        self.weights      = generate_weights()
        self.current_pick = 0
        self.spin_result  = None
        self.spin_angle   = None

    def _alternate_order(self, first: str) -> list:
        second = "Ella" if first == "Ariel" else "Ariel"
        return [first if i % 2 == 0 else second for i in range(TOTAL_PIECES)]

    def whose_turn(self) -> str | None:
        if not self.pick_order or self.current_pick >= TOTAL_PIECES:
            return None
        return self.pick_order[self.current_pick]

    def claim(self, player: str, index: int) -> bool:
        if self.phase != "picking": return False
        if self.whose_turn() != player: return False
        if not (0 <= index < TOTAL_PIECES): return False
        if self.pieces[index] is not None: return False
        self.pieces[index] = player
        self.current_pick += 1
        if self.current_pick >= TOTAL_PIECES:
            self.phase = "spinning"
        return True

    def spin(self) -> dict:
        if self.phase != "spinning": return {}
        winner_idx     = random.choices(range(TOTAL_PIECES), weights=self.weights, k=1)[0]
        cumulative     = sum(self.weights[:winner_idx])
        center_fraction = cumulative + self.weights[winner_idx] / 2.0
        full_spins     = random.randint(5, 8) * 360
        final_angle    = full_spins - (center_fraction * 360)
        self.spin_angle  = final_angle
        self.spin_result = winner_idx
        self.phase       = "result"
        return {"spin_angle": final_angle, "spin_result": winner_idx}

    def state(self) -> dict:
        return {
            "type":         "state",
            "phase":        self.phase,
            "taps":         self.taps,
            "tap_winner":   self.tap_winner,
            "pieces":       self.pieces,
            "weights":      self.weights,
            "pick_order":   self.pick_order,
            "current_pick": self.current_pick,
            "whose_turn":   self.whose_turn(),
            "spin_result":  self.spin_result,
            "spin_angle":   self.spin_angle,
            "connected":    list(self.connections.keys()),
            "total_pieces": TOTAL_PIECES,
        }


game = SpinnerGame()


async def broadcast(message: dict):
    dead = []
    for player, ws in game.connections.items():
        try:
            await ws.send_text(json.dumps(message))
        except Exception:
            dead.append(player)
    for p in dead:
        game.connections.pop(p, None)


async def run_tap_timer():
    for remaining in range(TAP_DURATION, 0, -1):
        if len(game.connections) < 2: return
        await broadcast({**game.state(), "tap_remaining": remaining})
        await asyncio.sleep(1)
    ariel = game.taps["Ariel"]
    ella  = game.taps["Ella"]
    game.tap_winner = "Ariel" if ariel >= ella else "Ella"
    game.pick_order = game._alternate_order(game.tap_winner)
    game.phase      = "picking"
    await broadcast({**game.state(), "tap_remaining": 0})


@router.websocket("/ws/{player}")
async def spinner_ws(websocket: WebSocket, player: str):
    if player not in ("Ariel", "Ella"):
        await websocket.close(code=4001)
        return

    await websocket.accept()
    game.connections[player] = websocket
    registry.set_game(player, GAME_NAME)
    await broadcast(game.state())

    if len(game.connections) == 2 and game.phase == "waiting":
        for p in game.connections:
            registry.clear_game(p)
        game.phase = "tapping"
        await broadcast(game.state())
        if game.timer_task is None or game.timer_task.done():
            game.timer_task = asyncio.create_task(run_tap_timer())

    try:
        while True:
            raw  = await websocket.receive_text()
            data = json.loads(raw)
            if data.get("type") == "tap" and game.phase == "tapping":
                game.taps[player] += 1
                await broadcast(game.state())
            elif data.get("type") == "claim" and game.phase == "picking":
                index = data.get("index")
                if isinstance(index, int) and game.claim(player, index):
                    await broadcast(game.state())
            elif data.get("type") == "spin" and game.phase == "spinning":
                result = game.spin()
                await broadcast({**game.state(), **result})
            elif data.get("type") == "reset":
                game._reset()
                if len(game.connections) == 2:
                    game.phase = "tapping"
                    game.timer_task = asyncio.create_task(run_tap_timer())
                await broadcast(game.state())
    except WebSocketDisconnect:
        game.connections.pop(player, None)
        registry.clear_game(player)
        game._reset()
        await broadcast({**game.state(), "message": f"{player} disconnected."})