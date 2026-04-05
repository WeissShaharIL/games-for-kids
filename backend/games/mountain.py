import json
import asyncio
import random
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import online as registry

router = APIRouter()

GAME_NAME     = "Mountain Quiz 🏔️"
MOUNTAIN_MIN  = 0
SLIDE_WRONG   = 20
SLIDE_RIGHT   = 15
QUESTION_TIME = 15
COUNTDOWN     = 3
MIN_PLAYERS   = 2
MAX_PLAYERS   = 4


def generate_questions(n=80) -> list[dict]:
    questions = []
    for _ in range(n // 4):
        a = random.randint(1, 20); b = random.randint(1, 20); ans = a + b
        wrong = set()
        while len(wrong) < 3:
            w = ans + random.randint(-5, 5)
            if w != ans and w > 0: wrong.add(w)
        opts = list(wrong) + [ans]; random.shuffle(opts)
        questions.append({"q": f"{a} + {b} = ?", "answer": str(ans), "options": [str(o) for o in opts]})
    for _ in range(n // 4):
        a = random.randint(5, 30); b = random.randint(1, a); ans = a - b
        wrong = set()
        while len(wrong) < 3:
            w = ans + random.randint(-4, 4)
            if w != ans and w >= 0: wrong.add(w)
        opts = list(wrong) + [ans]; random.shuffle(opts)
        questions.append({"q": f"{a} - {b} = ?", "answer": str(ans), "options": [str(o) for o in opts]})
    for _ in range(n // 4):
        a = random.randint(2, 5); b = random.randint(1, 10); ans = a * b
        wrong = set()
        while len(wrong) < 3:
            w = ans + random.randint(-5, 5) * random.choice([1, 2])
            if w != ans and w > 0: wrong.add(w)
        opts = list(wrong) + [ans]; random.shuffle(opts)
        questions.append({"q": f"{a} × {b} = ?", "answer": str(ans), "options": [str(o) for o in opts]})
    for _ in range(n // 4):
        kind = random.choice(["add", "sub"])
        if kind == "add":
            a = random.randint(10, 50); b = random.randint(1, 20); ans = a + b; sym = "+"
        else:
            a = random.randint(10, 50); b = random.randint(1, a); ans = a - b; sym = "-"
        wrong = set()
        while len(wrong) < 3:
            w = ans + random.randint(-8, 8)
            if w != ans and w >= 0: wrong.add(w)
        opts = list(wrong) + [ans]; random.shuffle(opts)
        questions.append({"q": f"{a} {sym} {b} = ?", "answer": str(ans), "options": [str(o) for o in opts]})
    random.shuffle(questions)
    return questions


class MountainGame:
    def __init__(self):
        self.connections:  dict[str, WebSocket] = {}
        self.loop_task     = None
        self.answer_event  = asyncio.Event()
        self.host          = None   # first player to connect = host
        self._reset()

    def _reset(self):
        self.phase         = "lobby"   # lobby | countdown | playing | result
        self.countdown     = None
        self.positions     = {}
        self.eliminated    = []
        self.turn_order    = []
        self.turn_idx      = 0
        self.question      = None
        self.passed        = False
        self.passer        = None
        self.timer         = QUESTION_TIME
        self.winner        = None
        self.questions     = generate_questions(80)
        self.q_index       = 0
        self.last_result   = None
        self.answer_event  = asyncio.Event()
        # Keep positions for already-connected players
        for p in self.connections:
            if p not in self.positions:
                self.positions[p] = 80

    def _active(self) -> list[str]:
        return [p for p in self.turn_order if p in self.connections and p not in self.eliminated]

    def whose_turn(self) -> str | None:
        active = self._active()
        if not active: return None
        for _ in range(len(self.turn_order)):
            p = self.turn_order[self.turn_idx % len(self.turn_order)]
            if p in active: return p
            self.turn_idx += 1
        return None

    def advance_turn(self):
        self.turn_idx = (self.turn_idx + 1) % max(1, len(self.turn_order))

    def next_question(self):
        if self.q_index >= len(self.questions):
            self.questions = generate_questions(80)
            self.q_index   = 0
        self.question    = self.questions[self.q_index]
        self.q_index    += 1
        self.passed      = False
        self.passer      = None
        self.timer       = QUESTION_TIME
        self.last_result = None
        self.answer_event.clear()

    def answer(self, player: str, choice: str) -> dict:
        if self.whose_turn() != player or not self.question: return {}
        correct = choice == self.question["answer"]
        active  = self._active()
        if correct:
            others = [p for p in active if p != player]
            for opp in others:
                self.positions[opp] = max(MOUNTAIN_MIN, self.positions[opp] - SLIDE_RIGHT)
                if self.positions[opp] <= MOUNTAIN_MIN and opp not in self.eliminated:
                    self.eliminated.append(opp)
            result = {"player": player, "result": "correct", "slide_who": others, "slide_amt": SLIDE_RIGHT}
        else:
            self.positions[player] = max(MOUNTAIN_MIN, self.positions[player] - SLIDE_WRONG)
            if self.positions[player] <= MOUNTAIN_MIN and player not in self.eliminated:
                self.eliminated.append(player)
            result = {"player": player, "result": "wrong", "slide_who": [player], "slide_amt": SLIDE_WRONG}
        self.last_result = result
        remaining = self._active()
        if len(remaining) == 1: self.winner = remaining[0]
        elif len(remaining) == 0: self.winner = player
        self.answer_event.set()
        return result

    def do_pass(self, player: str) -> bool:
        if self.whose_turn() != player or self.passed: return False
        self.passed  = True
        self.passer  = player
        self.advance_turn()
        self.timer   = QUESTION_TIME
        self.answer_event.set()
        return True

    def state(self) -> dict:
        return {
            "type":        "state",
            "phase":       self.phase,
            "countdown":   self.countdown,
            "positions":   self.positions,
            "eliminated":  self.eliminated,
            "turn_order":  self.turn_order,
            "whose_turn":  self.whose_turn(),
            "passed":      self.passed,
            "passer":      self.passer,
            "timer":       self.timer,
            "winner":      self.winner,
            "question":    self.question,
            "last_result": self.last_result,
            "connected":   list(self.connections.keys()),
            "host":        self.host,
            "min_players": MIN_PLAYERS,
        }


game = MountainGame()


async def broadcast(msg: dict):
    dead = []
    for p, ws in game.connections.items():
        try: await ws.send_text(json.dumps(msg))
        except Exception: dead.append(p)
    for p in dead: game.connections.pop(p, None)


async def run_timed_question():
    game.answer_event.clear()
    game.timer = QUESTION_TIME
    await broadcast(game.state())
    for _ in range(QUESTION_TIME):
        try:
            await asyncio.wait_for(game.answer_event.wait(), timeout=1.0)
            return
        except asyncio.TimeoutError:
            game.timer -= 1
            await broadcast(game.state())
            if game.timer <= 0:
                if not game.passed: game.advance_turn()
                return


async def game_loop():
    for n in range(COUNTDOWN, 0, -1):
        if len(game.connections) < MIN_PLAYERS: return
        game.countdown = n
        await broadcast(game.state())
        await asyncio.sleep(1.0)

    game.countdown = 0; await broadcast(game.state()); await asyncio.sleep(0.3)
    game.countdown = None; game.phase = "playing"

    for p in game.connections: registry.clear_game(p)

    players = list(game.connections.keys())
    random.shuffle(players)
    game.turn_order = players
    game.turn_idx   = 0
    # All connected players start at 80%, late joiners handled on connect
    for p in players:
        game.positions[p] = 80
    game.eliminated = []
    game.next_question()

    while game.phase == "playing" and not game.winner:
        active = game._active()
        if len(active) < 2:
            if len(active) == 1: game.winner = active[0]
            game.phase = "result"; await broadcast(game.state()); return
        if len(game.connections) < MIN_PLAYERS: return

        await run_timed_question()
        if game.passed and not game.winner:
            await broadcast(game.state()); await asyncio.sleep(0.3)
            await run_timed_question()

        if game.winner:
            game.phase = "result"; await broadcast(game.state()); return

        await asyncio.sleep(1.5)
        if not game.passed: game.advance_turn()
        else: game.advance_turn()
        game.next_question()

    if game.winner:
        game.phase = "result"; await broadcast(game.state())


@router.websocket("/ws/{player}")
async def mountain_ws(websocket: WebSocket, player: str):
    await websocket.accept()
    game.connections[player] = websocket

    # First player becomes host
    if game.host is None:
        game.host = player

    # Set position: 80 if in lobby, or current position if game already running
    if player not in game.positions:
        game.positions[player] = 80

    # If game is already playing, add to turn order mid-game
    if game.phase == "playing" and player not in game.turn_order:
        game.turn_order.append(player)

    registry.set_game(player, GAME_NAME)
    await broadcast(game.state())

    try:
        while True:
            raw  = await websocket.receive_text()
            data = json.loads(raw)

            # Only host can start the game
            if data.get("type") == "start" and player == game.host:
                if game.phase == "lobby" and len(game.connections) >= MIN_PLAYERS:
                    game.phase = "countdown"
                    for p in game.connections: registry.clear_game(p)
                    if game.loop_task is None or game.loop_task.done():
                        game.loop_task = asyncio.create_task(game_loop())
                    await broadcast(game.state())

            elif data.get("type") == "answer" and game.phase == "playing":
                if game.whose_turn() == player and not game.winner:
                    result = game.answer(player, data.get("choice", ""))
                    if result: await broadcast(game.state())

            elif data.get("type") == "pass" and game.phase == "playing":
                if not game.passed and game.whose_turn() == player:
                    if game.do_pass(player):
                        game.answer_event.clear(); await broadcast(game.state())

            elif data.get("type") == "reset":
                if game.loop_task and not game.loop_task.done():
                    game.loop_task.cancel()
                game.host = player  # resetter becomes new host
                game._reset()
                await broadcast(game.state())

    except WebSocketDisconnect:
        game.connections.pop(player, None)
        registry.clear_game(player)
        # Transfer host if host left
        if player == game.host and game.connections:
            game.host = next(iter(game.connections))
        elif not game.connections:
            game.host = None
        if game.loop_task and not game.loop_task.done():
            game.loop_task.cancel(); game.loop_task = None
        game._reset()
        await broadcast({**game.state(), "message": f"{player} disconnected."})