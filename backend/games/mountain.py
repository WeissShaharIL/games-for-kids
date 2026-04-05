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
        self._reset()

    def _reset(self):
        self.phase         = "waiting"
        self.countdown     = None
        self.positions     = {}
        self.eliminated    = []
        self.turn_order    = []
        self.turn_idx      = 0
        self.question      = None
        self.passed        = False      # was this question already passed once?
        self.passer        = None       # who originally passed?
        self.timer         = QUESTION_TIME
        self.winner        = None
        self.questions     = generate_questions(80)
        self.q_index       = 0
        self.last_result   = None
        self.answer_event  = asyncio.Event()
        for p in self.connections:
            self.positions[p] = 80

    def _active(self) -> list[str]:
        return [p for p in self.turn_order if p in self.connections and p not in self.eliminated]

    def whose_turn(self) -> str | None:
        active = self._active()
        if not active: return None
        for _ in range(len(self.turn_order)):
            p = self.turn_order[self.turn_idx % len(self.turn_order)]
            if p in active:
                return p
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
        self.passed      = False   # reset pass flag for each new question
        self.passer      = None
        self.timer       = QUESTION_TIME
        self.last_result = None
        self.answer_event.clear()

    def answer(self, player: str, choice: str) -> dict:
        if self.whose_turn() != player or not self.question:
            return {}
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
        if len(remaining) == 1:
            self.winner = remaining[0]
        elif len(remaining) == 0:
            self.winner = player

        self.answer_event.set()
        return result

    def do_pass(self, player: str) -> bool:
        """
        Pass rules:
        - Question can only be passed ONCE per question
        - Only the current turn player can pass
        - After passing, the recipient CANNOT pass back
        """
        if self.whose_turn() != player:
            return False
        if self.passed:
            # Already passed once — cannot pass again
            return False

        self.passed  = True
        self.passer  = player
        self.advance_turn()   # move to next player
        self.timer   = QUESTION_TIME
        self.answer_event.set()  # wake up timer loop
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
            "min_players": MIN_PLAYERS,
        }


game = MountainGame()


async def broadcast(msg: dict):
    dead = []
    for p, ws in game.connections.items():
        try:
            await ws.send_text(json.dumps(msg))
        except Exception:
            dead.append(p)
    for p in dead:
        game.connections.pop(p, None)


async def run_timed_question():
    """Run a question with countdown. Returns when answered, passed, or timed out."""
    game.answer_event.clear()
    game.timer = QUESTION_TIME
    await broadcast(game.state())

    for _ in range(QUESTION_TIME):
        try:
            await asyncio.wait_for(game.answer_event.wait(), timeout=1.0)
            # Woken up — either answered or passed
            return
        except asyncio.TimeoutError:
            game.timer -= 1
            await broadcast(game.state())
            if game.timer <= 0:
                # Timed out — advance turn, no slide
                if not game.passed:
                    game.advance_turn()
                return


async def game_loop():
    for n in range(COUNTDOWN, 0, -1):
        if len(game.connections) < MIN_PLAYERS: return
        game.countdown = n
        await broadcast(game.state())
        await asyncio.sleep(1.0)

    game.countdown = 0
    await broadcast(game.state())
    await asyncio.sleep(0.3)
    game.countdown = None
    game.phase     = "playing"

    for p in game.connections:
        registry.clear_game(p)

    players = list(game.connections.keys())
    random.shuffle(players)
    game.turn_order = players
    game.turn_idx   = 0
    for p in players:
        game.positions[p] = 80
    game.eliminated = []
    game.next_question()

    while game.phase == "playing" and not game.winner:
        active = game._active()
        if len(active) < 2:
            if len(active) == 1:
                game.winner = active[0]
            game.phase = "result"
            await broadcast(game.state())
            return
        if len(game.connections) < MIN_PLAYERS:
            return

        # Run question for current player
        await run_timed_question()

        # If it was passed — run again for new player (no further passing allowed)
        if game.passed and not game.winner:
            await broadcast(game.state())
            await asyncio.sleep(0.3)
            await run_timed_question()

        if game.winner:
            game.phase = "result"
            await broadcast(game.state())
            return

        # Pause to show result
        await asyncio.sleep(1.5)

        # Advance to next player for next question
        if not game.passed:
            game.advance_turn()
        else:
            # After a passed question, next turn goes to player after the passer
            # (turn_idx already advanced on pass, advance once more)
            game.advance_turn()

        game.next_question()

    if game.winner:
        game.phase = "result"
        await broadcast(game.state())


@router.websocket("/ws/{player}")
async def mountain_ws(websocket: WebSocket, player: str):
    await websocket.accept()
    game.connections[player] = websocket
    game.positions[player]   = 80
    registry.set_game(player, GAME_NAME)
    game._reset()
    await broadcast(game.state())

    if len(game.connections) >= MIN_PLAYERS and game.phase == "waiting":
        game.phase = "countdown"
        if game.loop_task is None or game.loop_task.done():
            game.loop_task = asyncio.create_task(game_loop())

    try:
        while True:
            raw  = await websocket.receive_text()
            data = json.loads(raw)

            if data.get("type") == "answer" and game.phase == "playing":
                if game.whose_turn() == player and not game.winner:
                    result = game.answer(player, data.get("choice", ""))
                    if result:
                        await broadcast(game.state())

            elif data.get("type") == "pass" and game.phase == "playing":
                if not game.passed and game.whose_turn() == player:
                    if game.do_pass(player):
                        game.answer_event.clear()
                        await broadcast(game.state())

            elif data.get("type") == "reset":
                if game.loop_task and not game.loop_task.done():
                    game.loop_task.cancel()
                game._reset()
                if len(game.connections) >= MIN_PLAYERS:
                    game.phase     = "countdown"
                    game.loop_task = asyncio.create_task(game_loop())
                await broadcast(game.state())

    except WebSocketDisconnect:
        game.connections.pop(player, None)
        registry.clear_game(player)
        if game.loop_task and not game.loop_task.done():
            game.loop_task.cancel()
            game.loop_task = None
        game._reset()
        await broadcast({**game.state(), "message": f"{player} disconnected."})