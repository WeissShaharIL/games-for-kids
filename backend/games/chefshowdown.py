import json
import asyncio
import random
import time
import httpx
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import online as registry

router    = APIRouter()
GAME_NAME = "Chef Showdown"

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"

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
        "correct_order": ["🫓 Tortilla", "🥩 Beef", "🥬 Lettuce", "🍅 Salsa", "🧀 Cheese"],
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

    def state(self) -> dict:
        d = {
            "phase":         self.phase,
            "connected":     list(self.connections.keys()),
            "host":          self.host,
            "announce_step": self.announce_step,
            "judges":        JUDGES,
            "scores":        self.scores,
            "submissions":   {p: {"time_taken": v["time_taken"]} for p, v in self.submissions.items()},
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
        score_data = await ai_score(player, submission)
        game.scores[player] = score_data
        await broadcast(game.state())

    game.phase = "podium"
    await broadcast(game.state())


async def ai_score(player: str, submission: dict) -> dict:
    correct    = game.dish["correct_order"]
    chosen     = submission["ingredients"]
    time_taken = submission["time_taken"]

    prompt = f"""You are scoring a cooking competition. The dish is: {game.dish["name"]} ({game.dish["description"]}).

The correct ingredients in the right order are: {', '.join(correct)}

The player "{player}" used these ingredients in this order: {', '.join(chosen) if chosen else '(nothing)'}
They took {time_taken:.0f} seconds out of 60.

You are 3 judges: {', '.join([f"{j['emoji']} {j['name']} ({j['style']})" for j in JUDGES])}

Score this player. Be fun, dramatic, short, and in character. Consider correct ingredients, wrong extras, order accuracy, and speed.

Respond ONLY with valid JSON, no markdown:
{{
  "judge_scores": [
    {{"judge": "Chef Marco", "score": 7, "comment": "one short dramatic sentence"}},
    {{"judge": "Judge Yuki", "score": 8, "comment": "one short dramatic sentence"}},
    {{"judge": "Gordon",     "score": 6, "comment": "one short dramatic sentence"}}
  ],
  "total": 21,
  "speed_bonus": 5,
  "grand_total": 26
}}"""

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                ANTHROPIC_API_URL,
                headers={"Content-Type": "application/json"},
                json={
                    "model": "claude-sonnet-4-20250514",
                    "max_tokens": 400,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            text = resp.json()["content"][0]["text"].strip()
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            return json.loads(text.strip())
    except Exception:
        correct_set = set(correct)
        chosen_set  = set(chosen)
        overlap     = len(correct_set & chosen_set)
        accuracy    = int((overlap / max(len(correct_set), 1)) * 10)
        speed_bonus = max(0, int((60 - time_taken) / 6))
        return {
            "judge_scores": [
                {"judge": j["name"], "score": accuracy, "comment": "Interesting attempt..."}
                for j in JUDGES
            ],
            "total":       accuracy * 3,
            "speed_bonus": speed_bonus,
            "grand_total": accuracy * 3 + speed_bonus,
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