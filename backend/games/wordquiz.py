import json
import asyncio
import random
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import online as registry

router = APIRouter()

GAME_NAME    = "Word Quiz 🔤"
TOTAL_ROUNDS = 20
ANSWER_TIME  = 8.0
BETWEEN_TIME = 2.0
COUNTDOWN    = 3

# Easy words only — common, simple English words kids know
WORDS = [
    {"word": "Apple",      "emoji": "🍎"},
    {"word": "Banana",     "emoji": "🍌"},
    {"word": "Grapes",     "emoji": "🍇"},
    {"word": "Strawberry", "emoji": "🍓"},
    {"word": "Orange",     "emoji": "🍊"},
    {"word": "Watermelon", "emoji": "🍉"},
    {"word": "Pineapple",  "emoji": "🍍"},
    {"word": "Cherry",     "emoji": "🍒"},
    {"word": "Lemon",      "emoji": "🍋"},
    {"word": "Peach",      "emoji": "🍑"},
    {"word": "Pear",       "emoji": "🍐"},
    {"word": "Dog",        "emoji": "🐶"},
    {"word": "Cat",        "emoji": "🐱"},
    {"word": "Lion",       "emoji": "🦁"},
    {"word": "Elephant",   "emoji": "🐘"},
    {"word": "Monkey",     "emoji": "🐒"},
    {"word": "Penguin",    "emoji": "🐧"},
    {"word": "Rabbit",     "emoji": "🐰"},
    {"word": "Tiger",      "emoji": "🐯"},
    {"word": "Bear",       "emoji": "🐻"},
    {"word": "Fox",        "emoji": "🦊"},
    {"word": "Frog",       "emoji": "🐸"},
    {"word": "Fish",       "emoji": "🐟"},
    {"word": "Bird",       "emoji": "🐦"},
    {"word": "Bee",        "emoji": "🐝"},
    {"word": "Car",        "emoji": "🚗"},
    {"word": "Bicycle",    "emoji": "🚲"},
    {"word": "Airplane",   "emoji": "✈️"},
    {"word": "Boat",       "emoji": "⛵"},
    {"word": "Train",      "emoji": "🚂"},
    {"word": "Bus",        "emoji": "🚌"},
    {"word": "Pizza",      "emoji": "🍕"},
    {"word": "Hamburger",  "emoji": "🍔"},
    {"word": "Ice Cream",  "emoji": "🍦"},
    {"word": "Cake",       "emoji": "🎂"},
    {"word": "Cookie",     "emoji": "🍪"},
    {"word": "Star",       "emoji": "⭐"},
    {"word": "Rainbow",    "emoji": "🌈"},
    {"word": "Fire",       "emoji": "🔥"},
    {"word": "Moon",       "emoji": "🌙"},
    {"word": "Sun",        "emoji": "☀️"},
    {"word": "Snowflake",  "emoji": "❄️"},
    {"word": "Heart",      "emoji": "❤️"},
    {"word": "Football",   "emoji": "⚽"},
    {"word": "Basketball", "emoji": "🏀"},
    {"word": "Balloon",    "emoji": "🎈"},
    {"word": "Gift",       "emoji": "🎁"},
    {"word": "Key",        "emoji": "🔑"},
    {"word": "Clock",      "emoji": "🕐"},
    {"word": "Umbrella",   "emoji": "☂️"},
    {"word": "House",      "emoji": "🏠"},
    {"word": "Tree",       "emoji": "🌳"},
    {"word": "Flower",     "emoji": "🌸"},
    {"word": "Crown",      "emoji": "👑"},
    {"word": "Diamond",    "emoji": "💎"},
    {"word": "Trophy",     "emoji": "🏆"},
    {"word": "Rocket",     "emoji": "🚀"},
    {"word": "Guitar",     "emoji": "🎸"},
    {"word": "Camera",     "emoji": "📷"},
    {"word": "Book",       "emoji": "📚"},
    {"word": "Pencil",     "emoji": "✏️"},
]


def make_round(used_words: list) -> dict:
    available = [w for w in WORDS if w["word"] not in used_words]
    if len(available) < 4:
        available = WORDS[:]
    correct = random.choice(available)
    wrong   = random.sample([w for w in WORDS if w["emoji"] != correct["emoji"]], 3)
    choices = [correct] + wrong
    random.shuffle(choices)
    return {
        "word":    correct["word"],
        "correct": correct["emoji"],
        "choices": [c["emoji"] for c in choices],
    }


class WordQuizGame:
    def __init__(self):
        self.connections: dict[str, WebSocket] = {}
        self.loop_task = None
        self.host      = None
        self._reset()

    def _reset(self):
        self.phase        = "lobby"
        self.countdown    = None
        self.round_num    = 0
        self.current      = None
        self.time_left    = ANSWER_TIME
        self.scores:      dict[str, int] = {}
        self.frozen:      set[str] = set()
        self.round_result = None
        self.used_words:  list[str] = []

    def _init_player(self, player: str):
        self.scores.setdefault(player, 0)

    def state(self) -> dict:
        return {
            "phase":        self.phase,
            "countdown":    self.countdown,
            "round_num":    self.round_num,
            "total_rounds": TOTAL_ROUNDS,
            "current":      self.current,
            "time_left":    round(self.time_left, 1),
            "scores":       self.scores,
            "frozen":       list(self.frozen),
            "round_result": self.round_result,
            "connected":    list(self.connections.keys()),
            "host":         self.host,
        }


game = WordQuizGame()


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
        game.countdown = n
        await broadcast(game.state())
        await asyncio.sleep(1.0)
    game.countdown = 0
    await broadcast(game.state())
    await asyncio.sleep(0.5)
    game.countdown = None
    game.phase = "playing"

    for round_idx in range(TOTAL_ROUNDS):
        if len(game.connections) < 1: break

        game.round_num    = round_idx + 1
        game.current      = make_round(game.used_words)
        game.used_words.append(game.current["word"])
        game.time_left    = ANSWER_TIME
        game.round_result = None
        game.frozen       = set()
        await broadcast(game.state())

        elapsed = 0.0
        while elapsed < ANSWER_TIME:
            await asyncio.sleep(0.1)
            elapsed += 0.1
            game.time_left = max(0, ANSWER_TIME - elapsed)
            await broadcast(game.state())
            if game.round_result is not None:
                break

        if game.round_result is None:
            game.round_result = {"winner": None, "correct": game.current["correct"], "word": game.current["word"]}
            await broadcast(game.state())

        await asyncio.sleep(BETWEEN_TIME)

    game.phase   = "result"
    game.current = None
    await broadcast(game.state())


@router.websocket("/ws/{player}")
async def wordquiz_ws(websocket: WebSocket, player: str):
    await websocket.accept()
    game.connections[player] = websocket
    game._init_player(player)
    if game.host is None or game.host not in game.connections:
        game.host = player
    if game.phase == "result":
        game._reset()
        game.connections[player] = websocket
        game._init_player(player)
        game.host = player
    registry.set_game(player, GAME_NAME)
    await broadcast(game.state())

    try:
        while True:
            raw  = await websocket.receive_text()
            data = json.loads(raw)

            if data.get("type") == "start" and player == game.host:
                if game.phase == "lobby" and len(game.connections) >= 2:
                    for p in game.connections:
                        registry.clear_game(p)
                        game._init_player(p)
                    game.phase = "countdown"
                    if game.loop_task is None or game.loop_task.done():
                        game.loop_task = asyncio.create_task(game_loop())
                    await broadcast(game.state())

            elif data.get("type") == "answer" and game.phase == "playing":
                emoji = data.get("emoji")
                if not emoji or game.current is None or game.round_result is not None:
                    continue
                if player in game.frozen:
                    continue
                if emoji == game.current["correct"]:
                    game.scores[player] = game.scores.get(player, 0) + 1
                    game.round_result   = {"winner": player, "correct": emoji, "word": game.current["word"]}
                    await broadcast(game.state())
                else:
                    # -1 point, add to frozen so they can't spam wrong answers
                    game.scores[player] = max(0, game.scores.get(player, 0) - 1)
                    game.frozen.add(player)
                    await broadcast(game.state())

            elif data.get("type") == "reset":
                if game.loop_task and not game.loop_task.done():
                    game.loop_task.cancel()
                    game.loop_task = None
                game._reset()
                game.host = player
                for p in game.connections:
                    game._init_player(p)
                await broadcast(game.state())

    except WebSocketDisconnect:
        game.connections.pop(player, None)
        registry.clear_game(player)
        if game.host == player and game.connections:
            game.host = next(iter(game.connections))
        await broadcast({**game.state(), "disconnected": player})