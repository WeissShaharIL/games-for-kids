import json
import asyncio
import random
import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import online as registry

router    = APIRouter()
GAME_NAME = "Chef Showdown"

DISHES = [
    {
        "id": "sushi_roll",
        "name": "Sushi Roll",
        "emoji": "🍣",
        "description": "a classic tuna sushi roll",
        "correct_order": ["🍚 Rice", "🌿 Nori", "🐟 Tuna", "🥒 Cucumber", "🥑 Avocado"],
        "extra_ingredients": ["🍋 Lemon", "🧂 Salt", "🧄 Garlic", "🧅 Onion", "🥕 Carrot", "🍄 Mushroom"],
    },
    {
        "id": "burger",
        "name": "Burger",
        "emoji": "🍔",
        "description": "a juicy classic cheeseburger",
        "correct_order": ["🍞 Bun", "🥬 Lettuce", "🍅 Tomato", "🥩 Patty", "🧀 Cheese", "🍞 Bun"],
        "extra_ingredients": ["🥒 Pickle", "🧅 Onion", "🥚 Egg", "🍄 Mushroom", "🌶️ Chili", "🍋 Lemon"],
    },
    {
        "id": "pizza",
        "name": "Pizza",
        "emoji": "🍕",
        "description": "a classic Margherita pizza",
        "correct_order": ["🫓 Dough", "🍅 Tomato Sauce", "🧀 Mozzarella", "🌿 Basil", "🫒 Olive Oil"],
        "extra_ingredients": ["🥩 Meat", "🌶️ Chili", "🧅 Onion", "🫑 Pepper", "🍄 Mushroom", "🥚 Egg"],
    },
    {
        "id": "taco",
        "name": "Taco",
        "emoji": "🌮",
        "description": "a spicy beef taco",
        "correct_order": ["🌯 Tortilla", "🥩 Beef", "🥬 Lettuce", "🍅 Salsa", "🧀 Cheese"],
        "extra_ingredients": ["🥑 Avocado", "🌶️ Chili", "🍋 Lemon", "🧅 Onion", "🥒 Cucumber", "🍄 Mushroom"],
    },
    {
        "id": "salad",
        "name": "Greek Salad",
        "emoji": "🥗",
        "description": "a fresh Greek salad",
        "correct_order": ["🥬 Lettuce", "🍅 Tomato", "🥒 Cucumber", "🫒 Olives", "🧀 Feta"],
        "extra_ingredients": ["🧅 Onion", "🫑 Pepper", "🍋 Lemon", "🧂 Salt", "🌿 Herbs", "🥕 Carrot"],
    },
]

JUDGES = [
    {"name": "Chef Marco", "emoji": "👨‍🍳", "style": "strict Italian chef"},
    {"name": "Judge Yuki", "emoji": "👩‍🍳", "style": "precise Japanese culinary expert"},
    {"name": "Gordon",     "emoji": "🧑‍🍳", "style": "brutally honest Gordon Ramsay-style chef"},
]


class ChefGame:
    def __init__(self):
        self.connections: dict[str, WebSocket] = {}
        self.loop_task = None
        self._reset()

    def _reset(self):
        self.phase         = "lobby"
        self.host          = None
        self.dish          = None
        self.all_ingredients: list[str] = []
        self.announce_step = 0
        self.start_time    = None
        self.submissions: dict[str, dict] = {}
        self.scores: dict[str, dict]      = {}
        self.ready_players: set           = set()

    def state(self) -> dict:
        d = {
            "phase":         self.phase,
            "connected":     list(self.connections.keys()),
            "host":          self.host,
            "announce_step": self.announce_step,
            "judges":        JUDGES,
            "scores":        self.scores,
            "ready_players": list(self.ready_players),
            "dish": {
                "name":            self.dish["name"],
                "emoji":           self.dish["emoji"],
                "description":     self.dish["description"],
                "all_ingredients": self.all_ingredients,
            } if self.dish else None,
        }
        if self.phase == "cooking" and self.start_time:
            d["time_left"] = max(0, 60 - int(time.time() - self.start_time))
        return d


game = ChefGame()


async def broadcast(msg: dict):
    dead = []
    for p, ws in game.connections.items():
        try:
            await ws.send_text(json.dumps(msg))
        except Exception:
            dead.append(p)
    for p in dead:
        game.connections.pop(p, None)


async def announce_and_cook():
    game.dish = random.choice(DISHES)
    all_ing = list(game.dish["correct_order"]) + list(game.dish["extra_ingredients"])
    random.shuffle(all_ing)
    game.all_ingredients = all_ing
    game.submissions = {}
    game.scores = {}
    game.phase = "announcing"
    game.announce_step = 0

    for step in range(len(JUDGES) + 2):
        game.announce_step = step
        await broadcast(game.state())
        await asyncio.sleep(1.2)

    # Wait for all players to press Ready
    game.phase = "ready"
    game.ready_players = set()
    await broadcast(game.state())

    # Poll until all ready (max 60s)
    for _ in range(120):
        await asyncio.sleep(0.5)
        if game.phase != "ready":
            return
        if game.ready_players >= set(game.connections.keys()):
            break

    game.phase = "cooking"
    game.start_time = time.time()
    await broadcast(game.state())

    for _ in range(60):
        await asyncio.sleep(1)
        if game.phase != "cooking":
            return
        await broadcast(game.state())

    if game.phase == "cooking":
        for name in list(game.connections.keys()):
            if name not in game.submissions:
                game.submissions[name] = {"ingredients": [], "time_taken": 60}
        await run_judging()


async def run_judging():
    game.phase = "judging"
    await broadcast(game.state())

    for player, submission in game.submissions.items():
        game.scores[player] = score_player(player, submission)
        await broadcast(game.state())
        await asyncio.sleep(0.5)  # small delay so judging screen shows each player populating

    game.phase = "podium"
    await broadcast(game.state())


def score_player(player: str, submission: dict) -> dict:
    correct    = game.dish["correct_order"]
    chosen     = submission["ingredients"]
    time_taken = submission["time_taken"]

    if not chosen:
        comments = [
            "An empty plate?! In my kitchen?!",
            "Nothing. You gave us nothing.",
            "This is the worst thing I have ever not eaten.",
        ]
        return {
            "judge_scores": [
                {"judge": j["name"], "score": 0, "comment": comments[i]}
                for i, j in enumerate(JUDGES)
            ],
            "total": 0, "speed_bonus": 0, "grand_total": 0,
        }

    correct_set = set(correct)
    chosen_set  = set(chosen)
    overlap     = len(correct_set & chosen_set)
    wrong       = len(chosen_set - correct_set)
    accuracy    = max(0, int((overlap / max(len(correct_set), 1)) * 10) - wrong)

    # Order bonus: how many correct ingredients are in the right relative order
    correct_chosen = [x for x in correct if x in chosen_set]
    order_score = sum(1 for i, ing in enumerate(correct_chosen) if chosen.count(ing) and chosen.index(ing) == correct.index(ing))
    order_bonus = min(2, order_score)

    speed_bonus = max(0, int((60 - time_taken) / 8))
    per_judge   = min(10, max(0, accuracy + order_bonus))
    total       = per_judge * 3

    # Judge comments based on score
    if per_judge >= 8:
        comments = [
            "Magnifico! Every ingredient in its place!",
            "Precise. Balanced. Respectful of the dish.",
            "Finally! Someone who knows what they're doing!",
        ]
    elif per_judge >= 5:
        comments = [
            "Not bad, but my grandmother could do better.",
            "Acceptable. Barely.",
            "It won't kill anyone. Probably.",
        ]
    else:
        comments = [
            "What is this? A disaster on a plate!",
            "The harmony is completely lost.",
            "I've seen better food at a petrol station.",
        ]

    return {
        "judge_scores": [
            {"judge": j["name"], "score": per_judge, "comment": comments[i]}
            for i, j in enumerate(JUDGES)
        ],
        "total":       total,
        "speed_bonus": speed_bonus,
        "grand_total": total + speed_bonus,
    }


@router.websocket("/ws/{player}")
async def chefshowdown_ws(websocket: WebSocket, player: str):
    await websocket.accept()

    game.connections[player] = websocket
    registry.set_game(player, GAME_NAME)

    if game.host is None:
        game.host = player

    await broadcast(game.state())

    try:
        while True:
            raw  = await websocket.receive_text()
            data = json.loads(raw)
            t    = data.get("type")

            if t == "start" and player == game.host and game.phase == "lobby":
                if len(game.connections) >= 2:
                    if game.loop_task is None or game.loop_task.done():
                        game.loop_task = asyncio.create_task(announce_and_cook())
                    await broadcast(game.state())

            elif t == "ready" and game.phase == "ready":
                game.ready_players.add(player)
                await broadcast(game.state())

            elif t == "submit" and game.phase == "cooking":
                if player not in game.submissions:
                    elapsed = time.time() - (game.start_time or time.time())
                    game.submissions[player] = {
                        "ingredients": data.get("ingredients", []),
                        "time_taken":  min(60, elapsed),
                    }
                    await broadcast(game.state())
                    if set(game.submissions.keys()) >= set(game.connections.keys()):
                        if game.loop_task and not game.loop_task.done():
                            game.loop_task.cancel()
                        game.loop_task = asyncio.create_task(run_judging())

            elif t == "restart" and player == game.host:
                if game.loop_task and not game.loop_task.done():
                    game.loop_task.cancel()
                game._reset()
                game.connections[player] = websocket
                game.host = player
                await broadcast(game.state())

    except WebSocketDisconnect:
        game.connections.pop(player, None)
        registry.clear_game(player)
        if game.host == player:
            game.host = next(iter(game.connections), None)
        if not game.connections:
            if game.loop_task and not game.loop_task.done():
                game.loop_task.cancel()
            game._reset()
        await broadcast(game.state())